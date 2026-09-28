# RouteMeet meeting logic and storage

RouteMeet chooses a shared destination from real candidate venues using an origin-to-venue matrix of driving times. MapTiler supplies starting-place search and map tiles; OpenStreetMap/Overpass supplies area-wide category venues; OSRM supplies the road graph, driving estimates and route geometry. RouteMeet owns discovery, comparison, ranking and saved planning data. The estimates exclude live traffic.

## A fair meeting place without personal time limits

The planner asks only who is coming, where they start, and the activity. Saved travel limits and historical ranking preferences no longer influence recommendations.

For each venue, calculate the shortest drive, longest drive, total driving time, and the gap between the longest and shortest drive. Exclude the venue from balanced recommendations if anyone has an unreachable or invalid journey, but keep it visible in the full catalog.

1. Find the smallest achievable longest drive, `bestMax`, across discovered reachable venues.
2. Keep venues with a longest drive no more than `bestMax + max(5 minutes, 20% of bestMax)`. This allows a modest detour for fairness while ruling out arbitrarily distant places with equal journey times.
3. Within that envelope, find the smallest travel-time gap, `bestSpread`. Keep candidates with a gap no greater than `bestSpread + max(3 minutes, 15% of bestMax)` so the list is not padded with poor alternatives.
4. Rank this recommendation shortlist by smallest gap, then shortest longest drive, then total travel, then venue ID. Highlight at most five; fewer is valid. These are recommendation badges, not a cap on the catalog.

These are explicit product tradeoffs, not a claim that one universal fairness formula exists. For example, 20/20 minute drives outrank 1/19 minute drives, while a 60/60 minute detour does not. Every person participates equally, including outliers in groups of three or more. If the best available gap still exceeds `max(5 minutes, 20% of bestMax)`, the UI calls the results compromises rather than claiming a close balance.

## Category discovery and comparison

The geographic meeting center is the smallest-enclosing-circle center of the starting points in a local tangent plane. The automatic search circle includes the group with a buffer, capped at a 50 km radius. A chosen radius of 3–50 km can replace it. The circle is shown on the map.

A single Overpass query retrieves matching OSM nodes, ways and relations by category tags. It has no result-number limit. Coffee search includes tagged cafes and coffee shops regardless of business name. Unnamed venues remain visible using a category fallback. Disused/closed objects are excluded; IDs deduplicate objects without collapsing separate chain branches. Provider remarks, timeout and missing completion counts are treated as incomplete responses, not successful empty catalogs.

All returned venues stay in the owner-scoped search catalog and on the map. The list defaults to all places, offers a name/address filter, and pages in groups of 20. Pagination does not remove map markers. The optional Balanced picks filter is explicit. OpenStreetMap can still omit real-world businesses, so coverage is described as mapped places within the circle.

A geographic minimax heuristic selects at most 32 central venues for initial OSRM comparisons. The fairness rules above highlight suggestions among that checked sample. Other venues have a pending comparison state; selecting one checks its real driving times. Pending and unreachable places remain selectable, saveable and shareable. If the initial routing comparison fails, the catalog remains usable with an inline explanation.

The search cache expires after ten minutes and is bounded by both search count and total venue entries. Old whole searches are evicted rather than silently truncating individual catalogs. An exceptionally large single result asks the user to narrow the area. Any selected venue must belong to the requesting browser’s current search.

Groups are limited to 2–8 people within 300 km of each other. Geographic distance only shapes discovery and the initial sample; it is never shown as a road-time estimate. Driving is the only supported mode. Recommendations are the best under the declared rule among initially compared places, not a global optimum over all businesses.

## Data structures

- Smallest-enclosing-circle candidates from single points, pairs and triples; exhaustive containment is practical for at most eight origins.
- Hash-map venue deduplication across the full area catalog and a bounded initial origin–destination travel matrix.
- O(NC) scoring and constraint checks, followed by a bounded top-five heap in O(C log K).
- A sorted O(C log C) Pareto comparison for longest drive and imbalance.
- SQLite indexed owner-scoped reads, parameterized statements and transactional writes.

Routes are fetched for the selected venue only. OSRM matrix dimensions and GeoJSON geometry are validated; null journeys stay unreachable instead of becoming straight-line guesses. Public OSRM demo requests are serialized with a 1.1-second minimum interval. Production needs its own routing arrangement and shared throttling if multiple backend processes run.

## SQLite and saved data

- `groups`: owner capability hash, user-entered name, activity, provider mode, normalized ranking preference and timestamps.
- `participants`: stable ID, group foreign key, position, user-entered name/address and provider place ID. No personal travel limit.
- `meetups`: owner hash, user label, venue place ID, mode/activity/preference and timestamp.
- `usage`: UTC-day external-request and matrix-element counters.
- `schema_migrations`: version 3 removes the old participant time-limit column while retaining saved groups, people, ordering and ownership.

The database defaults to `backend/data/routemeet.sqlite`, with WAL mode, a busy timeout, foreign keys and transactions. Back it up through SQLite or while the server is stopped, rather than copying only the main file of a live WAL database.

An HttpOnly, SameSite=Strict browser capability cookie provides access to saved items. Only a hash of that cookie is stored. This is local prototype identity, not multi-device account authentication. Clearing the cookie loses access but does not delete records.

Fetched places, routing coordinates and search results stay in bounded process memory for ten minutes and are not written to SQLite. MapTiler feature IDs may change after reindexing; missing IDs require a new search. Old-provider groups require reconfirmation. Historical time limits have no effect after migration.

## Sending a chosen destination to a phone

After selecting **Meet here**, the planner generates an Apple Maps URL and QR code locally. The default starts from the phone’s current location; a person’s confirmed starting point can be chosen to share that planned journey. The QR contains the same URL as the copy/open controls. No external QR service receives the route. Sharing uses the device’s share sheet only when the user asks.

Apple computes its own road route and ETA. An Apple Maps link preserves the chosen destination and optional starting coordinates; it cannot encode or guarantee the exact OSRM polyline. This feature needs no Apple API credentials. The app does not send a message to any contact automatically.

## Verification

Algorithm tests cover skewed journeys versus balanced ones, unreasonable equal-time detours, groups and outliers, unreachable venues, participant-order invariance and legacy-budget independence. SQLite tests verify migration without data loss. API tests exercise full catalogs beyond 32 places, lazy comparison, selection/save of the last venue, routing failure recovery and ownership. Apple Maps helper tests verify route coordinates and optional starting points. Browser checks cover real MapTiler/OSRM results, inline phone sharing and responsive layout.
