import { test } from "node:test";
import assert from "node:assert/strict";
import { MinHeap, topK } from "../algorithms/heap.js";
import { optimizeVenues, paretoFrontier } from "../algorithms/optimizer.js";
import {
  discoverVenues,
  distanceKm,
  minimaxCenter,
  RegionSearch,
} from "../algorithms/search.js";
import { validateTrip } from "../validation.js";
let seed = 9182;
const random = (n) =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n;
const people = [
  { id: "a", name: "Alex", maxMinutes: 10 },
  { id: "b", name: "Sam", maxMinutes: 30 },
];
test("heap and bounded selection match a full sort over deterministic randomized inputs", () => {
  for (let trial = 0; trial < 100; trial++) {
    const values = Array.from({ length: random(150) }, () => random(50) - 25),
      expected = [...values].sort((a, b) => a - b);
    const heap = new MinHeap((a, b) => a - b);
    values.forEach((v) => heap.push(v));
    assert.deepEqual(
      Array.from({ length: values.length }, () => heap.pop()),
      expected,
    );
    assert.equal(heap.pop(), undefined);
    for (const k of [0, 1, 5, 200])
      assert.deepEqual(
        topK(values, k, (a, b) => a - b),
        expected.slice(0, k),
      );
  }
});
test("skyline sweep agrees with brute-force dominance, including ties", () => {
  for (let trial = 0; trial < 100; trial++) {
    const cs = Array.from({ length: 50 }, (_, id) => ({
      id,
      maxSeconds: random(15),
      totalSeconds: random(15),
    }));
    const expected = cs.filter(
      (a) =>
        !cs.some(
          (b) =>
            b.maxSeconds <= a.maxSeconds &&
            b.totalSeconds <= a.totalSeconds &&
            (b.maxSeconds < a.maxSeconds || b.totalSeconds < a.totalSeconds),
        ),
    );
    assert.deepEqual(
      paretoFrontier(cs)
        .map((c) => c.id)
        .sort((a, b) => a - b),
      expected.map((c) => c.id).sort((a, b) => a - b),
    );
  }
});
test("similar road times beat a venue beside one person, without padding unfair alternatives", () => {
  const venues = ["near-alex", "middle", "near-sam", "equal-but-distant", "unreachable"].map((id) => ({ id }));
  const result = optimizeVenues(people, venues, [
    [60, 1200, 1140, 3600, null],
    [1140, 1200, 60, 3600, 20],
  ]);
  assert.deepEqual(result.candidates.map((c) => c.id), ["middle"]);
  assert.deepEqual(result.candidates[0].perPerson, [
    { id: "a", name: "Alex", seconds: 1200 },
    { id: "b", name: "Sam", seconds: 1200 },
  ]);
  assert.equal(result.diagnostics.bestMaxSeconds, 1140);
  assert.equal(result.diagnostics.maxAllowedSeconds, 1440);
  assert.equal(result.diagnostics.bestSpreadSeconds, 0);
  assert.equal(result.diagnostics.balanceAvailable, true);
  assert.equal(result.diagnostics.balancedVenues, 1);
  assert.equal(result.diagnostics.unreachableVenues, 1);
  assert.throws(() => optimizeVenues(people, venues, [[1]]), /dimensions/);
  assert.throws(() => optimizeVenues(people, venues, [null, []]), /dimensions/);
});
test("a sparse region returns the best available compromise and admits unequal travel", () => {
  const result = optimizeVenues(people, [{ id: "x" }, { id: "y" }], [[60, 300], [1800, 2400]]);
  assert.deepEqual(result.candidates.map((c) => c.id), ["x"]);
  assert.equal(result.diagnostics.balanceAvailable, false);
  assert.equal(result.diagnostics.bestSpreadSeconds, 1740);
  assert.equal(result.diagnostics.maxAllowedSeconds, 2160);
  assert.ok(!("feasibleVenues" in result.diagnostics));
});
test("legacy limits and efficiency preferences cannot make one person carry the journey", () => {
  const venues = ["one-sided", "fair"].map((id) => ({ id }));
  const matrix = [[60, 1200], [1140, 1200]];
  const baseline = optimizeVenues(people.map(({ id, name }) => ({ id, name })), venues, matrix);
  for (const limits of [[1, 180], [180, 1], [NaN, 0]]) {
    const legacy = optimizeVenues(people.map((p, i) => ({ ...p, maxMinutes: limits[i] })), venues, matrix, "efficient");
    assert.deepEqual(legacy, baseline);
  }
  assert.ok(baseline.candidates.every((c) => !["maxRatio", "maxOverrunSeconds", "feasible"].some((key) => key in c)));
});
test("three-person fairness counts a distant outlier equally to a nearby pair", () => {
  const origins = [...people, { id: "c", name: "Jo" }];
  const result = optimizeVenues(origins, [{ id: "near-pair" }, { id: "between" }, { id: "detour" }], [
    [120, 960, 2700],
    [120, 960, 2700],
    [1680, 1080, 2700],
  ]);
  assert.deepEqual(result.candidates.map((c) => c.id), ["between"]);
  assert.equal(result.candidates[0].spreadSeconds, 120);
  assert.equal(result.candidates[0].maxSeconds, 1080);
  assert.equal(result.candidates[0].totalSeconds, 3000);
});
test("stable ranking is independent of person and provider result order", () => {
  const venues = ["z", "a", "b", "c"].map((id) => ({ id }));
  const matrix = [[1000, 1000, 1050, 900], [1100, 1100, 1150, 1200]];
  const first = optimizeVenues(people, venues, matrix);
  const reversed = optimizeVenues([...people].reverse(), [...venues].reverse(), [...matrix].reverse().map((row) => [...row].reverse()));
  assert.deepEqual(first.candidates.map((c) => c.id), ["a", "z", "b"]);
  assert.deepEqual(reversed.candidates.map((c) => c.id), first.candidates.map((c) => c.id));
  assert.deepEqual(reversed.diagnostics, first.diagnostics);
});
test("missing or invalid road paths are excluded and all-unreachable searches have finite-safe diagnostics", () => {
  const result = optimizeVenues(people, ["a", "b", "c", "d"].map((id) => ({ id })), [[null, NaN, -1, Infinity], [300, 300, 300, 300]]);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.diagnostics.reachableVenues, 0);
  assert.equal(result.diagnostics.unreachableVenues, 4);
  assert.equal(result.diagnostics.balanceAvailable, false);
  assert.equal(result.diagnostics.bestMaxSeconds, null);
  assert.equal(result.diagnostics.bestSpreadSeconds, null);
  assert.equal(result.diagnostics.maxAllowedSeconds, null);
  const zero = optimizeVenues(people, [{ id: "same-place" }], [[0], [0]]);
  assert.equal(zero.candidates[0].maxSeconds, 0);
  assert.equal(zero.diagnostics.balanceAvailable, true);
});
test("geographic minimax center resists cluster bias and is order independent", () => {
  const origins = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0, lon: 1 }];
  const center = minimaxCenter(origins);
  assert.ok(distanceKm(center, { lat: 0, lon: 0.5 }) < 1e-6);
  assert.deepEqual(minimaxCenter([...origins].reverse()), center);
  assert.deepEqual(minimaxCenter([...origins, origins[0], origins[0]]), center);
  const seed = new RegionSearch(origins).next();
  assert.equal(seed.lat, center.lat);
  assert.equal(seed.lon, center.lon);
  assert.ok(seed.radiusMeters <= 10000);
});
test("geographic minimax center handles triangle boundaries, coincident locations and the date line", () => {
  const same = minimaxCenter([{ lat: 20, lon: 30 }, { lat: 20, lon: 30 }]);
  assert.ok(distanceKm(same, { lat: 20, lon: 30 }) < 1e-6);
  const across = minimaxCenter([{ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }]);
  assert.ok(Math.abs(across.lon) > 179.9);
  assert.ok(distanceKm({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }) < 23);
  const triangle = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.2 }, { lat: 0.2, lon: 0.1 }];
  const center = minimaxCenter(triangle);
  assert.ok(Math.abs(center.lon - 0.1) < 1e-5);
  assert.ok(Math.abs(center.lat - 0.075) < 1e-5);
  const radii = triangle.map((p) => distanceKm(center, p));
  assert.ok(Math.max(...radii) - Math.min(...radii) < 0.001);
});
test("region exploration ignores limits, deduplicates, stays bounded and stops on cancellation", async () => {
  let calls = 0;
  const provider = { searchVenues: async () => {
    calls++;
    return [{ id: "duplicate" }, { id: `v${calls}` }];
  } };
  const origins = people.map((p, i) => ({ ...p, lat: 38 + i * 0.02, lon: -77 }));
  const result = await discoverVenues(provider, origins, "coffee");
  assert.equal(calls, 6);
  assert.equal(result.venues.length, 7);
  assert.equal(result.diagnostics.duplicateCount, 5);
  assert.ok(new Set(result.diagnostics.regions.map((r) => `${r.lat},${r.lon}`)).size > 1);
  const second = await discoverVenues(provider, origins.map((p) => ({ ...p, maxMinutes: NaN })), "coffee");
  assert.deepEqual(second.diagnostics.regions, result.diagnostics.regions);
  await assert.rejects(discoverVenues(provider, origins, "coffee", AbortSignal.abort()));
});
test("all geographic probes finish before limiting the matrix, preserving later central results", async () => {
  let calls = 0;
  const origins = [{ lat: 0, lon: -0.1 }, { lat: 0, lon: 0.1 }];
  const provider = { searchVenues: async () => {
    const group = calls++;
    return Array.from({ length: 10 }, (_, index) => ({ id: `${group}-${index}`, lat: 0, lon: group === 5 ? index / 10000 : 0.15 + index / 1000 }));
  } };
  const result = await discoverVenues(provider, origins, "coffee");
  assert.equal(calls, 6);
  assert.equal(result.diagnostics.discoveredVenues, 60);
  assert.equal(result.venues.length, 32);
  assert.equal(result.venues.filter((p) => p.id.startsWith("5-")).length, 10);
  assert.equal(result.venues[0].id, "5-0");
});
test("validation needs confirmed places, rejects duplicate people and ignores obsolete travel limits", () => {
  const valid = { mode: "demo", activity: "coffee", participants: people.map(({ id, name }) => ({ id, name, address: "DC", placeId: "demo-origin-1" })) };
  assert.equal(validateTrip(valid).participants.length, 2);
  for (const change of [{ address: " " }, { placeId: "" }, { id: "b" }]) {
    assert.throws(() => validateTrip({ ...valid, participants: [{ ...valid.participants[0], ...change }, valid.participants[1]] }));
  }
  for (const maxMinutes of [0, NaN, 10000]) {
    const trip = validateTrip({ ...valid, participants: valid.participants.map((p) => ({ ...p, maxMinutes })) });
    assert.ok(trip.participants.every((p) => !("maxMinutes" in p)));
  }
  assert.throws(() => validateTrip(null));
});
