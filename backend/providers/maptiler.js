import { setTimeout as delay } from "node:timers/promises";
import { ServiceError } from "../errors.js";

const coordinate = (p) => `${p.lon},${p.lat}`;
const validCoordinate = ([lon, lat] = []) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
export function normalizeFeature(feature) {
  const center = feature.center || (feature.geometry?.type === "Point" ? feature.geometry.coordinates : []);
  if (typeof feature.id !== "string" || !validCoordinate(center)) return null;
  const [lon, lat] = center;
  return { id: feature.id, name: feature.text || "Meeting place", address: feature.place_name || feature.text || "", lat, lon,
    attributions: [], mapsUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}` };
}
export function decodeMatrix(data, rows, columns) {
  if (data.code !== "Ok" || !Array.isArray(data.durations) || data.durations.length !== rows || data.durations.some((r) => !Array.isArray(r) || r.length !== columns))
    throw new ServiceError("The routing service returned an invalid travel-time matrix.");
  return data.durations.map((r) => r.map((n) => Number.isFinite(n) && n >= 0 ? n : null));
}
export function decodeRoute(data) {
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !Number.isFinite(route?.duration) || route.duration < 0)
    throw new ServiceError("No driving route is available for this place. Choose another result.", 422, "NO_ROUTE");
  const points = route.geometry?.coordinates;
  if (route.geometry?.type !== "LineString" || !Array.isArray(points) || points.length < 2 || !points.every(validCoordinate))
    throw new ServiceError("The routing service did not return a drawable route.");
  return { seconds: route.duration, distanceMeters: route.distance, path: points.map(([lon, lat]) => ({ lat, lon })) };
}

export class MapTilerProvider {
  constructor({ key = "", routingUrl = "https://router.project-osrm.org", fetchImpl = fetch, consume = () => {}, routingIntervalMs } = {}) {
    this.key = key;
    this.fetch = fetchImpl;
    this.consume = consume;
    const base = new URL(routingUrl);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("OSRM_URL must be an HTTP(S) base URL without credentials or query parameters.");
    this.routingUrl = base.href.replace(/\/$/, "");
    this.interval = routingIntervalMs ?? (base.hostname === "router.project-osrm.org" ? 1100 : 0);
    this.routingQueue = Promise.resolve();
    this.lastRouteRequest = 0;
  }
  async json(url, signal, label, elements = 0) {
    signal?.throwIfAborted();
    this.consume(elements);
    let response;
    try {
      response = await this.fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000), headers: { "User-Agent": "RouteMeet/1.0 (https://github.com/muhammad3ilal/routemeet)", Accept: "application/json" } });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ServiceError(`${label} could not be reached. Please try again.`, 504, "PROVIDER_TIMEOUT");
    }
    if ([401, 403].includes(response.status)) throw new ServiceError(`${label} rejected its credentials or access restrictions. Check the local configuration.`, 503, "PROVIDER_CONFIGURATION");
    if (response.status === 429) throw new ServiceError(`${label} is at its request limit. Try again later.`, 429, "PROVIDER_LIMIT");
    if (!response.ok) throw new ServiceError(`${label} could not complete this lookup. Try another place.`);
    try { return await response.json(); } catch { throw new ServiceError(`${label} returned an unreadable response.`); }
  }
  async geocode(query, params, signal) {
    if (!this.key) throw new ServiceError("MapTiler is not connected yet. Try the example or follow the setup guide.", 503, "MAPTILER_NOT_CONFIGURED");
    const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
    url.searchParams.set("key", this.key);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const data = await this.json(url, signal, "MapTiler");
    if (!Array.isArray(data.features)) throw new ServiceError("MapTiler returned an invalid place response.");
    return data.features.map(normalizeFeature).filter(Boolean);
  }
  searchPlaces(query, signal) { return this.geocode(query, { limit: 5, autocomplete: false }, signal); }
  async place(id, signal) {
    const matches = await this.geocode(id, {}, signal);
    const place = matches.find((p) => p.id === id);
    if (!place) throw new ServiceError("This saved place is no longer available. Search and select the starting place again.", 422, "PLACE_UNAVAILABLE");
    return place;
  }
  searchVenues(region, activity, signal) {
    const latSpan = region.radiusMeters / 111200;
    const lonSpan = latSpan / Math.max(0.05, Math.cos(region.lat * Math.PI / 180));
    const params = { types: "poi", limit: 10, autocomplete: false, proximity: coordinate(region) };
    if (region.lon - lonSpan >= -180 && region.lon + lonSpan <= 180)
      params.bbox = [region.lon - lonSpan, Math.max(-90, region.lat - latSpan), region.lon + lonSpan, Math.min(90, region.lat + latSpan)].join(",");
    const categories = { coffee: "cafe", restaurants: "restaurant", parks: "park", cinemas: "cinema", libraries: "library", "ice cream": "ice cream", bowling: "bowling" };
    return this.geocode(categories[activity] || activity, params, signal);
  }
  async routing(path, params, signal, elements = 0) {
    // One queue per provider prevents simultaneous users flooding the public demo service.
    const previous = this.routingQueue;
    let release;
    this.routingQueue = new Promise((resolve) => { release = resolve; });
    try {
      await previous;
      signal?.throwIfAborted();
      const wait = Math.max(0, this.lastRouteRequest + this.interval - Date.now());
      if (wait) await delay(wait, undefined, { signal });
      signal?.throwIfAborted();
      this.lastRouteRequest = Date.now();
      const url = new URL(`${this.routingUrl}/${path}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      return await this.json(url, signal, "OSRM routing", elements);
    } finally { release(); }
  }
  async matrix(origins, venues, signal) {
    const points = [...origins, ...venues];
    const data = await this.routing(`table/v1/driving/${points.map(coordinate).join(";")}`, {
      sources: origins.map((_, i) => i).join(";"), destinations: venues.map((_, i) => i + origins.length).join(";"), annotations: "duration",
    }, signal, origins.length * venues.length);
    return decodeMatrix(data, origins.length, venues.length);
  }
  async routes(origins, venue, signal) {
    const routes = [];
    for (const origin of origins) {
      const data = await this.routing(`route/v1/driving/${coordinate(origin)};${coordinate(venue)}`, { overview: "full", geometries: "geojson", steps: false, alternatives: false }, signal);
      routes.push({ participantId: origin.id, ...decodeRoute(data) });
    }
    return routes;
  }
}
