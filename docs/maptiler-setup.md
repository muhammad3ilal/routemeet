# Connect MapTiler to RouteMeet

MapTiler provides street-map tiles and starting-place search. OpenStreetMap’s Overpass API provides category catalogs for the search area. OSRM provides the driving-time matrix and road geometry. RouteMeet's custom optimizer ranks meeting places; SQLite stores saved groups. No Apple Developer account or Google Cloud project is needed.

## 1. Create your account and keys

Create an account at https://cloud.maptiler.com/ and open **API keys**. Create two keys so browser-origin restrictions do not break backend lookups:

- **Browser map key:** in Allowed HTTP origins, enter `127.0.0.1` and `localhost` on separate lines, without protocol or port, for development. Use a separate production key restricted to your real domain; remove localhost rules from that key. This key is intentionally visible in the frontend bundle.
- **Server geocoding key:** keep it only in the backend environment. Do not apply browser HTTP-origin restrictions to a server request that has no browser Origin/Referer. MapTiler recommends a dedicated backend key; browser-origin restrictions do not apply to this server-only use. Never include this key in a `VITE_` variable.

The free plan is usage-limited and intended for testing, prototyping, personal or noncommercial projects. Check your dashboard's current map-tile and geocoding allowances. Leaflet raster tiles are billed/counted as tile requests, not MapTiler SDK sessions. The required logo and attribution stay inside the map.

## 2. Add keys locally

Project folder: `/Users/muhammadbilal/Documents/2026-09-27/can/work/routemeet`.

In `frontend/.env.local`, fill the existing blank line:

```dotenv
VITE_MAPTILER_KEY=your_browser_map_key
```

In `backend/.env`, fill:

```dotenv
MAPTILER_API_KEY=your_server_geocoding_key
OSRM_URL=https://router.project-osrm.org
```

These local files are ignored by Git. Do not paste keys into chat. Old `APPLE_*` variables are ignored and can be removed; no Apple token signing or SDK remains in the active application.

## 3. Restart

Use Node.js 24 or later. Stop the existing backend and frontend, then run these in separate terminals from the project folder:

```sh
cd backend
npm ci
npm start
```

```sh
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. A production frontend must be rebuilt after changing its browser key. Changing the backend key requires restarting the backend.

## 4. Check the connection

Select **MapTiler**. Enter a named landmark plus city for each person, press **Search**, and select the matching place. Choose **Find places to meet**. Select a result, then **Show driving routes**. The lines should follow roads. Choose Meet here to open an inline QR code and Apple Maps link for your phone.

The code is covered by mocked provider tests; a real key acceptance test still needs your account. Example mode works without keys. Street maps need the browser key; search and comparison need the server key.

## Routing and usage

OSRM's public demo is a development convenience, with no key required. It has a maximum of one request per second and prohibits heavy use. RouteMeet serializes requests at least 1.1 seconds apart in its single backend process. For a public launch, configure `OSRM_URL` to your own OSRM server or a provider that supports its API and your expected usage. Multiple backend instances need a shared limiter. The demo service is not a production availability guarantee.

Driving times do **not** include live traffic. Places without a driving route stay in the catalog, labeled as unavailable for driving comparison. No route is replaced with a straight-line guess.

Backend defaults are 200 external requests and 2,000 origin–destination matrix elements per UTC day, persisted across restarts. Change `MAP_MAX_REQUESTS_PER_DAY` and `MAP_MAX_MATRIX_ELEMENTS_PER_DAY` in `backend/.env` as appropriate. These local guardrails are separate from MapTiler account quotas. Browser tile requests are not counted by the backend, so monitor MapTiler Cloud usage too.

## Category coverage

The map and default list include all matching objects returned by the area category query, including unnamed mapped shops. Balanced recommendations are badges and an optional filter; they do not hide the rest of the catalog. Search names/addresses or page through the results. Change Search area to widen or narrow the circle around the meeting center.

OpenStreetMap coverage is incomplete in some places; all returned mapped objects does not mean every real-world business. Closed/disused tags are excluded. Partial or timed-out catalog responses are reported as errors rather than labeled complete. Initial driving comparisons cover 32 central candidates; selecting another place requests its times separately. An unavailable routing service does not hide the catalog.

Local development defaults to `OVERPASS_URL=https://overpass-api.de/api/interpreter`, with no API key. Category searches are serialized and response size is bounded. Public Overpass is shared infrastructure; configure your own or hosted endpoint before a public production rollout. See the [Overpass usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

## Saved plans and troubleshooting

- Old Apple groups keep their names and typed starting places. Old travel limits are removed automatically. Loading one clears its old provider IDs; search and confirm the places again, then save a new group. Historical meetup choices remain visible but must be found again with MapTiler.
- MapTiler feature IDs can change after reindexing. If a saved place is unavailable, search it again. The app never substitutes an unrelated place silently.
- Search works but map does not: check the browser key, exact allowed origins, account quota and network connection.
- Credential error: check the separate server key and its restrictions, then restart.
- Routing unavailable: retry later or configure your own compatible OSRM endpoint.
- Search expired: find places again; temporary results expire after ten minutes.

References: [API keys](https://docs.maptiler.com/guides/credentials/api-key/), [pricing](https://www.maptiler.com/cloud/pricing/), [geocoding](https://docs.maptiler.com/cloud/api/geocoding/), [Leaflet raster maps](https://docs.maptiler.com/leaflet/examples/raster-tiles-in-leaflet-js/), [OSRM API](https://project-osrm.org/docs/v5.24.0/api/), [public routing usage policy](https://routing.openstreetmap.de/about.html).
