// services/osrm.js
//
// Wraps the OSRM "table" service, which computes a many-to-many
// travel time matrix in a single HTTP request. This is the key
// efficiency trick in RouteMeet: instead of calling a routing API
// once per (origin, candidate) pair, we send all origins and all
// candidates in one request and get back a full duration matrix.
//
// Public demo server: https://project-osrm.org/ (free, no API key,
// driving profile only, best-effort uptime -- fine for a portfolio
// project, not for production traffic).

const BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const PROFILE = "driving";

/**
 * Fetch a travel-time matrix (in seconds) from every origin to every
 * destination.
 *
 * @param {Array<{lat:number, lon:number}>} origins
 * @param {Array<{lat:number, lon:number}>} destinations
 * @returns {Promise<number[][]>} matrix[i][j] = seconds from origins[i] to destinations[j]
 */
export async function getTravelTimeMatrix(origins, destinations) {
  if (origins.length === 0 || destinations.length === 0) {
    return [];
  }

  // OSRM wants a single coordinate list plus index arrays telling it
  // which entries are sources and which are destinations.
  const allPoints = [...origins, ...destinations];
  const coordString = allPoints.map((p) => `${p.lon},${p.lat}`).join(";");
  const sourceIdx = origins.map((_, i) => i).join(";");
  const destIdx = destinations.map((_, i) => origins.length + i).join(";");

  const url =
    `${BASE_URL}/table/v1/${PROFILE}/${coordString}` +
    `?sources=${sourceIdx}&destinations=${destIdx}&annotations=duration`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM table request failed (${res.status})`);
  }
  const data = await res.json();

  if (data.code !== "Ok") {
    throw new Error(`OSRM table error: ${data.code} ${data.message || ""}`);
  }

  // data.durations is already an origins x destinations matrix of
  // seconds (or null where no route could be found, e.g. an island).
  return data.durations;
}
