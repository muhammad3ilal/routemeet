import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapTilerProvider, normalizeFeature, decodeMatrix, decodeRoute } from '../providers/maptiler.js';
const feature = (id = 'poi.123') => ({ id, text: 'Cafe', place_name: 'Cafe, Washington', center: [-77.04, 38.9] });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
test('MapTiler normalizes longitude first, rejects malformed coordinates, and resolves only the requested ID', async () => {
  assert.deepEqual([normalizeFeature(feature()).lat, normalizeFeature(feature()).lon], [38.9, -77.04]);
  assert.equal(normalizeFeature({ ...feature(), center: [0, 100] }), null);
  const provider = new MapTilerProvider({ key: 'test-only', fetchImpl: async (url) => {
    assert.equal(url.searchParams.get('key'), 'test-only');
    assert.equal(url.pathname, '/geocoding/poi.123.json');
    return response({ features: [feature('poi.other'), feature()] });
  }});
  assert.equal((await provider.place('poi.123')).id, 'poi.123');
  const stale = new MapTilerProvider({ key: 'test-only', fetchImpl: async () => response({ features: [feature('poi.other')] }) });
  await assert.rejects(stale.place('poi.123'), (e) => e.code === 'PLACE_UNAVAILABLE');
});
test('venue discovery uses bounded POI searches with API-supported limits and handles the date line', async () => {
  const urls = [];
  const provider = new MapTilerProvider({ key: 'test-only', fetchImpl: async (url) => { urls.push(url); return response({ features: [feature()] }); } });
  await provider.searchVenues({ lat: 38.9, lon: -77, radiusMeters: 1000 }, 'coffee');
  assert.equal(urls[0].pathname, '/geocoding/cafe.json');
  assert.equal(urls[0].searchParams.get('types'), 'poi');
  assert.equal(urls[0].searchParams.get('limit'), '10');
  const [w, s, e, n] = urls[0].searchParams.get('bbox').split(',').map(Number);
  assert.ok(w < -77 && e > -77 && s < 38.9 && n > 38.9);
  await provider.searchVenues({ lat: 0, lon: 179.99, radiusMeters: 10000 }, 'parks');
  assert.equal(urls[1].searchParams.has('bbox'), false);
  assert.equal(urls[1].searchParams.get('proximity'), '179.99,0');
});
test('OSRM matrix preserves null routes and uses correctly offset destination columns', async () => {
  let used;
  const provider = new MapTilerProvider({ routingIntervalMs: 0, consume: (n) => { used = n; }, fetchImpl: async (url) => {
    assert.equal(url.pathname, '/table/v1/driving/-77,38;-76,39;-75,40;-74,41');
    assert.equal(url.searchParams.get('sources'), '0;1');
    assert.equal(url.searchParams.get('destinations'), '2;3');
    assert.equal(url.searchParams.has('key'), false);
    return response({ code: 'Ok', durations: [[100, null], [300, 400]] });
  }});
  const result = await provider.matrix([{ lon: -77, lat: 38 }, { lon: -76, lat: 39 }], [{ lon: -75, lat: 40 }, { lon: -74, lat: 41 }]);
  assert.deepEqual(result, [[100, null], [300, 400]]);
  assert.equal(used, 4);
  assert.throws(() => decodeMatrix({ code: 'Ok', durations: [[20]] }, 2, 1));
});
test('OSRM route geometry is validated and tied to the correct participant', async () => {
  const data = { code: 'Ok', routes: [{ duration: 125, distance: 1000, geometry: { type: 'LineString', coordinates: [[-77, 38], [-76, 39]] } }] };
  const provider = new MapTilerProvider({ routingIntervalMs: 0, fetchImpl: async (url) => {
    assert.equal(url.searchParams.get('geometries'), 'geojson');
    return response(data);
  }});
  const [route] = await provider.routes([{ id: 'alex', lat: 38, lon: -77 }], { lat: 39, lon: -76 });
  assert.equal(route.participantId, 'alex');
  assert.deepEqual(route.path, [{ lat: 38, lon: -77 }, { lat: 39, lon: -76 }]);
  assert.throws(() => decodeRoute({ code: 'NoRoute' }), (e) => e.code === 'NO_ROUTE');
  assert.throws(() => decodeRoute({ ...data, routes: [{ ...data.routes[0], geometry: { type: 'LineString', coordinates: [[0, 95], [0, 96]] } }] }));
});
test('missing credentials, forbidden credentials, rate limits and bad JSON produce safe actionable errors', async () => {
  await assert.rejects(new MapTilerProvider().searchPlaces('DC'), (e) => e.status === 503);
  for (const [status, expected] of [[403, 503], [429, 429], [500, 502]]) {
    const provider = new MapTilerProvider({ key: 'secret-key-must-not-leak', fetchImpl: async () => response({ error: 'secret-key-must-not-leak' }, status) });
    await assert.rejects(provider.searchPlaces('DC'), (e) => e.status === expected && !e.message.includes('secret-key-must-not-leak'));
  }
  await assert.rejects(new MapTilerProvider({ key: 'test-only', fetchImpl: async () => new Response('bad json') }).searchPlaces('DC'), /unreadable/);
});
test('cancelled work never calls providers and routing queue recovers after a failure', async () => {
  let calls = 0;
  const provider = new MapTilerProvider({ key: 'test-only', routingIntervalMs: 0, fetchImpl: async () => { calls++; if (calls === 1) throw new Error('network'); return response({ code: 'Ok' }); } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(provider.searchPlaces('DC', controller.signal));
  assert.equal(calls, 0);
  await assert.rejects(provider.routing('route', {}));
  assert.deepEqual(await provider.routing('route', {}), { code: 'Ok' });
});
