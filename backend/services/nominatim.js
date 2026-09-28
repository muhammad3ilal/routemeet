// services/nominatim.js
//
// Thin wrapper around the free OpenStreetMap Nominatim API for
// forward geocoding (address -> coordinates) and reverse geocoding
// (coordinates -> human-readable place name).
//
// Nominatim's usage policy requires a descriptive User-Agent and asks
// clients to keep requests to roughly 1/second, so every public
// function here funnels through a tiny built-in rate limiter.

const BASE_URL = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
const USER_AGENT = "RouteMeet/1.0 (educational project; contact: muhammadbilal0509@gmail.com)";
const MIN_REQUEST_GAP_MS = 1100; // stay under Nominatim's 1 req/sec policy

let lastRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

async function nominatimFetch(path) {
  await throttle();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Nominatim request failed (${res.status}): ${path}`);
  }
  return res.json();
}

/**
 * Geocode a free-text address into { lat, lon, displayName }.
 * Throws if the address cannot be resolved to a location.
 */
export async function geocodeAddress(address) {
  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
  });
  const results = await nominatimFetch(`/search?${params.toString()}`);
  if (!results || results.length === 0) {
    const err = new Error(`Could not find a location for address: "${address}"`);
    err.code = "GEOCODE_NOT_FOUND";
    throw err;
  }
  const best = results[0];
  return {
    lat: parseFloat(best.lat),
    lon: parseFloat(best.lon),
    displayName: best.display_name,
  };
}

/**
 * Reverse-geocode a coordinate into a short, human-readable label.
 * Falls back to raw coordinates if the lookup fails, since this is
 * only used for display purposes (never for the routing math).
 */
export async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "jsonv2",
      zoom: "18",
    });
    const result = await nominatimFetch(`/reverse?${params.toString()}`);
    if (result && result.display_name) {
      return shortenAddress(result.display_name);
    }
  } catch {
    // fall through to coordinate fallback below
  }
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

// Nominatim's display_name is often very long
// ("123 Main St, Neighborhood, City, County, State, ZIP, Country").
// Trim it down to the first few comma-separated segments so it reads
// well in a results list.
function shortenAddress(displayName, maxSegments = 3) {
  return displayName.split(",").slice(0, maxSegments).join(",").trim();
}
