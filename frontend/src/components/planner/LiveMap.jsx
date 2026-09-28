import { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getPersonColor } from "../../lib/colors.js";

const validPoint = (point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon);
const areaFor = (result) => result.searchArea || result.diagnostics?.searchArea;
function fitWholeArea(map, result) {
  if (!map) return;
  const points = [...result.origins, ...result.candidates].filter(validPoint).map((point) => [point.lat, point.lon]);
  const bounds = L.latLngBounds(points);
  const area = areaFor(result);
  if (validPoint(area) && Number.isFinite(area.radiusMeters)) bounds.extend(L.latLng(area.lat, area.lon).toBounds(area.radiusMeters * 2));
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [42, 42], maxZoom: 14, animate: false });
}
function labelNode(text) {
  const label = document.createElement("span");
  label.textContent = text;
  return label;
}

export default function LiveMap({ result, selectedId, onSelect, routes = [] }) {
  const descriptionId = useId();
  const container = useRef(null), mapRef = useRef(null);
  const markerLayer = useRef(null), selectedLayer = useRef(null), routeLayer = useRef(null), areaLayer = useRef(null), venueRenderer = useRef(null);
  const selectRef = useRef(onSelect), resultRef = useRef(result);
  const [error, setError] = useState("");
  const key = import.meta.env.VITE_MAPTILER_KEY;
  const area = areaFor(result);
  useEffect(() => { selectRef.current = onSelect; resultRef.current = result; }, [onSelect, result]);
  useEffect(() => {
    if (!key) return;
    const map = L.map(container.current, { scrollWheelZoom: false, minZoom: 2, maxZoom: 19, preferCanvas: true });
    mapRef.current = map;
    map.createPane("searchArea").style.zIndex = "300";
    map.createPane("venues").style.zIndex = "450";
    venueRenderer.current = L.canvas({ pane: "venues", padding: 0.3, tolerance: 6 });
    const tiles = L.tileLayer(`https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`, {
      tileSize: 256, maxZoom: 19, crossOrigin: true,
      attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">© MapTiler</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · Routes: <a href="https://project-osrm.org" target="_blank" rel="noreferrer">OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Fix the map</a>',
    }).addTo(map);
    let failures = 0;
    tiles.on("loading", () => { failures = 0; });
    tiles.on("tileerror", () => { failures++; setError("Some map tiles could not load. Check the MapTiler key, allowed origins, connection, and quota."); });
    tiles.on("load", () => { if (!failures) setError(""); });
    areaLayer.current = L.layerGroup().addTo(map);
    markerLayer.current = L.layerGroup().addTo(map);
    selectedLayer.current = L.layerGroup().addTo(map);
    routeLayer.current = L.layerGroup().addTo(map);
    fitWholeArea(map, resultRef.current);
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(container.current);
    return () => {
      resize.disconnect(); map.remove(); mapRef.current = null;
      markerLayer.current = null; selectedLayer.current = null; routeLayer.current = null; areaLayer.current = null; venueRenderer.current = null;
    };
  }, [key]);
  useEffect(() => {
    if (!areaLayer.current) return;
    areaLayer.current.clearLayers();
    if (validPoint(area) && Number.isFinite(area.radiusMeters)) L.circle([area.lat, area.lon], {
      radius: area.radiusMeters, pane: "searchArea", color: "#52685f", weight: 1.5,
      opacity: 0.8, dashArray: "5 6", fillColor: "#52685f", fillOpacity: 0.035, interactive: false,
    }).addTo(areaLayer.current);
  }, [area, key]);
  useEffect(() => {
    if (!markerLayer.current) return;
    markerLayer.current.clearLayers();
    result.origins.forEach((person, index) => {
      if (!validPoint(person)) return;
      const dot = labelNode(String(index + 1));
      dot.className = "map-pin person-pin";
      dot.style.backgroundColor = getPersonColor(index);
      L.marker([person.lat, person.lon], {
        icon: L.divIcon({ className: "routemeet-marker", html: dot, iconSize: [36, 36], iconAnchor: [18, 18] }),
        title: `Starting place ${index + 1}: ${person.name}`, alt: person.name, keyboard: true,
      }).bindTooltip(labelNode(`From ${person.name}`), { direction: "top", offset: [0, -18] }).addTo(markerLayer.current);
    });
    const picks = new Set(result.recommendedIds || []);
    result.candidates.forEach((place) => {
      if (!validPoint(place)) return;
      const recommended = place.recommended || picks.has(place.id);
      L.circleMarker([place.lat, place.lon], {
        renderer: venueRenderer.current, radius: recommended ? 7 : 5,
        color: "#fff", weight: 1.5, fillColor: recommended ? "#d8432e" : "#272925", fillOpacity: 0.9,
      }).bindTooltip(labelNode(place.name), { direction: "top", offset: [0, -5] })
        .on("click", () => selectRef.current(place.id)).addTo(markerLayer.current);
    });
  }, [result.origins, result.candidates, result.recommendedIds, key]);
  useEffect(() => {
    if (!selectedLayer.current) return;
    selectedLayer.current.clearLayers();
    const place = result.candidates.find((venue) => venue.id === selectedId);
    if (!validPoint(place)) return;
    const dot = labelNode("●");
    dot.className = "map-pin venue-pin selected selected-venue-pin";
    dot.style.backgroundColor = "#d8432e";
    L.marker([place.lat, place.lon], {
      icon: L.divIcon({ className: "routemeet-marker", html: dot, iconSize: [36, 36], iconAnchor: [18, 18] }),
      title: `Selected place: ${place.name}`, alt: place.name, keyboard: true, zIndexOffset: 1000,
    }).bindTooltip(labelNode(place.name), { permanent: true, direction: "top", offset: [0, -20], className: "selected-place-tooltip" })
      .on("click", () => selectRef.current(place.id)).addTo(selectedLayer.current);
  }, [result.candidates, selectedId, key]);
  useEffect(() => {
    if (!routeLayer.current) return;
    routeLayer.current.clearLayers();
    for (const route of routes) L.polyline(route.path.map((point) => [point.lat, point.lon]), {
      color: getPersonColor(result.origins.findIndex((person) => person.id === route.participantId)), weight: 5, opacity: 0.85,
    }).addTo(routeLayer.current);
  }, [routes, result.origins, key]);
  return <div className="live-map-wrap">
    <p className="sr-only" id={descriptionId}>All {result.candidates.length} places are shown on this map. Use the searchable place list below to select any place with the keyboard.</p>
    {key && <div ref={container} className="live-map" aria-label="MapTiler meetup map" aria-describedby={descriptionId} />}
    {key && <div className="map-category-legend" aria-label="Map legend"><span><i className="map-legend-dot" />{result.candidates.length.toLocaleString()} places</span><span><i className="map-legend-dot map-legend-pick" />Suggested picks</span>{area && <span><i className="map-legend-area" />{Number((area.radiusMeters / 1000).toFixed(1))} km search radius</span>}</div>}
    {key && <a className="maptiler-logo" href="https://www.maptiler.com/" target="_blank" rel="noreferrer" aria-label="MapTiler"><img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" width="100" height="30" /></a>}
    {(!key || error) && <p className="map-inline-error" role="alert">{error || "Add the browser map key to display the street map."} <a href="/setup.html">Map setup</a>. Your place comparisons are still available below.</p>}
    {key && <button type="button" className="fit-map" onClick={() => fitWholeArea(mapRef.current, resultRef.current)}>Show whole area</button>}
  </div>;
}
