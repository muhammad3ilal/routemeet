// services/candidates.js
//
// Generates a set of candidate meeting-point coordinates to evaluate.
// The approach is a simple, explainable grid search:
//
//   1. Compute the bounding box around everyone's starting point.
//   2. Pad it a bit, because the fairest real-world meeting spot can
//      sit slightly outside the strict geometric hull (e.g. just off
//      a highway interchange that's convenient for everyone).
//   3. Sample an evenly spaced grid inside that padded box, plus the
//      exact centroid, and hand every point to the OSRM travel-time
//      matrix for scoring.
//
// A grid is not the most sophisticated search strategy (a gradient
// descent over travel time would converge faster), but it's easy to
// reason about and cheap enough that a single OSRM table request can
// score the whole grid at once.

/**
 * @param {Array<{lat:number, lon:number}>} origins
 * @param {{gridSize?: number, paddingRatio?: number}} [options]
 * @returns {Array<{lat:number, lon:number}>}
 */
export function generateCandidates(origins, options = {}) {
  const { gridSize = 6, paddingRatio = 0.25 } = options;

  const lats = origins.map((p) => p.lat);
  const lons = origins.map((p) => p.lon);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lonSpan = Math.max(maxLon - minLon, 0.01);

  const paddedMinLat = minLat - latSpan * paddingRatio;
  const paddedMaxLat = maxLat + latSpan * paddingRatio;
  const paddedMinLon = minLon - lonSpan * paddingRatio;
  const paddedMaxLon = maxLon + lonSpan * paddingRatio;

  const points = [];

  // Exact centroid first -- it's usually a strong candidate and
  // guarantees the "naive midpoint" baseline is always in the running.
  points.push({
    lat: lats.reduce((a, b) => a + b, 0) / lats.length,
    lon: lons.reduce((a, b) => a + b, 0) / lons.length,
    label: "centroid",
  });

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const lat =
        paddedMinLat + (i / (gridSize - 1)) * (paddedMaxLat - paddedMinLat);
      const lon =
        paddedMinLon + (j / (gridSize - 1)) * (paddedMaxLon - paddedMinLon);
      points.push({ lat, lon, label: `grid-${i}-${j}` });
    }
  }

  return points;
}
