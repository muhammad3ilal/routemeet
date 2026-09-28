import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { openDatabase } from "../storage/database.js";
import { ServiceError } from "../errors.js";
const trip = {
  mode: "demo",
  activity: "coffee",
  objective: "balanced",
  participants: [1, 2, 3].map((i) => ({
    id: `p${i}`,
    name: `Person ${i}`,
    address: "Example starting place",
    placeId: `demo-origin-${i}`,
  })),
};
test("planner API completes search, selection, save/load/delete and enforces ownership and validation", async (t) => {
  const database = openDatabase(":memory:");
  const server = createApp({ database }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.close();
    database.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  async function call(path, body, options = {}) {
    const res = await fetch(base + path, {
      method: options.method || (body ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        "x-routemeet-client": "planner",
        cookie,
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.headers.get("set-cookie") && !cookie)
      cookie = res.headers.get("set-cookie").split(";")[0];
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  }
  const config = await call("/config");
  assert.equal(config.status, 200, JSON.stringify(config));
  assert.equal(config.body.maptilerConfigured, false);
  assert.equal(
    (await call("/places/search", { mode: "demo", query: "Arlington" })).body
      .places.length,
    1,
  );
  assert.equal(
    (await call("/places/search", { mode: "maptiler", query: "DC" })).status,
    503,
  );
  const search = await call("/optimize", trip);
  assert.equal(search.status, 200);
  assert.equal(search.body.candidates.length, 8);
  assert.ok(search.body.recommendedIds.length >= 1 && search.body.recommendedIds.length <= 5);
  assert.ok(search.body.candidates.every((v) => v.comparisonStatus === "ready"));
  assert.equal(search.body.origins.length, 3);
  assert.ok(search.body.origins.every((p) => !("maxMinutes" in p)));
  const selection = {
    searchId: search.body.searchId,
    venueId: search.body.candidates[0].id,
  };
  assert.equal((await call("/routes", selection)).status, 200);
  assert.equal(
    (await call("/routes", selection, { headers: { cookie: "" } })).status,
    410,
  );
  assert.equal(
    (await call("/routes", { ...selection, venueId: "not-in-results" })).status,
    400,
  );
  assert.equal(
    (await call("/routes", { ...selection, searchId: "expired" })).status,
    410,
  );
  const group = await call("/groups", {
    ...trip,
    name: "QA group",
    objective: "efficient",
    participants: trip.participants.map((p) => ({ ...p, maxMinutes: 1 })),
  });
  assert.equal(group.status, 201);
  const meetup = await call("/meetups", { ...selection, label: "QA meetup" });
  assert.equal(meetup.status, 201);
  const savedGroup = (await call("/groups")).body.groups[0];
  assert.equal(savedGroup.participants.length, 3);
  assert.equal(savedGroup.objective, "balanced");
  assert.ok(savedGroup.participants.every((p) => !("maxMinutes" in p)));
  assert.equal((await call("/meetups")).body.meetups.length, 1);
  assert.equal(
    (await call("/groups", undefined, { headers: { cookie: "" } })).body.groups
      .length,
    0,
  );
  assert.equal(
    (
      await call("/optimize", {
        ...trip,
        participants: trip.participants.slice(0, 1),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/optimize", trip, {
        headers: { origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/groups",
        { ...trip, name: "blocked" },
        { headers: { "x-routemeet-client": "" } },
      )
    ).status,
    403,
  );
  const empty = await fetch(base + "/routes", {
    method: "POST",
    headers: { "x-routemeet-client": "planner" },
  });
  assert.equal(empty.status, 410);
  const invalid = await fetch(base + "/optimize", {
    method: "POST",
    headers: {
      "x-routemeet-client": "planner",
      "content-type": "application/json",
    },
    body: "{broken",
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    (await call(`/groups/${group.body.id}`, undefined, { method: "DELETE" }))
      .status,
    204,
  );
  assert.equal(
    (await call(`/meetups/${meetup.body.id}`, undefined, { method: "DELETE" }))
      .status,
    204,
  );
  assert.equal((await call("/groups")).body.groups.length, 0);
});

test("MapTiler mode resolves saved places with owner isolation and rejects retired provider requests", async (t) => {
  const database = openDatabase(":memory:");
  const origins = { a: { lat: 38.9, lon: -77.04 }, b: { lat: 38.91, lon: -77.03 } };
  const place = { id: 'poi.cafe', name: 'Test cafe', address: 'Test address', lat: 38.905, lon: -77.035, mapsUrl: 'https://www.openstreetmap.org/?mlat=38.905&mlon=-77.035' };
  const source = {
    place: async (id) => id === place.id ? place : { ...origins[id], id, address: id },
    searchPlaces: async () => [place], searchVenues: async () => [place],
    matrix: async () => [[300], [420]],
    routes: async () => [{ participantId: 'a', seconds: 300, path: [origins.a, place] }],
  };
  const venueProvider = { searchArea: async () => ({ venues: [place], diagnostics: { venueSource: "Test directory", coverageNote: "Fixture" } }), place: async () => place };
  const server = createApp({ database, maptilerProvider: source, venueProvider }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.close(); database.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const config = await fetch(base + '/config');
  const cookie = config.headers.get('set-cookie').split(';')[0];
  assert.equal((await config.json()).maptilerConfigured, true);
  const post = async (path, body) => fetch(base + path, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-routemeet-client': 'planner' }, body: JSON.stringify(body) });
  assert.equal((await post('/places/search', { mode: 'apple', query: 'DC' })).status, 400);
  const search = await post('/optimize', { ...trip, mode: 'maptiler', participants: ['a', 'b'].map((id) => ({ id, name: id, address: 'typed place', placeId: id })) });
  assert.equal(search.status, 200);
  const result = await search.json();
  assert.match(result.traffic, /no live traffic/);
  const selected = { searchId: result.searchId, venueId: place.id };
  assert.equal((await post('/routes', selected)).status, 200);
  const saved = await (await post('/meetups', { ...selected, label: 'Test meetup' })).json();
  const url = base + `/meetups/${saved.id}/place`;
  assert.equal((await fetch(url)).status, 404);
  const resolved = await fetch(url, { headers: { cookie } });
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).place.mapsUrl, place.mapsUrl);
  const legacy = database.saveGroup('old-owner', { ...trip, mode: 'apple', name: 'Legacy' });
  assert.ok(legacy);
  assert.equal(database.groups('old-owner')[0].mode, 'apple');
});

async function catalogFixture(t, count = 48) {
  const database = openDatabase(":memory:");
  const origins = { a: { lat: 38.9, lon: -77.04 }, b: { lat: 38.91, lon: -77.03 } };
  const venues = Array.from({ length: count }, (_, i) => ({ id: `osm:node:${i + 1}`, name: `Coffee ${i + 1}`, address: "Fixture street", lat: 38.905 + i * 0.00001, lon: -77.035, mapsUrl: `https://www.openstreetmap.org/node/${i + 1}` }));
  const state = { matrixError: null, matrixHook: null, allUnreachable: false, matrixCalls: [], searchedAreas: [], resolvedVenueIds: [] };
  const source = {
    place: async (id) => ({ ...origins[id], id, address: id }),
    searchPlaces: async () => [],
    matrix: async (people, places, signal) => {
      state.matrixCalls.push(places.map((place) => place.id));
      if (state.matrixHook) await state.matrixHook(signal, places);
      if (state.matrixError) throw state.matrixError;
      return people.map((_, row) => places.map((place) => state.allUnreachable || place.id === "osm:node:1" ? null : 300 + row * 40));
    },
    routes: async (people, venue) => people.map((person) => ({ participantId: person.id, seconds: 300, path: [person, venue] })),
  };
  const venueProvider = {
    searchArea: async (area) => {
      state.searchedAreas.push(area);
      return { venues, diagnostics: { venueSource: "OpenStreetMap", coverageNote: "All matching fixture places in the requested area.", searchQueries: 1 } };
    },
    place: async (id) => {
      state.resolvedVenueIds.push(id);
      return venues.find((venue) => venue.id === id);
    },
  };
  const server = createApp({ database, maptilerProvider: source, venueProvider }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.close(); database.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const config = await fetch(base + "/config");
  const cookie = config.headers.get("set-cookie").split(";")[0];
  const call = async (path, body, ownerCookie = cookie, signal) => {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { cookie: ownerCookie, "content-type": "application/json", "x-routemeet-client": "planner" },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    return { status: response.status, body: await response.json() };
  };
  const input = { ...trip, mode: "maptiler", participants: ["a", "b"].map((id) => ({ id, name: id, address: "Typed starting place", placeId: id })) };
  return { call, input, state, venues, server };
}

test("the full venue catalog remains selectable, comparable, and saveable beyond the initial 32 places", async (t) => {
  const { call, input, state, venues } = await catalogFixture(t);
  const search = await call("/optimize", input);
  assert.equal(search.status, 200);
  assert.equal(search.body.candidates.length, 48);
  assert.deepEqual(search.body.candidates.map((venue) => venue.id), venues.map((venue) => venue.id));
  assert.equal(search.body.diagnostics.initialEvaluatedVenues, 32);
  assert.equal(search.body.diagnostics.totalVenues, 48);
  assert.match(search.body.diagnostics.recommendationScope, /32 of 48/);
  assert.equal(search.body.candidates.filter((venue) => venue.comparisonStatus === "pending").length, 16);
  assert.equal(search.body.candidates[0].comparisonStatus, "unreachable");
  assert.equal(search.body.candidates[0].perPerson, undefined);
  assert.ok(search.body.recommendedIds.length <= 5);
  assert.equal(state.matrixCalls[0].length, 32);
  const selected = { searchId: search.body.searchId, venueId: venues.at(-1).id };
  assert.equal(search.body.candidates.at(-1).comparisonStatus, "pending");
  assert.equal((await call("/venues/compare", selected, "")).status, 410);
  assert.equal((await call("/venues/compare", { ...selected, venueId: "osm:node:99999" })).status, 400);
  const comparison = await call("/venues/compare", selected);
  assert.equal(comparison.status, 200);
  assert.equal(comparison.body.venue.comparisonStatus, "ready");
  assert.equal(comparison.body.venue.recommended, false);
  assert.equal(comparison.body.venue.perPerson.length, 2);
  assert.deepEqual(state.matrixCalls[1], [selected.venueId]);
  assert.equal((await call("/venues/compare", selected)).status, 200);
  assert.equal(state.matrixCalls.length, 2);
  assert.equal((await call("/routes", selected)).status, 200);
  for (const venueId of [venues[0].id, venues.at(-2).id, selected.venueId]) {
    const saved = await call("/meetups", { searchId: selected.searchId, venueId, label: "Chosen place" });
    assert.equal(saved.status, 201);
    const resolved = await call(`/meetups/${saved.body.id}/place`);
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.place.id, venueId);
    assert.equal((await call(`/meetups/${saved.body.id}/place`, undefined, "")).status, 404);
  }
  assert.deepEqual(state.resolvedVenueIds, [venues[0].id, venues.at(-2).id, selected.venueId]);
});

test("routing timeouts and quotas preserve the entire catalog and allow later one-place retries", async (t) => {
  for (const [name, error, status] of [
    ["timeout", new DOMException("Upstream timeout", "TimeoutError"), 503],
    ["quota", new ServiceError("Private provider details", 429, "DAILY_BUDGET"), 429],
  ]) {
    await t.test(name, async (t) => {
      const { call, input, state, venues } = await catalogFixture(t);
      state.matrixError = error;
      const search = await call("/optimize", input);
      assert.equal(search.status, 200);
      assert.equal(search.body.candidates.length, venues.length);
      assert.ok(search.body.candidates.every((venue) => venue.comparisonStatus === "pending"));
      assert.deepEqual(search.body.recommendedIds, []);
      assert.equal(search.body.diagnostics.initialEvaluatedVenues, 0);
      assert.match(search.body.comparisonError, /still browse every place/);
      assert.doesNotMatch(search.body.comparisonError, /Private provider details/);
      const selected = { searchId: search.body.searchId, venueId: venues.at(-1).id };
      assert.equal((await call("/venues/compare", selected)).status, status);
      state.matrixError = null;
      const retry = await call("/venues/compare", selected);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.venue.comparisonStatus, "ready");
      assert.equal(retry.body.venue.recommended, false);
    });
  }
});

test("unreachable catalogs are browseable and search radius is validated before calling services", async (t) => {
  const { call, input, state } = await catalogFixture(t);
  for (const radiusKm of [0, 2, 51, "10", 3.5])
    assert.equal((await call("/optimize", { ...input, radiusKm })).status, 400);
  assert.equal(state.searchedAreas.length, 0);
  state.allUnreachable = true;
  const search = await call("/optimize", { ...input, radiusKm: 10 });
  assert.equal(search.status, 200);
  assert.equal(search.body.candidates.length, 48);
  assert.deepEqual(search.body.recommendedIds, []);
  assert.equal(search.body.searchArea.radiusMeters, 10000);
  assert.equal(state.searchedAreas[0].radiusMeters, 10000);
  assert.equal(search.body.candidates.filter((venue) => venue.comparisonStatus === "unreachable").length, 32);
  const compared = await call("/venues/compare", { searchId: search.body.searchId, venueId: "osm:node:48" });
  assert.equal(compared.status, 200);
  assert.equal(compared.body.venue.comparisonStatus, "unreachable");
  assert.equal(compared.body.venue.perPerson, undefined);
  const automatic = await call("/optimize", { ...input, radiusKm: null });
  assert.equal(automatic.status, 200);
  assert.equal(automatic.body.searchArea.radiusMeters, 3000);
});

test("the cache evicts entire old searches by total venue count without truncating either response", async (t) => {
  const { call, input } = await catalogFixture(t, 25001);
  const first = await call("/optimize", input);
  const second = await call("/optimize", input);
  assert.equal(first.body.candidates.length, 25001);
  assert.equal(second.body.candidates.length, 25001);
  const venueId = "osm:node:25001";
  assert.equal((await call("/venues/compare", { searchId: first.body.searchId, venueId })).status, 410);
  assert.equal((await call("/venues/compare", { searchId: second.body.searchId, venueId })).status, 200);
});

test("a cancelled search never caches late provider results or evicts a still-active catalog", async (t) => {
  const { call, input, state } = await catalogFixture(t, 25001);
  const first = await call("/optimize", input);
  const started = Promise.withResolvers(), cancelled = Promise.withResolvers();
  state.matrixHook = (signal) => new Promise((resolve) => {
    started.resolve();
    signal.addEventListener("abort", () => {
      state.matrixHook = null;
      resolve(); // Simulate a provider returning late despite cancellation.
      cancelled.resolve();
    }, { once: true });
  });
  const controller = new AbortController();
  const request = call("/optimize", input, undefined, controller.signal);
  await started.promise;
  controller.abort();
  await assert.rejects(request, (error) => error.name === "AbortError");
  await cancelled.promise;
  await new Promise(setImmediate);
  const existing = await call("/venues/compare", { searchId: first.body.searchId, venueId: "osm:node:25001" });
  assert.equal(existing.status, 200);
});

test("cancelling one of two shared comparison requests does not cancel the remaining caller", async (t) => {
  const { call, input, state, server } = await catalogFixture(t);
  const search = await call("/optimize", input);
  const selected = { searchId: search.body.searchId, venueId: "osm:node:48" };
  const started = Promise.withResolvers(), release = Promise.withResolvers(), subscribed = Promise.withResolvers();
  let sharedSignal, comparisonRequests = 0;
  state.matrixHook = async (signal) => { sharedSignal = signal; started.resolve(); await release.promise; };
  server.on("request", (req) => {
    if (req.url === "/api/venues/compare" && ++comparisonRequests === 2)
      req.on("end", () => setImmediate(subscribed.resolve));
  });
  const controller = new AbortController();
  const first = call("/venues/compare", selected, undefined, controller.signal);
  await started.promise;
  const second = call("/venues/compare", selected);
  await subscribed.promise;
  controller.abort();
  await assert.rejects(first, (error) => error.name === "AbortError");
  await new Promise(setImmediate);
  assert.equal(sharedSignal.aborted, false);
  release.resolve();
  const surviving = await second;
  assert.equal(surviving.status, 200);
  assert.equal(surviving.body.venue.comparisonStatus, "ready");
  assert.equal(state.matrixCalls.length, 2); // One initial matrix and one shared comparison.
});

test("an abandoned comparison aborts its service call and a later retry starts fresh", async (t) => {
  const { call, input, state } = await catalogFixture(t);
  const search = await call("/optimize", input);
  const selected = { searchId: search.body.searchId, venueId: "osm:node:48" };
  const started = Promise.withResolvers(), cancelled = Promise.withResolvers();
  state.matrixHook = (signal) => new Promise((resolve) => {
    started.resolve();
    signal.addEventListener("abort", () => {
      state.matrixHook = null;
      resolve();
      cancelled.resolve();
    }, { once: true });
  });
  const controller = new AbortController();
  const request = call("/venues/compare", selected, undefined, controller.signal);
  await started.promise;
  controller.abort();
  await assert.rejects(request, (error) => error.name === "AbortError");
  await cancelled.promise;
  const retried = await call("/venues/compare", selected);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.venue.comparisonStatus, "ready");
  assert.equal(state.matrixCalls.length, 3);
});
