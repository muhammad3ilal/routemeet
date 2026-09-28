// Standalone mock Nominatim + OSRM servers for manual/local smoke testing
// (this sandbox has no outbound access to the real public map APIs).
// Run with: node test/mock-apis.js
import http from "node:http";

const GEOCODE_FIXTURES = {
  "washington, dc": { lat: 38.9072, lon: -77.0369, display_name: "Washington, DC, USA" },
  "arlington, va": { lat: 38.8816, lon: -77.0910, display_name: "Arlington, VA, USA" },
  "alexandria, va": { lat: 38.8048, lon: -77.0469, display_name: "Alexandria, VA, USA" },
  "fairfax, va": { lat: 38.8462, lon: -77.3064, display_name: "Fairfax, VA, USA" },
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
      return Math.round(dist * 100000);
    })
  );
  res.end(JSON.stringify({ code: "Ok", durations }));
});

nominatimMock.listen(5001, () => console.log("mock Nominatim on :5001"));
osrmMock.listen(5002, () => console.log("mock OSRM on :5002"));
