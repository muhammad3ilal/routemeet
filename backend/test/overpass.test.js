import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { OverpassProvider, buildAreaQuery, normalizeOsmVenue } from "../providers/overpass.js";

const area = { lat: 38.9, lon: -77.04, radiusMeters: 3000 };
const node = (id, tags = {}, coords = {}) => ({ type: "node", id, lat: 38.9, lon: -77.04, tags: { amenity: "cafe", name: `Cafe ${id}`, ...tags }, ...coords });
const data = (elements = []) => ({ elements: [...elements, { type: "count", id: 0, tags: { total: String(elements.length) } }] });
const response = (elements = []) => new Response(JSON.stringify(data(elements)));
const fake = (elements) => new OverpassProvider({ fetchImpl: async () => response(elements) });

test("category searches use all OSM object types and bounded area, never a name search or output limit", () => {
  const query = buildAreaQuery(area, "coffee");
  assert.ok(query.includes('nwr["amenity"~"(^|;)cafe(;|$)"](around:3000,38.9,-77.04)'));
  assert.ok(query.includes('"coffee|coffee_shop|cafe"') || query.includes('"^(coffee|coffee_shop|cafe)$"'));
  assert.ok(query.includes('["cafe"="yes"]'));
  assert.ok(query.includes("coffee_shop"));
  assert.ok(query.endsWith("out body center;out count;"));
  assert.ok(!query.includes('["name"'));
  assert.ok(!/out\s+\d/.test(query));
  const required = { restaurants: "restaurant|fast_food|food_court", parks: '"park"', bowling: "10pin", cinemas: '"cinema"', libraries: '"library"', "ice cream": '"ice_cream"' };
  for (const [activity, tag] of Object.entries(required)) assert.ok(buildAreaQuery(area, activity).includes(tag));
  assert.ok(buildAreaQuery({ lat: 0, lon: 179.999, radiusMeters: 50000 }, "coffee").includes("around:50000,0,179.999"));
  for (const patch of [{ lat: NaN }, { lat: 91 }, { lon: 181 }, { lon: "0" }, { radiusMeters: 0 }, { radiusMeters: 50001 }])
    assert.throws(() => buildAreaQuery({ ...area, ...patch }, "coffee"), (e) => e.status === 400);
  for (const activity of ["constructor", "unknown", 'cafe"];out;']) assert.throws(() => buildAreaQuery(area, activity), (e) => e.status === 400);
});

test("all 120 returned venues survive retrieval and only the area/category is transmitted", async () => {
  let calls = 0, used = 0;
  const provider = new OverpassProvider({ consume: (elements) => { used++; assert.equal(elements, 0); }, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.href, "https://overpass-api.de/api/interpreter");
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("data"), buildAreaQuery(area, "coffee"));
    assert.ok(!options.body.toString().includes("Secret Person"));
    return response(Array.from({ length: 120 }, (_, i) => node(i + 1)));
  } });
  const result = await provider.searchArea({ ...area, origins: [{ name: "Secret Person", address: "Private address" }] }, "coffee");
  assert.equal(result.venues.length, 120);
  assert.equal(result.venues.at(-1).id, "osm:node:120");
  assert.equal(result.diagnostics.matchedVenues, 120);
  assert.equal(result.diagnostics.searchQueries, 1);
  assert.equal(result.diagnostics.venueSource, "OpenStreetMap");
  assert.match(result.diagnostics.coverageNote, /may be missing/);
  assert.equal(calls, 1);
  assert.equal(used, 1);
});

test("normalization retains unnamed features, OSM geometry types and separate same-brand branches", async () => {
  const items = [
    node(1, { name: "", brand: "Same Brand", "addr:housenumber": "10", "addr:street": "Main Street", "addr:city": "Washington", "addr:postcode": "20001" }),
    node(2, { name: "", brand: "Same Brand" }),
    { type: "way", id: 1, center: { lat: 38.91, lon: -77.05 }, tags: { amenity: "cafe", operator: "Local operator" } },
    { type: "relation", id: 1, center: { lat: 38.92, lon: -77.06 }, tags: { amenity: "cafe" } },
  ];
  const { venues } = await fake([...items, items[0]]).searchArea(area, "coffee");
  assert.deepEqual(venues.map((v) => v.id), ["osm:node:1", "osm:node:2", "osm:way:1", "osm:relation:1"]);
  assert.deepEqual(venues.map((v) => v.name), ["Same Brand", "Same Brand", "Local operator", "Cafe / coffee shop"]);
  assert.equal(venues[0].address, "10 Main Street, Washington, 20001");
  assert.equal(venues[2].lat, 38.91);
  assert.equal(venues[2].mapsUrl, "https://www.openstreetmap.org/way/1");
  assert.equal(normalizeOsmVenue(node(3, {}, { lat: 100 })), null);
  assert.equal(normalizeOsmVenue({ ...node(4), id: "4" }), null);
  assert.equal(normalizeOsmVenue({ type: "way", id: 2, tags: {} }), null);
});

test("explicitly closed places are excluded without treating scheduled closing times as permanent closure", async () => {
  const items = [
    node(1, { disused: "yes" }), node(2, { "disused:amenity": "cafe" }), node(3, { abandoned: "yes" }),
    node(4, { opening_hours: "closed" }), node(5, { opening_hours: "Mo-Fr 09:00-17:00; Sa-Su off" }),
    node(6, { disused: "no" }), node(7, { shop: "coffee", "disused:shop": "chemist" }),
  ];
  const result = await fake(items).searchArea(area, "coffee");
  assert.deepEqual(result.venues.map((v) => v.id), ["osm:node:5", "osm:node:6", "osm:node:7"]);
  assert.equal(result.diagnostics.excludedClosedVenues, 4);
});

test("valid empty results are distinguished from partial, malformed, or timed-out responses", async () => {
  assert.deepEqual((await fake([]).searchArea(area, "coffee")).venues, []);
  const invalid = [
    { ...data([node(1)]), remark: "runtime error: Query timed out with sensitive-provider-detail" },
    { elements: [] }, { elements: [node(1)] },
    { elements: [...data([node(1)]).elements.slice(0, -1), { type: "count", tags: { total: "2" } }] },
    data([node(1, {}, { lon: undefined })]), { data: [] },
  ];
  for (const body of invalid) {
    const provider = new OverpassProvider({ fetchImpl: async () => new Response(JSON.stringify(body)) });
    await assert.rejects(provider.searchArea(area, "coffee"), (error) => error.status === 502 && !error.message.includes("sensitive-provider-detail"));
  }
  const malformed = new OverpassProvider({ fetchImpl: async () => new Response("{broken") });
  await assert.rejects(malformed.searchArea(area, "coffee"), (e) => e.code === "VENUE_SEARCH_INVALID");
  for (const [status, expected] of [[429, 429], [504, 504], [500, 502]]) {
    const provider = new OverpassProvider({ fetchImpl: async () => new Response("provider secret text", { status }) });
    await assert.rejects(provider.searchArea(area, "coffee"), (e) => e.status === expected && !e.message.includes("secret"));
  }
});

test("oversized responses fail explicitly both with and without a Content-Length header", async () => {
  for (const headers of [{}, { "Content-Length": "5000" }]) {
    const provider = new OverpassProvider({ maxResponseBytes: 100, fetchImpl: async () => new Response(JSON.stringify(data([node(1)])), { headers }) });
    await assert.rejects(provider.searchArea(area, "coffee"), (e) => e.code === "VENUE_SEARCH_TOO_LARGE" && e.status === 413);
  }
});

test("saved OSM IDs resolve the exact node, way or relation and reject missing or closed places", async () => {
  for (const type of ["node", "way", "relation"]) {
    const provider = new OverpassProvider({ fetchImpl: async (_url, options) => {
      assert.ok(options.body.get("data").includes(`${type}(123);out body center;out count;`));
      return response([{ ...node(123), type, center: { lat: 38.9, lon: -77.04 } }]);
    } });
    assert.equal((await provider.place(`osm:${type}:123`)).id, `osm:${type}:123`);
  }
  for (const id of ["poi.123", "osm:node:0", "osm:node:123;out;", "osm:way:9007199254740992"])
    await assert.rejects(fake([]).place(id), (e) => e.status === 400);
  await assert.rejects(fake([]).place("osm:node:123"), (e) => e.code === "PLACE_UNAVAILABLE");
  await assert.rejects(fake([node(123, { closed: "yes" })]).place("osm:node:123"), (e) => e.code === "PLACE_UNAVAILABLE");
  await assert.rejects(fake([node(456)]).place("osm:node:123"), (e) => e.code === "PLACE_UNAVAILABLE");
});

test("queries serialize, queued cancellation returns promptly, and failures release the queue", async () => {
  let release, calls = 0, active = 0, peak = 0;
  const firstGate = new Promise((resolve) => { release = resolve; });
  const provider = new OverpassProvider({ fetchImpl: async () => {
    calls++; active++; peak = Math.max(peak, active);
    if (calls === 1) { await firstGate; active--; throw new Error("network failed"); }
    active--;
    return response([node(1)]);
  } });
  const first = provider.searchArea(area, "coffee");
  const firstRejected = assert.rejects(first, (e) => e.code === "VENUE_SEARCH_UNAVAILABLE");
  await delay(0);
  const controller = new AbortController();
  const cancelled = provider.searchArea(area, "coffee", controller.signal);
  controller.abort();
  await assert.rejects(cancelled, (e) => e.name === "AbortError");
  const third = provider.searchArea(area, "coffee");
  await delay(0);
  assert.equal(calls, 1);
  release();
  await firstRejected;
  assert.equal((await third).venues.length, 1);
  assert.equal(calls, 2);
  assert.equal(peak, 1);
  await assert.rejects(provider.searchArea(area, "coffee", AbortSignal.abort()));
  assert.equal(calls, 2);
});

test("in-flight cancellation and timeout do not turn into empty lists", async () => {
  const provider = new OverpassProvider({ requestTimeoutMs: 10, fetchImpl: async (_url, { signal }) => {
    await delay(100, undefined, { signal });
    return response([]);
  } });
  await assert.rejects(provider.searchArea(area, "coffee"), (e) => e.code === "VENUE_SEARCH_TIMEOUT");
  const controller = new AbortController();
  const pending = provider.searchArea(area, "coffee", controller.signal);
  await delay(0); controller.abort();
  await assert.rejects(pending, (e) => e.name === "AbortError");
});
