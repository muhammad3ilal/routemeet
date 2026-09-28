// Integration test: spins up lightweight mock servers standing in for
// Nominatim and OSRM (this sandbox has no outbound access to the real
// public APIs), points the backend at them via env vars, and exercises
// the real /api/optimize route end-to-end. This proves the plumbing
// between geocoding -> candidate grid -> travel matrix -> fairness
// scoring -> response shape actually works, independent of whatever
// the real map providers return.

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// --- Mock Nominatim -------------------------------------------------
// Resolves 4 known DC-area test addresses to real-ish coordinates, and
// answers reverse-geocode lookups with a canned label.
const GEOCODE_FIXTURES = {
  "washington dc": { lat: 38.9072, lon: -77.0369, display_name: "Washington, DC, USA" },
  "arlington va": { lat: 38.8816, lon: -77.0910, display_name: "Arlington, VA, USA" },
  "alexandria va": { lat: 38.8048, lon: -77.0469, display_name: "Alexandria, VA, USA" },
  "fairfax va": { lat: 38.8462, lon: -77.3064, display_name: "Fairfax, VA, USA" },
};

const nominatimMock = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Content-Type", "application/json");

  if (url.pathname === "/search") {
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const hit = GEOCODE_FIXTURES[q];
    res.end(JSON.stringify(hit ? [{ lat: String(hit.lat), lon: String(hit.lon), display_name: hit.display_name }] : []));
    return;
  }
  if (url.pathname === "/reverse") {
    res.end(JSON.stringify({ display_name: "Mock Meeting Spot, Somewhere, VA, USA" }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

// --- Mock OSRM --------------------------------------------------------
// Returns a deterministic but non-trivial duration matrix: time scales
// with straight-line coordinate distance so results are directionally
// sane, and every request "succeeds" (no unreachable-island cases).
const osrmMock = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Content-Type", "application/json");

  const match = url.pathname.match(/^\/table\/v1\/driving\/(.+)$/);
  if (!match) {
    res.statusCode = 404;
    res.end(JSON.stringify({ code: "NotFound" }));
    return;
  }
  const coords = match[1].split(";").map((pair) => {
    const [lon, lat] = pair.split(",").map(Number);
    return { lat, lon };
  });
  const sources = url.searchParams.get("sources").split(";").map(Number);
  const destinations = url.searchParams.get("destinations").split(";").map(Number);

  const durations = sources.map((sIdx) =>
    destinations.map((dIdx) => {
      const a = coords[sIdx];
      const b = coords[dIdx];
      const dist = Math.hypot(a.lat - b.lat, a.lon - b.lon);
      return Math.round(dist * 100000); // fake seconds, monotonic in distance
    })
  );

  res.end(JSON.stringify({ code: "Ok", durations }));
});

test("POST /api/optimize returns ranked fairest/fastest meeting points", async (t) => {
  await new Promise((resolve) => nominatimMock.listen(0, resolve));
  await new Promise((resolve) => osrmMock.listen(0, resolve));
  const nominatimPort = nominatimMock.address().port;
  const osrmPort = osrmMock.address().port;

  process.env.NOMINATIM_BASE_URL = `http://localhost:${nominatimPort}`;
  process.env.OSRM_BASE_URL = `http://localhost:${osrmPort}`;
  process.env.PORT = "0";

  // Import the app fresh so it picks up the env vars set above, then
  // start it on an ephemeral port.
  const { default: express } = await import("express");
  const { default: cors } = await import("cors");
  const { default: optimizeRouter } = await import("../routes/optimize.js");

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", optimizeRouter);

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;

  t.after(() => {
    server.close();
    nominatimMock.close();
    osrmMock.close();
  });

  const res = await fetch(`http://localhost:${port}/api/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      addresses: ["Washington DC", "Arlington VA", "Alexandria VA", "Fairfax VA"],
    }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.origins.length, 4);
  assert.ok(body.fairest.length > 0);
  assert.ok(body.fastest.length > 0);

  // Every returned candidate should carry a per-person time breakdown
  // for all 4 people, plus a human-readable place name.
  for (const candidate of [...body.fairest, ...body.fastest]) {
    assert.equal(candidate.perPerson.length, 4);
    assert.equal(typeof candidate.placeName, "string");
    assert.ok(candidate.maxSeconds >= candidate.minSeconds);
  }

  // Fairest #1 should have the smallest "maxSeconds" among all fairest candidates.
  const maxTimes = body.fairest.map((c) => c.maxSeconds);
  assert.equal(body.fairest[0].maxSeconds, Math.min(...maxTimes));
});

test("POST /api/optimize rejects too few addresses", async () => {
  const { default: express } = await import("express");
  const { default: optimizeRouter } = await import("../routes/optimize.js");
  const app = express();
  app.use(express.json());
  app.use("/api", optimizeRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;

  const res = await fetch(`http://localhost:${port}/api/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses: ["Only One Address"] }),
  });
  assert.equal(res.status, 400);
  server.close();
});
