import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { getPersonColor } from "../lib/colors.js";

function createPersonIcon(index) {
  const color = getPersonColor(index);
  return L.divIcon({
    className: "person-marker-icon",
    html: `<div class="person-marker" style="--marker-color:${color}">${index + 1}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

const winnerIcon = L.divIcon({
  className: "winner-marker-icon",
  html: '<div class="winner-marker"><span class="winner-pulse"></span><span class="winner-core"></span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
});

const venueIcon = L.divIcon({
  className: "venue-marker-icon",
  html: '<div class="venue-marker"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -8],
});

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

export default function MapView({ origins, topCandidate }) {
  const venues = topCandidate?.venues || [];
  // When we found a real venue matching the requested activity, that's what
  // the group should actually walk into -- not the abstract fairness-grid
  // point, which can land a few hundred meters away on an unrelated street.
  // The closest match (venues[0], pre-sorted by distance in the backend)
  // becomes the winner pin; any others are shown as smaller secondary pins.
  const nearestVenue = venues[0] || null;
  const winnerPoint = nearestVenue
    ? { lat: nearestVenue.lat, lon: nearestVenue.lon }
    : topCandidate;
  const secondaryVenues = nearestVenue ? venues.slice(1) : venues;

  const allPoints = topCandidate ? [...origins, topCandidate, ...venues] : origins;
  const center = origins.length
    ? [origins[0].lat, origins[0].lon]
    : [38.9072, -77.0369];

  const personIcons = useMemo(
    () => origins.map((_, i) => createPersonIcon(i)),
    [origins]
  );

  return (
    <>
      <div className="map-wrap">
        <MapContainer center={center} zoom={11} style={{ height: "420px", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            detectRetina
          />
          {origins.map((o, i) => (
            <Marker key={`origin-${i}`} position={[o.lat, o.lon]} icon={personIcons[i]}>
              <Popup>
                Person {i + 1}
                <br />
                {o.address || `${o.lat.toFixed(4)}, ${o.lon.toFixed(4)}`}
              </Popup>
            </Marker>
          ))}
          {topCandidate && (
            <Marker position={[winnerPoint.lat, winnerPoint.lon]} icon={winnerIcon}>
              <Popup>
                <strong>{nearestVenue ? nearestVenue.name : "Recommended meeting point"}</strong>
                <br />
                {nearestVenue ? `${topCandidate.placeName} area` : topCandidate.placeName}
              </Popup>
            </Marker>
          )}
          {secondaryVenues.map((v, i) => (
            <Marker key={`venue-${i}`} position={[v.lat, v.lon]} icon={venueIcon}>
              <Popup>
                {v.name}
                <br />
                {(v.distanceMeters / 1000).toFixed(1)} km from the meeting point
              </Popup>
            </Marker>
          ))}
          <FitBounds points={allPoints} />
        </MapContainer>
      </div>

      <div className="map-legend">
        {origins.map((o, i) => (
          <span className="legend-item" key={i} style={{ "--marker-color": getPersonColor(i) }}>
            <span className="legend-dot" />
            {o.address}
          </span>
        ))}
        {topCandidate && (
          <span className="legend-item legend-winner">
            <span className="legend-dot" />
            {nearestVenue ? nearestVenue.name : "Recommended point"}
          </span>
        )}
        {secondaryVenues.length > 0 && (
          <span className="legend-item legend-venue">
            <span className="legend-dot" />
            Other suggested spots
          </span>
        )}
      </div>
    </>
  );
}
