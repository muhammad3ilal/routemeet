// services/overpass.js
//
// Thin wrapper around the free OpenStreetMap Overpass API for finding
// venues (cafes, restaurants, parks, etc.) near a point. Used to turn a
// bare "fair meeting point" coordinate into an actual suggested place
// once the group has said what they want to do there.
//
// The group types free text ("grab coffee", "bowlin", "sushi tonight").
// We try to map that onto a curated OSM tag filter first (typo-tolerant,
// via Levenshtein distance against a synonym list) because a tag filter
// gives much more precise results than a name search. If nothing matches
// confidently, we fall back to a generic name/cuisine regex search so
// unusual requests still hit real map data instead of failing outright.

const OVERPASS_URL = process.env.OVERPASS_BASE_URL || "https://overpass-api.de/api/interpreter";
const USER_AGENT = "RouteMeet/1.0 (educational project; contact: muhammadbilal0509@gmail.com)";
const SEARCH_RADIUS_METERS = 1500;

export const ACTIVITIES = {
  coffee: {
    label: "Coffee",
    filter: '["amenity"="cafe"]',
    synonyms: ["coffee", "cafe", "espresso", "latte", "cappuccino", "coffee shop"],
  },
  food: {
    label: "Food",
    filter: '["amenity"="restaurant"]',
    synonyms: ["food", "restaurant", "dinner", "lunch", "breakfast", "brunch", "dining", "eat"],
  },
  drinks: {
    label: "Drinks",
    filter: '["amenity"~"^(bar|pub)$"]',
    synonyms: ["drinks", "bar", "pub", "beer", "cocktail", "cocktails", "wine", "brewery", "happy hour"],
  },
  park: {
    label: "Park",
    filter: '["leisure"="park"]',
    synonyms: ["park", "outdoors", "picnic", "nature"],
  },
  bowling: {
    label: "Bowling",
    filter: '["leisure"="bowling_alley"]',
    synonyms: ["bowling", "bowl"],
  },
  movies: {
    label: "Movies",
    filter: '["amenity"="cinema"]',
    synonyms: ["movies", "movie", "cinema", "film", "theater", "theatre"],
  },
  museum: {
    label: "Museum",
    filter: '["tourism"="museum"]',
    synonyms: ["museum", "gallery", "exhibit"],
  },
  gym: {
    label: "Gym",
    filter: '["leisure"="fitness_centre"]',
    synonyms: ["gym", "workout", "fitness", "exercise"],
  },
  icecream: {
    label: "Ice cream",
    filter: '["shop"="ice_cream"]',
    synonyms: ["ice cream", "gelato", "froyo", "frozen yogurt"],
  },
  shopping: {
    label: "Shopping",
    filter: '["shop"="mall"]',
    synonyms: ["shopping", "mall"],
  },
  arcade: {
    label: "Arcade",
    filter: '["leisure"="amusement_arcade"]',
    synonyms: ["arcade", "game center", "gaming"],
  },
  library: {
    label: "Library",
    filter: '["amenity"="library"]',
    synonyms: ["library", "books"],
  },
  bakery: {
    label: "Bakery",
    filter: '["shop"="bakery"]',
    synonyms: ["bakery", "pastries", "donuts", "dessert"],
  },
};

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function typoThreshold(len) {
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
}

function titleCase(text) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Turn free text ("grab a coffee", "bowlin", "sushi") into a resolved
 * activity: either a known curated category (typo-corrected) or a
 * generic free-text term to search venue names/cuisines for directly.
 */
export function resolveActivity(rawText) {
  const text = normalize(rawText);
  if (!text) return null;

  // Exact/substring match against a synonym is the strongest signal.
  for (const [key, meta] of Object.entries(ACTIVITIES)) {
    for (const syn of meta.synonyms) {
      if (text.includes(syn)) {
        return { key, label: meta.label, term: null };
      }
    }
  }

  // No exact hit -- try typo-tolerant fuzzy matching per word.
  const tokens = text.split(" ").filter((t) => t.length >= 3);
  let best = null;
  for (const [key, meta] of Object.entries(ACTIVITIES)) {
    for (const syn of meta.synonyms) {
      if (syn.includes(" ")) continue; // fuzzy match single-word synonyms only
      for (const tok of tokens) {
        const dist = levenshtein(tok, syn);
        if (dist <= typoThreshold(syn.length) && (!best || dist < best.score)) {
          best = { key, score: dist };
        }
      }
    }
  }
  if (best) {
    return { key: best.key, label: ACTIVITIES[best.key].label, term: null };
  }

  // Nothing recognized -- fall back to a generic name/cuisine search so
  // we still use real map data instead of giving up.
  return { key: null, label: titleCase(text), term: text };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// The public Overpass instance enforces a small per-IP concurrency limit
// and answers overlapping requests with a 504. Serializing calls through
// this queue (same pattern as Nominatim's throttle) avoids that even
// when several candidates are looked up "at once" via Promise.all.
let queue = Promise.resolve();
const MIN_REQUEST_GAP_MS = 600;
let lastRequestAt = 0;

function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

function buildQuery(lat, lon, resolved, limit) {
  const r = SEARCH_RADIUS_METERS;
  if (resolved.key) {
    const filter = ACTIVITIES[resolved.key].filter;
    return (
      `[out:json][timeout:15];` +
      `(node${filter}(around:${r},${lat},${lon});way${filter}(around:${r},${lat},${lon}););` +
      `out center ${limit * 4};`
    );
  }
  // Generic fallback: `resolved.term` was normalized to [a-z0-9\s] only
  // by resolveActivity(), so it's already safe to embed directly.
  const term = resolved.term;
  return (
    `[out:json][timeout:15];` +
    `(node["name"~"${term}",i](around:${r},${lat},${lon});` +
    `way["name"~"${term}",i](around:${r},${lat},${lon});` +
    `node["cuisine"~"${term}",i](around:${r},${lat},${lon}););` +
    `out center ${limit * 4};`
  );
}

/**
 * Find venues matching a resolved activity near a point. Never throws --
 * returns [] if Overpass is unavailable, so a flaky third-party outage
 * degrades gracefully instead of failing the whole /api/optimize request.
 */
export async function findVenuesNear(lat, lon, resolved, limit = 4) {
  if (!resolved) return [];
  const query = buildQuery(lat, lon, resolved, limit);

  try {
    return await throttled(async () => {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) return [];
      const data = await res.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];

      return elements
        .map((el) => {
          const vLat = el.lat ?? el.center?.lat;
          const vLon = el.lon ?? el.center?.lon;
          const name = el.tags?.name;
          if (vLat == null || vLon == null || !name) return null;
          return {
            name,
            lat: vLat,
            lon: vLon,
            distanceMeters: Math.round(haversineMeters(lat, lon, vLat, vLon)),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, limit);
    });
  } catch {
    return [];
  }
}
