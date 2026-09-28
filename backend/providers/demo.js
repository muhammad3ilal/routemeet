import { distanceKm } from "../algorithms/search.js";
import { ServiceError } from "../errors.js";

// Explicitly fictional example venues and synthetic times. No external provider data.
export const demoOrigins = [
  {
    id: "demo-origin-1",
    name: "DC starting point",
    address: "Washington, DC (example)",
    lat: 38.9072,
    lon: -77.0369,
  },
  {
    id: "demo-origin-2",
    name: "Arlington starting point",
    address: "Arlington, VA (example)",
    lat: 38.8816,
    lon: -77.091,
  },
  {
    id: "demo-origin-3",
    name: "Alexandria starting point",
    address: "Alexandria, VA (example)",
    lat: 38.8048,
    lon: -77.0469,
  },
];
const venues = [
  ["River Table", 38.872, -77.061],
  ["Juniper Room", 38.885, -77.052],
  ["Corner & Cup", 38.857, -77.06],
  ["Common Ground", 38.876, -77.082],
  ["Garden House", 38.851, -77.078],
  ["Market Social", 38.893, -77.066],
  ["The Reading Room", 38.865, -77.04],
  ["Southside Table", 38.835, -77.054],
].map(([name, lat, lon], i) => ({
  id: `demo-venue-${i}`,
  name,
  lat,
  lon,
  address: "Fictional venue · example data",
  attributions: [],
}));

export class DemoProvider {
  async searchPlaces(query) {
    return demoOrigins.filter((p) =>
      `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase()),
    );
  }
  async place(id) {
    const place = demoOrigins.find((p) => p.id === id);
    if (!place)
      throw new ServiceError(
        "Use the supplied example starting places in example mode.",
        422,
      );
    return place;
  }
  async searchVenues(region) {
    return venues.filter(
      (v) => distanceKm(v, region) <= region.radiusMeters / 1000 + 2,
    );
  }
  async matrix(origins, destinations) {
    return origins.map((o, i) =>
      destinations.map((v) =>
        Math.round(
          (distanceKm(o, v) * 2.8 + 3 + (i === 0 && v.lon < -77.06 ? 4 : 0)) *
            60,
        ),
      ),
    );
  }
  async routes() {
    return [];
  }
}
