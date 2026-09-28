import { distanceKm, minimaxCenter } from "./search.js";
import { topK } from "./heap.js";

export function getMeetingArea(origins, radiusKm) {
  const center = minimaxCenter(origins);
  const originRadiusKm = Math.max(...origins.map((origin) => distanceKm(origin, center)));
  const automaticKm = Math.min(50, Math.max(3, originRadiusKm * 1.25 + 2));
  return { ...center, radiusMeters: Math.ceil((radiusKm ?? automaticKm) * 1000) };
}

// Bound only the expensive initial road-time comparison. The full catalog is
// kept separately, so every place remains selectable regardless of this sample.
export function initialComparisonVenues(origins, venues, limit = 32) {
  return topK(venues.map((venue) => ({
    venue,
    priority: Math.max(...origins.map((origin) => distanceKm(origin, venue))),
  })), limit, (a, b) =>
    a.priority - b.priority || a.venue.id.localeCompare(b.venue.id),
  ).map(({ venue }) => venue);
}

export function compareVenues(origins, venues, matrix) {
  if (!origins.length || !Array.isArray(matrix) || matrix.length !== origins.length ||
      matrix.some((row) => !Array.isArray(row) || row.length !== venues.length))
    throw new Error("Invalid travel matrix dimensions");
  return venues.map((venue, column) => {
    const times = origins.map((_, row) => matrix[row][column]);
    if (times.some((seconds) => !Number.isFinite(seconds) || seconds < 0))
      return { ...venue, comparisonStatus: "unreachable", recommended: false };
    const totalSeconds = [...times].sort((a, b) => a - b).reduce((sum, seconds) => sum + seconds, 0);
    const maxSeconds = Math.max(...times), minSeconds = Math.min(...times);
    return {
      ...venue,
      comparisonStatus: "ready",
      recommended: false,
      perPerson: origins.map((origin, row) => ({ id: origin.id, name: origin.name, seconds: times[row] })),
      totalSeconds,
      maxSeconds,
      minSeconds,
      avgSeconds: totalSeconds / origins.length,
      spreadSeconds: maxSeconds - minSeconds,
    };
  });
}

export function buildCatalog(venues, comparisons = [], recommendedIds = []) {
  const checked = new Map(comparisons.map((venue) => [venue.id, venue]));
  const recommended = new Set(recommendedIds);
  return [...new Map(venues.map((venue) => [venue.id, venue])).values()].map((venue) => ({
    ...venue,
    comparisonStatus: "pending",
    ...checked.get(venue.id),
    recommended: recommended.has(venue.id),
  }));
}
