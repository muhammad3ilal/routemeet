// routes/optimize.js
//
// POST /api/optimize
//
// Body: { addresses: string[] }
// Response: {
//   origins: [{ address, lat, lon }],
//   fairest: [...top candidates by max-travel-time...],
//   fastest: [...top candidates by total-travel-time...],
// }

import { Router } from "express";
import { geocodeAddress, reverseGeocode } from "../services/nominatim.js";
import { getTravelTimeMatrix } from "../services/osrm.js";
import { generateCandidates } from "../services/candidates.js";
import { scoreCandidates, buildTopResults } from "../services/fairness.js";
import { resolveActivity, findVenuesNear } from "../services/overpass.js";

const router = Router();

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 8;
const TOP_N = 3;
// When an activity is requested, look at more than just the top 3 fair
// candidates before picking what to show -- so we can prefer ones that
// actually have the requested venue nearby instead of recommending a
// mathematically-fair point that happens to be a dead spot.
const VENUE_POOL_SIZE = 4;

router.post("/optimize", async (req, res) => {
  const { addresses, activity } = req.body || {};
  const resolvedActivity = typeof activity === "string" ? resolveActivity(activity) : null;
  const wantsVenues = resolvedActivity !== null;

  if (!Array.isArray(addresses) || addresses.length < MIN_PEOPLE) {
    return res.status(400).json({
      error: `Provide at least ${MIN_PEOPLE} addresses.`,
    });
  }
  if (addresses.length > MAX_PEOPLE) {
    return res.status(400).json({
      error: `RouteMeet supports up to ${MAX_PEOPLE} people per request.`,
    });
  }
  if (addresses.some((a) => typeof a !== "string" || !a.trim())) {
    return res.status(400).json({ error: "All addresses must be non-empty strings." });
  }

  try {
    // Step 1: geocode every address. Nominatim is rate-limited to
    // ~1 req/sec, so this runs sequentially (see services/nominatim.js).
    const geocoded = [];
    for (const address of addresses) {
      const result = await geocodeAddress(address);
      geocoded.push({ address, ...result });
    }
    const origins = geocoded.map(({ lat, lon }) => ({ lat, lon }));
    const originLabels = geocoded.map((g) => g.address);

    // Step 2: build a grid of candidate meeting points around everyone.
    const candidates = generateCandidates(origins);

    // Step 3: one OSRM request scores every origin against every
    // candidate simultaneously (a full travel-time matrix).
    const durations = await getTravelTimeMatrix(origins, candidates);

    // Step 4: rank candidates by fairness (min worst-case time) and
    // by efficiency (min total time).
    const { fairest, fastest } = scoreCandidates(candidates, durations, originLabels);

    if (fairest.length === 0) {
      return res.status(422).json({
        error:
          "No reachable meeting point was found by road for all addresses. " +
          "Try addresses that are connected by road (e.g. not separated by an ocean).",
      });
    }

    let topFairest;
    let topFastest;
    let venuesByKey = new Map();

    if (wantsVenues) {
      // Look at a wider pool than we'll actually show, so a fair point
      // with nothing to do there can be passed over in favor of a
      // slightly-less-fair one that has an actual venue nearby.
      const poolFairest = fairest.slice(0, VENUE_POOL_SIZE);
      const poolFastest = fastest.slice(0, VENUE_POOL_SIZE);
      const pool = dedupeByCoords([...poolFairest, ...poolFastest]);

      await Promise.all(
        pool.map(async (c) => {
          venuesByKey.set(coordKey(c), await findVenuesNear(c.lat, c.lon, resolvedActivity));
        })
      );

      const preferVenues = (list) => {
        const withVenue = [];
        const withoutVenue = [];
        for (const c of list) {
          const hasVenue = (venuesByKey.get(coordKey(c)) || []).length > 0;
          (hasVenue ? withVenue : withoutVenue).push(c);
        }
        return [...withVenue, ...withoutVenue];
      };

      topFairest = preferVenues(poolFairest).slice(0, TOP_N).map((c) => ({ ...c, strategy: "fairest" }));
      topFastest = preferVenues(poolFastest).slice(0, TOP_N).map((c) => ({ ...c, strategy: "fastest" }));
    } else {
      ({ topFairest, topFastest } = buildTopResults(fairest, fastest, TOP_N));
    }

    // Step 5: attach human-readable place names to the results we're
    // actually going to show (keeps Nominatim calls to a minimum).
    const uniqueCandidates = dedupeByCoords([...topFairest, ...topFastest]);
    const nameByKey = new Map();
    for (const c of uniqueCandidates) {
      const name = await reverseGeocode(c.lat, c.lon);
      nameByKey.set(coordKey(c), name);
    }

    for (const c of [...topFairest, ...topFastest]) {
      c.placeName = nameByKey.get(coordKey(c));
      if (wantsVenues) {
        c.venues = venuesByKey.get(coordKey(c)) || [];
      }
    }

    res.json({
      origins: geocoded.map(({ address, lat, lon, displayName }) => ({
        address,
        resolvedAddress: displayName,
        lat,
        lon,
      })),
      fairest: topFairest,
      fastest: topFastest,
      activityLabel: wantsVenues ? resolvedActivity.label : null,
    });
  } catch (err) {
    if (err.code === "GEOCODE_NOT_FOUND") {
      return res.status(422).json({ error: err.message });
    }
    console.error(err);
    res.status(502).json({
      error: "RouteMeet couldn't compute a result right now. Please try again shortly.",
    });
  }
});

function coordKey(c) {
  return `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
}

function dedupeByCoords(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = coordKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export default router;
