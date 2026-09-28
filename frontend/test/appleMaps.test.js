import test from "node:test";
import assert from "node:assert/strict";
import { appleMapsDirections, hasMapCoordinates } from "../src/lib/appleMaps.js";

test("phone directions retain the precise destination and default to current location", () => {
  const url = new URL(appleMapsDirections({ lat: 38.8977, lon: -77.0365 }));
  assert.equal(url.origin, "https://maps.apple.com");
  assert.equal(url.pathname, "/directions");
  assert.equal(url.searchParams.get("destination"), "38.8977,-77.0365");
  assert.equal(url.searchParams.get("mode"), "driving");
  assert.equal(url.searchParams.has("source"), false);
});

test("a participant link routes from the selected person's origin only", () => {
  const url = new URL(appleMapsDirections({ lat: 38.8977, lon: -77.0365 }, { lat: 38.9, lon: -77.1 }));
  assert.equal(url.searchParams.get("source"), "38.9,-77.1");
  assert.equal(url.searchParams.get("destination"), "38.8977,-77.0365");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["destination", "mode", "source"]);
});

test("business names and addresses cannot replace coordinates or inject link parameters", () => {
  const venue = { lat: 48.8566, lon: 2.3522, name: "Café, Tea & More / 茶?source=evil", address: "2A Street #4 & mode=walking" };
  const url = new URL(appleMapsDirections(venue));
  assert.equal(url.searchParams.get("destination"), "48.8566,2.3522");
  assert.equal(url.searchParams.get("mode"), "driving");
  assert.equal(url.searchParams.has("source"), false);
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.size, 2);
});

test("zero coordinates and valid world boundaries work", () => {
  assert.equal(hasMapCoordinates({ lat: 0, lon: 0 }), true);
  assert.equal(hasMapCoordinates({ lat: -90, lon: 180 }), true);
  const url = new URL(appleMapsDirections({ lat: 0, lon: 0 }, { lat: 90, lon: -180 }));
  assert.equal(url.searchParams.get("destination"), "0,0");
  assert.equal(url.searchParams.get("source"), "90,-180");
});

test("invalid locations never produce navigable URLs", () => {
  for (const bad of [null, {}, { lat: null, lon: null }, { lat: "38", lon: -77 }, { lat: 91, lon: 0 }, { lat: 0, lon: -181 }, { lat: NaN, lon: 0 }, { lat: 0, lon: Infinity }]) {
    assert.equal(hasMapCoordinates(bad), false);
    assert.equal(appleMapsDirections(bad), "");
    if (bad !== null) assert.equal(appleMapsDirections({ lat: 0, lon: 0 }, bad), "");
  }
});
