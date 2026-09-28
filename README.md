# RouteMeet

RouteMeet helps groups find a place to meet with a reasonable drive for everyone. It compares travel times from each person’s starting point and highlights places that balance the journeys without sending the whole group on an unnecessary detour.

## The planner

Groups of two to eight people can browse cafés, restaurants, parks, and other meeting spots within a shared search area. The map shows all places returned for the selected category, with search and pagination in the results list. Balanced recommendations appear alongside the full catalog.

Each compared place shows a driving estimate for every person. Groups and chosen destinations can be saved, and a selected destination can be opened in Apple Maps through a link or QR code. A reset clears the current plan while keeping saved plans.

## Meeting logic

RouteMeet calculates a geographic search center, collects nearby venues, and compares driving times. Its ranking considers the longest journey, the difference between the shortest and longest journeys, and total travel time. A detour allowance prevents a distant venue from ranking well simply because everyone would spend equally long getting there.

The initial comparison covers up to 32 central venues. Other places remain available and are compared when selected. Recommendations reflect the places checked; they are not a guarantee of the best possible destination across the entire area.

## Built with

- React, Vite, and GSAP for the interface and scroll animations.
- Leaflet and MapTiler for maps and address search.
- OpenStreetMap through Overpass for venue data, and OSRM for driving estimates and routes.
- Node.js and Express for the API, with SQLite for saved groups, meetups, and request budgets.

The custom search and ranking code uses geometric algorithms, hash maps, and a bounded heap. The [algorithm and storage notes](docs/algorithm-and-storage.md) describe the implementation.

## Current scope

RouteMeet is a local project. It supports driving only, estimates exclude live traffic, and venue coverage depends on OpenStreetMap. Saved plans belong to the current browser; there are no user accounts or cross-device sync.
