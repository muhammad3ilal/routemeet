# RouteMeet

**Find the fairest real-world place for a group to meet — based on actual driving time, not just the geographic midpoint.**

If four friends are coming from Washington DC, Arlington, Alexandria, and Fairfax, the geometric midpoint between their addresses is rarely a *fair* place to meet — it ignores roads, traffic patterns, and the fact that one person might get stuck with a 45-minute drive while everyone else drives 15. RouteMeet solves for travel time instead of straight-line distance, and optimizes for **fairness**, not just speed.

## Why this project exists

This started as a portfolio project to demonstrate full-stack engineering with a genuine algorithmic component, rather than another CRUD todo app. It combines:

- **Geospatial APIs** — geocoding and real road-network routing
- **An optimization problem with a real objective function** — not just sorting a list
- **A meaningful design decision to explain in interviews** — fairness vs. efficiency tradeoffs

## How it works

1. **Geocode** every person's starting address into coordinates (OpenStreetMap Nominatim).
2. **Generate candidates**: build a grid of possible meeting points spanning (and slightly padded beyond) the bounding box of everyone's location, plus the exact geometric centroid as a baseline.
3. **Compute a travel-time matrix**: send every origin and every candidate to OSRM's `table` service in a **single request**, which returns real driving-time durations for every (person, candidate) pair at once — this is the key efficiency trick that keeps the app fast even with 6+ people and dozens of candidates.
4. **Score and rank candidates two ways**:
   - **Fairest** (egalitarian / Rawlsian objective): minimize the *worst* individual travel time, so no one person is stuck with a dramatically longer drive than everyone else. Ties are broken by standard deviation across the group.
   - **Fastest total** (utilitarian objective): minimize the *combined* travel time across the group, even if that means one person drives noticeably more than others.
5. **Reverse-geocode** the top few results into human-readable place names for display.

Surfacing both rankings side by side is deliberate — it makes the fairness/efficiency tradeoff visible instead of hiding it behind a single "best" answer, which is a much more interesting product and algorithm decision to talk about in an interview than "we sorted by distance."

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React (Vite) + Leaflet/react-leaflet | Fast dev loop, map rendering with OpenStreetMap tiles |
| Backend | Node.js + Express | Simple REST API, orchestrates the geocoding/routing/scoring pipeline |
| Geocoding | OpenStreetMap Nominatim (free, no API key) | No API key management required for a portfolio project |
| Routing | OSRM `table` service (free public demo server) | Real road-network driving times, batched many-to-many in one request |
| Testing | Node's built-in test runner (`node --test`) | Zero extra dependencies; unit tests for the scoring algorithm plus an integration test against mocked geocoding/routing servers |

No database — the app is stateless by design, which kept the scope achievable while still being a legitimate full-stack, multi-service project.

## Project structure

```
routemeet/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── routes/optimize.js     # POST /api/optimize
│   ├── services/
│   │   ├── nominatim.js       # geocoding + reverse geocoding, rate-limited
│   │   ├── osrm.js            # travel-time matrix (OSRM table service)
│   │   ├── candidates.js      # candidate meeting-point grid generation
│   │   ├── fairness.js        # the scoring/ranking algorithm
│   │   └── overpass.js        # free-text activity -> venue search (typo-tolerant), rate-limited
│   └── test/
│       ├── fairness.test.js             # unit tests (pure logic, no network)
│       ├── optimize.integration.test.js # full API test against mock servers
│       └── mock-apis.js                 # standalone mocks for manual local testing
└── frontend/
    └── src/
        ├── App.jsx                      # top-level state + layout
        ├── api.js                       # backend API client
        └── components/
            ├── AddressForm.jsx          # dynamic 2-8 person address input
            ├── ActivityPicker.jsx        # free-text "what do you want to do" input
            ├── MapView.jsx               # Leaflet map: origins, recommended point, venues
            └── ResultsTable.jsx          # ranked results, per-person breakdown, suggested venues
```

## Running it locally

Requires Node.js 18+ (uses the built-in `fetch` API).

**Backend:**
```bash
cd backend
npm install
npm start          # listens on http://localhost:4000
```

**Frontend** (in a second terminal):
```bash
cd frontend
npm install
npm run dev         # opens on http://localhost:5173
```

Then open the frontend URL, enter 2–8 addresses, and submit. The backend calls the free public Nominatim and OSRM demo servers, so **an internet connection is required** and results may be rate-limited or briefly unavailable if those public demo servers are under load (they're meant for light/demo traffic, not production use).

## Running the tests

```bash
cd backend
npm test
```

This runs:
- Unit tests for candidate generation and the fairness-scoring math (no network required)
- An integration test that spins up local mock Nominatim/OSRM servers and exercises the real `POST /api/optimize` route end to end, verifying the full pipeline shape and that "fairest" actually returns the candidate with the smallest worst-case time

To manually poke at the API against mock data without touching the real public APIs, run `node test/mock-apis.js` in one terminal and start the backend with `NOMINATIM_BASE_URL=http://localhost:5001 OSRM_BASE_URL=http://localhost:5002 npm start` in another.

## API

**`POST /api/optimize`**

Request body:
```json
{
  "addresses": ["Washington, DC", "Arlington, VA", "Alexandria, VA", "Fairfax, VA"],
  "activity": "grab coffee"
}
```

`activity` is optional free text -- typos and phrases are fine ("cofee", "bowlin", "let's get sushi"). It's matched (with fuzzy/typo tolerance) against a curated set of OSM categories; anything unrecognized falls back to a generic name/cuisine search on real map data instead of being rejected. When an activity is present, candidates are drawn from a wider pool and re-ranked to prefer ones that actually have a matching venue nearby, so the recommended point isn't a fair-but-empty spot.

Response (abbreviated):
```json
{
  "origins": [{ "address": "Washington, DC", "resolvedAddress": "...", "lat": 38.9, "lon": -77.0 }, ...],
  "fairest": [
    {
      "lat": 38.85, "lon": -77.10, "placeName": "...",
      "maxSeconds": 1320, "avgSeconds": 980, "spreadSeconds": 600,
      "perPerson": [{ "origin": "Washington, DC", "minutes": 22 }, ...],
      "venues": [{ "name": "...", "lat": 38.85, "lon": -77.10, "distanceMeters": 210 }]
    }
  ],
  "fastest": [ /* same shape, ranked by total travel time */ ],
  "activityLabel": "Coffee"
}
```

`venues` and `activityLabel` are only present when `activity` was provided.

## Known limitations / honest tradeoffs

Worth naming these up front, both because they're true and because being able to discuss them is part of what makes this a good interview talking point:

- **Grid search, not gradient-based optimization.** Sampling a 6×6 grid around the bounding box is simple and explainable but not the most sample-efficient way to search — a proper solver (e.g. minimizing a Rawlsian objective via gradient-free optimization like Nelder-Mead over the travel-time surface) would converge faster and could refine near the best candidate instead of a fixed grid.
- **Driving only.** OSRM's public demo server only supports the driving profile; a "fair for everyone regardless of transit mode" version would need per-person mode of transport.
- **No traffic/time-of-day awareness.** OSRM's free routing doesn't model live traffic, so "22 minutes" is a free-flow estimate, not a realistic Tuesday-at-5pm estimate.
- **Public demo servers, not production infrastructure.** Nominatim, OSRM, and Overpass's public servers are rate-limited and explicitly meant for light use — a production version would self-host all three. Overpass in particular applies adaptive, load-based throttling per IP: a burst of testing can make it progressively slower to respond (even without erroring), which shows up as venue search taking noticeably longer after repeated use in a short window.

## Possible extensions

- Snap the recommended point to an actual venue (coffee shop, restaurant) via a places API, instead of a bare coordinate
- Support walking/transit/biking modes per person
- Let users save and share a computed meeting point via a shareable link
- Swap the grid search for a proper optimizer (e.g., minimize max travel time via gradient-free local search around the best grid point)
- Deploy it (Render/Railway for the backend, Vercel/Netlify for the frontend) and put a live link on the resume

## Suggested resume bullet points

Feel free to adapt one of these — pick whichever best matches the role you're applying for:

> Built RouteMeet, a full-stack app that finds fair group meeting points using real driving-time data from the OSRM routing API, implementing a Rawlsian fairness objective (minimizing worst-case commute) alongside a traditional total-time optimization, with a batched many-to-many travel-time matrix query for efficiency.

> Designed and implemented a travel-time-based optimization algorithm (as opposed to naive geographic midpoint) for a group meeting-point recommender, including unit and integration test coverage for the scoring logic using Node's built-in test runner and mocked external APIs.

> Built a React + Node.js application integrating two external geospatial APIs (OpenStreetMap Nominatim, OSRM), with a documented, testable backend architecture separating geocoding, routing, and scoring concerns into independent services.

## License

this is a portfolio project
