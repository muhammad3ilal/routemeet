import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalog, compareVenues, getMeetingArea, initialComparisonVenues } from "../algorithms/catalog.js";
import { distanceKm } from "../algorithms/search.js";

const origins = [
  { id: "a", name: "Alex", lat: 38.9, lon: -77.1 },
  { id: "b", name: "Sam", lat: 38.9, lon: -77 },
];

test("meeting area uses the enclosing center, scales with origin spread, and bounds the search radius", () => {
  const automatic = getMeetingArea(origins);
  assert.ok(distanceKm(automatic, { lat: 38.9, lon: -77.05 }) < 0.001);
  const expected = Math.max(...origins.map((origin) => distanceKm(origin, automatic))) * 1.25 + 2;
  assert.ok(Math.abs(automatic.radiusMeters / 1000 - expected) < 0.001);
  assert.equal(getMeetingArea([origins[0], origins[0]]).radiusMeters, 3000);
  assert.equal(getMeetingArea([{ lat: 0, lon: 0 }, { lat: 0, lon: 2 }]).radiusMeters, 50000);
  assert.equal(getMeetingArea(origins, 10).radiusMeters, 10000);
  assert.deepEqual(getMeetingArea([...origins].reverse()), automatic);
});

test("all venues survive catalog creation while only a deterministic central sample gets compared", () => {
  const venues = Array.from({ length: 80 }, (_, i) => ({ id: `v-${i}`, lat: 38.9, lon: -77.15 + i * 0.0025, name: `Shop ${i}` }));
  const initial = initialComparisonVenues(origins, venues);
  assert.equal(initial.length, 32);
  assert.deepEqual(initialComparisonVenues([...origins].reverse(), [...venues].reverse()).map((v) => v.id), initial.map((v) => v.id));
  const catalog = buildCatalog(venues, compareVenues(origins, initial, origins.map((_, row) => initial.map((_, column) => 300 + row * 60 + column))), [initial[0].id]);
  assert.equal(catalog.length, 80);
  assert.deepEqual(new Set(catalog.map((v) => v.id)), new Set(venues.map((v) => v.id)));
  assert.equal(catalog.filter((v) => v.comparisonStatus === "ready").length, 32);
  assert.equal(catalog.filter((v) => v.comparisonStatus === "pending").length, 48);
  assert.equal(catalog.filter((v) => v.recommended).length, 1);
  assert.ok(catalog.filter((v) => v.comparisonStatus === "pending").every((v) => !v.perPerson && !v.maxSeconds));
});

test("unreachable places stay visible without invented times and one-place comparisons do not recommend", () => {
  const venues = [{ id: "closed-road" }, { id: "reachable" }];
  const comparisons = compareVenues(origins, venues, [[null, 0], [600, 600]]);
  assert.equal(comparisons[0].comparisonStatus, "unreachable");
  assert.equal(comparisons[0].perPerson, undefined);
  assert.equal(comparisons[1].comparisonStatus, "ready");
  assert.equal(comparisons[1].minSeconds, 0);
  assert.equal(comparisons[1].maxSeconds, 600);
  assert.equal(comparisons[1].spreadSeconds, 600);
  assert.equal(comparisons[1].recommended, false);
  assert.equal(buildCatalog(venues, comparisons).length, 2);
  assert.throws(() => compareVenues(origins, venues, [[300]]), /dimensions/);
});
