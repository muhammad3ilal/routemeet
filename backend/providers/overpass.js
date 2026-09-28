import { ServiceError } from "../errors.js";

const DEFAULT_URL = "https://overpass-api.de/api/interpreter";
const HEADERS = {
  "User-Agent": "RouteMeet/1.0 (https://github.com/muhammad3ilal/routemeet)",
  Accept: "application/json",
  "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
};
// Fixed tag selectors only: user input never becomes an Overpass expression.
const CATEGORY_FILTERS = {
  coffee: [
    '["amenity"~"(^|;)cafe(;|$)"]',
    '["shop"~"^(coffee|coffee_shop|cafe)$"]',
    '["cafe"="yes"]',
    '["amenity"~"^(restaurant|fast_food|food_court)$"]["cuisine"~"(^|;)coffee_shop(;|$)"]',
  ],
  restaurants: ['["amenity"~"(^|;)(restaurant|fast_food|food_court)(;|$)"]'],
  parks: ['["leisure"="park"]'],
  bowling: ['["leisure"="bowling_alley"]', '["sport"~"(^|;)10pin(;|$)"]'],
  cinemas: ['["amenity"="cinema"]'],
  libraries: ['["amenity"="library"]'],
  "ice cream": ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'],
};
const CATEGORY_LABELS = {
  coffee: "Cafe / coffee shop", restaurants: "Restaurant", parks: "Park", bowling: "Bowling alley",
  cinemas: "Cinema", libraries: "Library", "ice cream": "Ice cream shop",
};
const lifecyclePrefixes = ["disused", "abandoned", "demolished", "razed", "closed"];
const clean = (value) => typeof value === "string" ? value.trim() : "";
const isPositive = (value) => !!clean(value) && !/^(no|false|0)$/i.test(clean(value));

function isClosed(tags) {
  if (lifecyclePrefixes.some((prefix) => isPositive(tags[prefix]))) return true;
  for (const prefix of lifecyclePrefixes) for (const key of ["amenity", "shop", "leisure", "sport", "cafe"]) {
    const oldValue = tags[`${prefix}:${key}`];
    if (isPositive(oldValue) && (!tags[key] || oldValue === tags[key])) return true;
  }
  return /^(closed|off|24\/7 (closed|off))$/i.test(clean(tags.opening_hours));
}
function inferredLabel(tags) {
  if (/cafe|coffee/.test(`${tags.amenity || ""} ${tags.shop || ""}`) || tags.cafe === "yes") return CATEGORY_LABELS.coffee;
  if (tags.leisure === "park") return CATEGORY_LABELS.parks;
  if (tags.leisure === "bowling_alley" || tags.sport === "10pin") return CATEGORY_LABELS.bowling;
  if (tags.amenity === "cinema") return CATEGORY_LABELS.cinemas;
  if (tags.amenity === "library") return CATEGORY_LABELS.libraries;
  if (tags.amenity === "ice_cream" || tags.shop === "ice_cream") return CATEGORY_LABELS["ice cream"];
  if (/restaurant|fast_food|food_court/.test(tags.amenity || "")) return CATEGORY_LABELS.restaurants;
  return "Meeting place";
}
export function normalizeOsmVenue(element, activity) {
  if (!element || !["node", "way", "relation"].includes(element.type) || !Number.isSafeInteger(element.id) || element.id < 1) return null;
  const tags = element.tags && typeof element.tags === "object" ? element.tags : {};
  if (isClosed(tags)) return null;
  const { lat, lon } = element.type === "node" ? element : element.center || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const street = [clean(tags["addr:housenumber"]), clean(tags["addr:street"]) || clean(tags["addr:place"])].filter(Boolean).join(" ");
  const address = clean(tags["addr:full"]) || [street, clean(tags["addr:city"]) || clean(tags["addr:town"]) || clean(tags["addr:village"]), clean(tags["addr:state"]), clean(tags["addr:postcode"])].filter(Boolean).join(", ");
  return {
    id: `osm:${element.type}:${element.id}`,
    name: clean(tags.name) || clean(tags.brand) || clean(tags.operator) || CATEGORY_LABELS[activity] || inferredLabel(tags),
    address,
    lat,
    lon,
    attributions: [],
    mapsUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
  };
}
function validateArea(area) {
  if (!area || !Number.isFinite(area.lat) || Math.abs(area.lat) > 90 || !Number.isFinite(area.lon) || Math.abs(area.lon) > 180 || !Number.isFinite(area.radiusMeters) || area.radiusMeters < 1 || area.radiusMeters > 50000)
    throw new ServiceError("Choose a valid search area with a radius from 1 to 50,000 metres.", 400, "INVALID_SEARCH_AREA");
  return { lat: area.lat, lon: area.lon, radiusMeters: area.radiusMeters };
}
export function buildAreaQuery(area, activity) {
  const { lat, lon, radiusMeters } = validateArea(area);
  const filters = Object.hasOwn(CATEGORY_FILTERS, activity) ? CATEGORY_FILTERS[activity] : null;
  if (!filters) throw new ServiceError("Choose an activity from the list.", 400, "INVALID_ACTIVITY");
  return `[out:json][timeout:25][maxsize:67108864];(${filters.map((filter) => `nwr${filter}(around:${radiusMeters},${lat},${lon});`).join("")});out body center;out count;`;
}
const incomplete = () => new ServiceError("The place service returned an incomplete area search. Try again; no partial list has been used.", 502, "VENUE_SEARCH_INCOMPLETE");
function completedElements(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.elements)) throw new ServiceError("The place service returned an unreadable result.", 502, "VENUE_SEARCH_INVALID");
  if (data.remark) throw incomplete();
  // A count is emitted after the complete result. Require it so interrupted
  // output cannot masquerade as an empty or exhaustive successful search.
  const final = data.elements.at(-1);
  const total = Number(final?.tags?.total);
  if (final?.type !== "count" || !Number.isSafeInteger(total) || total < 0 || total !== data.elements.length - 1) throw incomplete();
  return data.elements.slice(0, -1);
}
function abortable(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener("abort", onAbort); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => { signal.removeEventListener("abort", onAbort); resolve(value); }, (error) => { signal.removeEventListener("abort", onAbort); reject(error); });
  });
}

export class OverpassProvider {
  constructor({ fetchImpl = fetch, consume = () => {}, url = process.env.OVERPASS_URL || DEFAULT_URL, requestTimeoutMs = 35000, maxResponseBytes = 20 * 1024 * 1024 } = {}) {
    const endpoint = new URL(url);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
      throw new Error("OVERPASS_URL must be an HTTP(S) endpoint without credentials or query parameters.");
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1)
      throw new Error("Overpass request timeout and response size must be positive integers.");
    this.url = endpoint;
    this.fetch = fetchImpl;
    this.consume = consume;
    this.requestTimeoutMs = requestTimeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.queue = Promise.resolve();
  }
  query(expression, signal) {
    signal?.throwIfAborted();
    const run = this.queue.then(() => this.request(expression, signal));
    this.queue = run.catch(() => {});
    // A cancelled queued search returns immediately but retains its queue slot
    // until the previous request finishes, so subsequent requests cannot overlap.
    return abortable(run, signal);
  }
  async request(expression, signal) {
    signal?.throwIfAborted();
    this.consume(0);
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeoutMs)]) : AbortSignal.timeout(this.requestTimeoutMs);
    let reader;
    try {
      const response = await abortable(this.fetch(this.url, {
        method: "POST", headers: HEADERS, body: new URLSearchParams({ data: expression }), signal: requestSignal,
      }), requestSignal);
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 429) throw new ServiceError("The place service is busy. Wait a moment and try again.", 429, "VENUE_SEARCH_LIMIT");
        if (response.status === 504 || response.status === 408) throw new ServiceError("The area search took too long. Try a smaller search area or try again later.", 504, "VENUE_SEARCH_TIMEOUT");
        throw new ServiceError("The place service could not search this area. Please try again.", 502, "VENUE_SEARCH_UNAVAILABLE");
      }
      const tooLarge = () => new ServiceError("This area has too much place data to load safely. Choose a smaller area; no results were silently removed.", 413, "VENUE_SEARCH_TOO_LARGE");
      const size = Number(response.headers.get("content-length"));
      if (Number.isFinite(size) && size > this.maxResponseBytes) {
        await response.body?.cancel().catch(() => {});
        throw tooLarge();
      }
      if (!response.body) throw incomplete();
      reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { value, done } = await abortable(reader.read(), requestSignal);
        if (done) break;
        received += value.byteLength;
        if (received > this.maxResponseBytes) throw tooLarge();
        chunks.push(value);
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let data;
      try { data = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { throw new ServiceError("The place service returned unreadable data. Please try again.", 502, "VENUE_SEARCH_INVALID"); }
      return completedElements(data);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof ServiceError) throw error;
      if (requestSignal.aborted) throw new ServiceError("The area search took too long. Try a smaller search area or try again later.", 504, "VENUE_SEARCH_TIMEOUT");
      throw new ServiceError("The place service could not be reached. Please try again.", 502, "VENUE_SEARCH_UNAVAILABLE");
    } finally {
      if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
  }
  async searchArea(area, activity, signal) {
    const elements = await this.query(buildAreaQuery(area, activity), signal);
    const unique = new Map();
    let excludedClosedVenues = 0;
    for (const element of elements) {
      if (isClosed(element?.tags || {})) { excludedClosedVenues++; continue; }
      const venue = normalizeOsmVenue(element, activity);
      if (!venue) throw incomplete();
      if (!unique.has(venue.id)) unique.set(venue.id, venue);
    }
    return { venues: [...unique.values()], diagnostics: {
      venueSource: "OpenStreetMap",
      coverageNote: "Places listed in OpenStreetMap for this area. Some shops may be missing, duplicated or out of date.",
      searchQueries: 1,
      matchedVenues: unique.size,
      excludedClosedVenues,
    } };
  }
  async place(id, signal) {
    const match = typeof id === "string" && /^osm:(node|way|relation):([1-9][0-9]*)$/.exec(id);
    if (!match || !Number.isSafeInteger(Number(match[2]))) throw new ServiceError("Choose a valid saved place.", 400, "INVALID_PLACE_ID");
    const elements = await this.query(`[out:json][timeout:25][maxsize:67108864];${match[1]}(${match[2]});out body center;out count;`, signal);
    const venue = elements.map((element) => normalizeOsmVenue(element)).find((value) => value?.id === id);
    if (!venue) throw new ServiceError("This saved place is no longer available. Search the area again.", 422, "PLACE_UNAVAILABLE");
    return venue;
  }
}
