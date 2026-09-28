import { MinHeap, topK } from "./heap.js";

const EARTH_KM = 6371;
const wrapLongitude = (lon) => ((lon + 540) % 360) - 180;
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Exact smallest enclosing circle in a local tangent plane. With at most eight
// participants, enumerating its one-, two-, and three-point boundary circles is
// inexpensive, deterministic, and prevents a cluster from pulling the seed to
// one end of the group. This is a discovery seed, not a road-time estimate.
export function minimaxCenter(points) {
  if (!points.length) throw new Error("At least one origin is required");
  const ordered = [...points].sort((a, b) => a.lat - b.lat || a.lon - b.lon);
  const lat0 = ordered.reduce((s, p) => s + p.lat, 0) / ordered.length;
  const lon0 = ordered[0].lon;
  const scale = Math.max(0.05, Math.cos(lat0 * Math.PI / 180));
  const local = ordered.map((p) => ({ x: wrapLongitude(p.lon - lon0) * scale, y: p.lat - lat0 }));
  let best = null;
  const consider = (x, y, radius) => {
    if (!Number.isFinite(radius) || (best && radius > best.radius + 1e-10)) return;
    if (local.some((p) => Math.hypot(x - p.x, y - p.y) > radius + 1e-9)) return;
    if (!best || radius < best.radius - 1e-10 || (Math.abs(radius - best.radius) <= 1e-10 && (x < best.x || (x === best.x && y < best.y)))) best = { x, y, radius };
  };
  for (let i = 0; i < local.length; i++) {
    const a = local[i];
    consider(a.x, a.y, 0);
    for (let j = i + 1; j < local.length; j++) {
      const b = local[j], x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      consider(x, y, Math.hypot(x - a.x, y - a.y));
      for (let k = j + 1; k < local.length; k++) {
        const c = local[k];
        const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
        if (Math.abs(d) < 1e-14) continue;
        const aa = a.x ** 2 + a.y ** 2, bb = b.x ** 2 + b.y ** 2, cc = c.x ** 2 + c.y ** 2;
        const cx = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d;
        const cy = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d;
        consider(cx, cy, Math.hypot(cx - a.x, cy - a.y));
      }
    }
  }
  return { lat: lat0 + best.y, lon: wrapLongitude(lon0 + best.x / scale) };
}

// Two center queries, followed by symmetric nearby probes. The first narrow
// query ensures sparse central venues are not drowned out by a dense city at
// one origin. All priorities concern geography only; OSRM ranks the results.
export class RegionSearch {
  constructor(origins) {
    this.origins = origins;
    this.seed = minimaxCenter(origins);
    this.rootKm = Math.min(45, Math.max(2, ...origins.map((p) => distanceKm(p, this.seed))));
    this.serial = 0;
    this.frontier = new MinHeap((a, b) => a.phase - b.phase || a.priority - b.priority || a.serial - b.serial);
    this.enqueue(this.seed, Math.max(1, Math.min(10, this.rootKm * 0.35)), 0);
    this.enqueue(this.seed, this.rootKm * 1.15, 1);
    const offsetKm = this.rootKm * 0.35;
    for (const [dx, dy] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const lat = Math.max(-85, Math.min(85, this.seed.lat + dy * offsetKm / 111.2));
      const lon = wrapLongitude(this.seed.lon + dx * offsetKm / (111.2 * Math.max(0.05, Math.cos(this.seed.lat * Math.PI / 180))));
      this.enqueue({ lat, lon }, this.rootKm * 0.65, 2);
    }
  }
  enqueue(center, radiusKm, phase) {
    this.frontier.push({ ...center, radiusMeters: Math.min(50000, Math.max(1000, radiusKm * 1000)), depth: phase, phase,
      priority: Math.max(...this.origins.map((p) => distanceKm(p, center))), serial: this.serial++ });
  }
  next() {
    const cell = this.frontier.pop();
    if (!cell) return null;
    return { lat: cell.lat, lon: cell.lon, radiusMeters: cell.radiusMeters, depth: cell.depth };
  }
}

export async function discoverVenues(provider, origins, activity, signal, maxQueries = 6) {
  const search = new RegionSearch(origins), unique = new Map(), regions = [];
  let duplicateCount = 0;
  for (let i = 0; i < Math.max(0, Math.min(6, maxQueries)); i++) {
    signal?.throwIfAborted();
    const region = search.next();
    if (!region) break;
    regions.push(region);
    const places = await provider.searchVenues(region, activity, signal);
    for (const place of places) {
      if (unique.has(place.id)) duplicateCount++;
      else unique.set(place.id, place);
    }
  }
  // Finish the symmetric probes before truncating, so request order cannot fill
  // the entire matrix with venues from one side. Bound the expensive road-time
  // matrix to 32 places using the same minimax geographic discovery heuristic.
  const geographicPriority = (place) => Number.isFinite(place.lat) && Number.isFinite(place.lon)
    ? Math.max(...origins.map((p) => distanceKm(p, place))) : Infinity;
  const venues = topK([...unique.values()].map((place) => ({ place, priority: geographicPriority(place) })), 32,
    (a, b) => (a.priority === b.priority ? 0 : a.priority - b.priority) || a.place.id.localeCompare(b.place.id)).map(({ place }) => place);
  return { venues, diagnostics: { searchQueries: regions.length, discoveredVenues: unique.size, duplicateCount, regions,
    searchCenter: search.seed, searchStrategy: "Smallest enclosing-circle center with two central searches and four symmetric probes; geographic selection is followed by real road-time comparison." } };
}
