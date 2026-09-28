import express from "express";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { MapTilerProvider } from "./providers/maptiler.js";
import { ServiceError } from "./errors.js";
import { DemoProvider } from "./providers/demo.js";
import { OverpassProvider } from "./providers/overpass.js";
import { distanceKm } from "./algorithms/search.js";
import { optimizeVenues } from "./algorithms/optimizer.js";
import { getMeetingArea, initialComparisonVenues, compareVenues, buildCatalog } from "./algorithms/catalog.js";
import { validateTrip, text } from "./validation.js";

export function createApp({
  database,
  maptilerKey = "",
  maptilerProvider,
  venueProvider,
  routingUrl,
  overpassUrl,
  allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"],
  requestLimit = 200,
  elementLimit = 2000,
  secureCookies = false,
}) {
  const app = express(),
    searches = new Map(),
    rates = new Map();
  const providers = {
    demo: new DemoProvider(),
    maptiler:
      maptilerProvider ||
      new MapTilerProvider({
        key: maptilerKey,
        routingUrl,
        consume: (elements) =>
          database.consume(elements, requestLimit, elementLimit),
      }),
  };
  const venueSource = venueProvider || new OverpassProvider({
    url: overpassUrl,
    consume: () => database.consume(0, requestLimit, elementLimit),
  });
  const comparisonFailure = "Driving times are temporarily unavailable. You can still browse every place and retry a comparison.";
  const maxCachedVenues = 50000;
  app.disable("x-powered-by");
  app.use(express.json({ limit: "24kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      ["POST", "PUT", "PATCH"].includes(req.method) &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    )
      return res.status(400).json({ error: "Send a JSON object." });
    if (
      (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) ||
      (req.method !== "GET" && req.headers["x-routemeet-client"] !== "planner")
    )
      return res
        .status(403)
        .json({
          error: "Open RouteMeet in its own browser tab and try again.",
        });
    const match = /(?:^|;\s*)routemeet_owner=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    );
    const token = match?.[1] || randomBytes(32).toString("hex");
    if (!match)
      res.setHeader(
        "Set-Cookie",
        `routemeet_owner=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=31536000${secureCookies ? "; Secure" : ""}`,
      );
    req.owner = createHash("sha256").update(token).digest("hex");
    const now = Date.now();
    for (const [key, value] of rates) if (value.until < now) rates.delete(key);
    const rate = rates.get(req.owner) || { until: now + 60000, count: 0 };
    if (++rate.count > 60 || rates.size > 5000)
      return res
        .status(429)
        .json({ error: "Too many requests. Wait a minute and try again." });
    rates.set(req.owner, rate);
    const controller = new AbortController();
    req.plannerSignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(60000),
    ]);
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    next();
  });
  const route = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch(next);
  function provider(mode) {
    if (!providers[mode]) throw new ServiceError("Unknown data source.", 400);
    return providers[mode];
  }
  function getSearch(req) {
    const item = searches.get(req.body.searchId);
    if (!item || item.owner !== req.owner || item.expires < Date.now())
      throw new ServiceError(
        "This search has expired. Find places again to refresh it.",
        410,
        "SEARCH_EXPIRED",
      );
    const venue = item.result.candidates.find((v) => v.id === req.body.venueId);
    if (!venue)
      throw new ServiceError("Choose a place from your current results.", 400);
    return { item, venue };
  }
  function startComparison(item, venue) {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
    const entry = { controller, waiters: 0, settled: false, promise: null };
    item.comparisons.set(venue.id, entry);
    entry.promise = (async () => {
      try {
        let checked;
        try {
          const matrix = await provider(item.result.mode).matrix(item.result.origins, [venue], signal);
          signal.throwIfAborted();
          [checked] = compareVenues(item.result.origins, [venue], matrix);
        } catch (error) {
          signal.throwIfAborted();
          throw new ServiceError(comparisonFailure, error.status === 429 ? 429 : 503, "COMPARISON_UNAVAILABLE");
        }
        // Comparing one place never promotes it to a global recommendation.
        Object.assign(venue, checked, { recommended: item.result.recommendedIds.includes(venue.id) });
        item.result.diagnostics.comparedVenues++;
        item.result.diagnostics.pendingVenues--;
        return venue;
      } finally {
        entry.settled = true;
        if (item.comparisons.get(venue.id) === entry) item.comparisons.delete(venue.id);
      }
    })();
    return entry;
  }
  function waitForComparison(entry, signal) {
    signal.throwIfAborted();
    entry.waiters++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (settle, value) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", onAbort);
        entry.waiters--;
        // One caller changing their selection must not cancel another caller
        // waiting for the same place, but abandoned work should stop promptly.
        if (!entry.waiters && !entry.settled) entry.controller.abort();
        settle(value);
      };
      const onAbort = () => finish(reject, signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      entry.promise.then((venue) => finish(resolve, venue), (error) => finish(reject, error));
    });
  }
  app.get("/api/config", (_req, res) =>
    res.json({
      maptilerConfigured: Boolean(maptilerKey || maptilerProvider),
      demoAvailable: true,
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", service: "routemeet", storage: "sqlite" }),
  );
  app.post(
    "/api/places/search",
    route(async (req, res) =>
      res.json({
        places: await provider(req.body.mode).searchPlaces(
          text(req.body.query, "Search"),
          req.plannerSignal,
        ),
      }),
    ),
  );
  app.post(
    "/api/optimize",
    route(async (req, res) => {
      const input = validateTrip(req.body),
        source = provider(input.mode),
        origins = [];
      const radiusKm = req.body.radiusKm;
      if (radiusKm != null && (!Number.isInteger(radiusKm) || radiusKm < 3 || radiusKm > 50))
        throw new ServiceError("Choose a search radius from 3 to 50 km, or use Automatic.", 400, "VALIDATION");
      for (const p of input.participants) {
        const place = await source.place(p.placeId, req.plannerSignal);
        origins.push({
          ...p,
          lat: place.lat,
          lon: place.lon,
          resolvedAddress: place.address,
          attributions: place.attributions,
        });
      }
      if (origins.some((a) => origins.some((b) => distanceKm(a, b) > 300)))
        throw new ServiceError(
          "This version supports groups within 300 km of each other. Choose closer starting places.",
          422,
          "REGION_TOO_LARGE",
        );
      const searchArea = getMeetingArea(origins, radiusKm);
      const discovery = input.mode === "demo"
        ? { venues: await source.searchVenues(searchArea, input.activity, req.plannerSignal), diagnostics: {
          venueSource: "Fictional example data", coverageNote: "These are the eight fictional example places, not a real-world directory.", searchQueries: 1,
        } }
        : await venueSource.searchArea(searchArea, input.activity, req.plannerSignal);
      req.plannerSignal.throwIfAborted();
      const venues = [...new Map(discovery.venues.map((venue) => [venue.id, venue])).values()];
      if (!venues.length)
        throw new ServiceError(
          "No matching places were returned in this area. Try a larger search area or another activity.",
          422,
          "NO_VENUES",
        );
      if (venues.length > maxCachedVenues)
        throw new ServiceError(
          "This area contains too many places to keep open at once. Choose a smaller search area.",
          422,
          "AREA_TOO_LARGE",
        );
      const sample = initialComparisonVenues(origins, venues);
      let comparisons = [], recommendedIds = [], comparisonError = null, rankingDiagnostics = {};
      try {
        const matrix = await source.matrix(origins, sample, req.plannerSignal);
        req.plannerSignal.throwIfAborted();
        comparisons = compareVenues(origins, sample, matrix);
        const result = optimizeVenues(origins, sample, matrix);
        recommendedIds = result.candidates.map((venue) => venue.id);
        rankingDiagnostics = result.diagnostics;
      } catch {
        req.plannerSignal.throwIfAborted();
        // A routing quota or outage must not remove places from the directory.
        comparisonError = comparisonFailure;
      }
      const candidates = buildCatalog(venues, comparisons, recommendedIds);
      for (const [id, item] of searches)
        if (item.expires < Date.now()) searches.delete(id);
      let cachedVenueCount = [...searches.values()].reduce((count, item) => count + item.result.candidates.length, 0);
      while (searches.size && (searches.size >= 200 || cachedVenueCount + candidates.length > maxCachedVenues)) {
        const oldest = searches.keys().next().value;
        cachedVenueCount -= searches.get(oldest).result.candidates.length;
        searches.delete(oldest);
      }
      const searchId = randomUUID();
      const response = {
        candidates,
        recommendedIds,
        comparisonError,
        searchArea,
        searchId,
        origins,
        mode: input.mode,
        activity: input.activity,
        objective: input.objective,
        diagnostics: {
          ...rankingDiagnostics,
          ...discovery.diagnostics,
          discoveredVenues: candidates.length,
          totalVenues: candidates.length,
          initialEvaluatedVenues: comparisons.length,
          comparedVenues: comparisons.length,
          pendingVenues: candidates.length - comparisons.length,
          searchCenter: { lat: searchArea.lat, lon: searchArea.lon },
          searchRadiusKm: searchArea.radiusMeters / 1000,
          recommendationScope: `Recommendations compare driving times for ${comparisons.length} of ${candidates.length} places, chosen initially for their central location. Every other place remains available to compare.`,
        },
        traffic:
          input.mode === "demo"
            ? "synthetic example"
            : "OSRM driving estimates; no live traffic",
      };
      searches.set(searchId, {
        owner: req.owner,
        result: response,
        expires: Date.now() + 10 * 60000,
        comparisons: new Map(),
      });
      res.json(response);
    }),
  );
  app.post(
    "/api/venues/compare",
    route(async (req, res) => {
      const { item, venue } = getSearch(req);
      req.plannerSignal.throwIfAborted();
      if (venue.comparisonStatus !== "pending") return res.json({ venue });
      let entry = item.comparisons.get(venue.id);
      if (!entry || entry.controller.signal.aborted) entry = startComparison(item, venue);
      res.json({ venue: await waitForComparison(entry, req.plannerSignal) });
    }),
  );
  app.post(
    "/api/routes",
    route(async (req, res) => {
      const { item, venue } = getSearch(req);
      res.json({
        routes: await provider(item.result.mode).routes(
          item.result.origins,
          venue,
          req.plannerSignal,
        ),
        venueId: venue.id,
      });
    }),
  );
  app.get("/api/groups", (req, res) =>
    res.json({ groups: database.groups(req.owner) }),
  );
  app.post(
    "/api/groups",
    route(async (req, res) => {
      const trip = validateTrip(req.body),
        name = text(req.body.name, "Group name", 80);
      if (database.groups(req.owner).length >= 50)
        throw new ServiceError(
          "You can save up to 50 groups. Remove one before adding another.",
          409,
        );
      res
        .status(201)
        .json({ id: database.saveGroup(req.owner, { ...trip, name }) });
    }),
  );
  app.delete("/api/groups/:id", (req, res) =>
    res
      .status(database.deleteGroup(req.owner, req.params.id) ? 204 : 404)
      .end(),
  );
  app.get("/api/meetups", (req, res) =>
    res.json({ meetups: database.meetups(req.owner) }),
  );
  app.get("/api/meetups/:id/place", route(async (req, res) => {
    const meetup = database.meetups(req.owner).find((m) => m.id === req.params.id);
    if (!meetup) throw new ServiceError("Saved meetup not found.", 404);
    if (meetup.mode !== "maptiler") throw new ServiceError("Search again to choose this place with MapTiler.", 422);
    const source = meetup.venueId.startsWith("osm:") ? venueSource : provider("maptiler");
    res.json({ place: await source.place(meetup.venueId, req.plannerSignal) });
  }));
  app.post(
    "/api/meetups",
    route(async (req, res) => {
      const { item, venue } = getSearch(req);
      const id = database.saveMeetup(req.owner, {
        label: text(req.body.label, "Meetup name", 80),
        venueId: venue.id,
        mode: item.result.mode,
        activity: item.result.activity,
        objective: item.result.objective,
      });
      res.status(201).json({ id });
    }),
  );
  app.delete("/api/meetups/:id", (req, res) =>
    res
      .status(database.deleteMeetup(req.owner, req.params.id) ? 204 : 404)
      .end(),
  );
  app.use((error, _req, res, _next) => {
    const timeout = ["TimeoutError", "AbortError"].includes(error.name),
      invalidJson = error.type === "entity.parse.failed";
    const status = timeout ? 504 : invalidJson ? 400 : error.status || 500;
    res
      .status(status)
      .json({
        error: timeout
          ? "The search timed out. Please try again."
          : invalidJson
            ? "Send a valid JSON request."
            : status < 500 || error instanceof ServiceError
              ? error.message
              : "Something went wrong. Please try again.",
        code: error.code || "REQUEST_ERROR",
      });
  });
  return app;
}
