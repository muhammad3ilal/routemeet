export function hasMapCoordinates(place) {
  return Boolean(
    place &&
      Number.isFinite(place.lat) &&
      Number.isFinite(place.lon) &&
      Math.abs(place.lat) <= 90 &&
      Math.abs(place.lon) <= 180,
  );
}

// A destination-only link starts at the phone's current location. Coordinates
// preserve the chosen place even when multiple businesses share the same name.
// https://developer.apple.com/documentation/mapkit/unified-map-urls
export function appleMapsDirections(venue, origin = null) {
  if (!hasMapCoordinates(venue) || (origin !== null && !hasMapCoordinates(origin)))
    return "";
  const url = new URL("https://maps.apple.com/directions");
  url.searchParams.set("destination", `${venue.lat},${venue.lon}`);
  url.searchParams.set("mode", "driving");
  if (origin) url.searchParams.set("source", `${origin.lat},${origin.lon}`);
  return url.toString();
}
