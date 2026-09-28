# RouteMeet

For GitHub push commands and an Azure deployment that preserves the SQLite database, see [Deploy to Azure](docs/deploy-azure.md).

Find a meeting place with balanced driving times for everyone. React + Vite, Express + Node 24, a custom meeting-place optimizer, SQLite, MapTiler maps/address search, OpenStreetMap category catalogs, and OSRM driving routes.

## Run locally

Use Node.js **24 or later**. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Leave the MapTiler values blank to use the clearly labeled example mode.

```sh
cd backend
npm ci
npm start
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173 and choose **Try an example**, then **Find places to meet**. Example venues and travel times are fictional; the ranking and database are real. Save a named group, reload, and load it from **Saved plans**.

For real maps, place search, ETAs, and road routing, follow [MapTiler setup](docs/maptiler-setup.md). Use separate browser and server credentials; never expose the server geocoding key in frontend code.

## What changed

- Confirmed starting places, stable participant identities and explicit stale-result notices. No personal travel-limit setting.
- Area-wide category catalogs with all returned places on the map, searchable paginated browsing, and a separate balanced recommendation layer.
- MapTiler geocoding and Leaflet maps; Overpass category queries; OSRM driving matrices and road geometry. Estimates exclude live traffic.
- SQLite groups, participants, saved meetup choices and daily request budgets.
- Responsive planner, comparable travel bars, keyboard controls, and inline QR/copy/share controls for opening a chosen destination in Apple Maps.

See [algorithm and storage design](docs/algorithm-and-storage.md) for the formulas, complexity, schema, limits and honest optimization guarantees.

## Validate

```sh
cd backend
npm test
cd ../frontend
npm run lint
npm run build
```

Provider tests use deterministic fixtures, not a live MapTiler account. Live credential acceptance and route accuracy must be checked after adding your credentials. Driving only; 2–8 people. All discovered venues remain browsable; 32 central candidates get initial travel comparisons, and any other place can be compared on selection. This is a local prototype, not yet a public service with account authentication or cross-device sync.

`/api` is proxied by Vite to `127.0.0.1:4000`. The API binds to loopback. Production needs a same-origin HTTPS reverse proxy and a persistent backend/database; a static frontend deployment alone is insufficient.
