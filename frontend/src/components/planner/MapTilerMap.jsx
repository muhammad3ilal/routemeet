import { lazy, Suspense } from "react";
import { getPersonColor } from "../../lib/colors.js";
const LiveMap = lazy(() => import("./LiveMap.jsx"));

function ExampleMap({ result, selectedId, onSelect }) {
  const points = [...result.origins, ...result.candidates];
  const minLat = Math.min(...points.map((p) => p.lat)),
    maxLat = Math.max(...points.map((p) => p.lat));
  const minLon = Math.min(...points.map((p) => p.lon)),
    maxLon = Math.max(...points.map((p) => p.lon));
  const position = (p) => ({
    left: `${14 + ((p.lon - minLon) / (maxLon - minLon || 1)) * 72}%`,
    top: `${14 + ((maxLat - p.lat) / (maxLat - minLat || 1)) * 64}%`,
  });
  return (
    <div
      className="example-map"
      aria-label="Illustrative positions of example places; not a street map"
    >
      <div className="diagram-caption">
        EXAMPLE LAYOUT<span>Fictional venues · synthetic travel times</span>
      </div>
      {result.origins.map((p, i) => (
        <div key={p.id} className="diagram-person" style={position(p)}>
          <span style={{ background: getPersonColor(i) }}>{i + 1}</span>
          <b>{p.name}</b>
        </div>
      ))}
      {result.candidates.map((v) => (
        <button
          type="button"
          key={v.id}
          className={`diagram-venue ${v.id === selectedId ? "selected" : ""}`}
          style={position(v)}
          aria-label={`Select ${v.name}`}
          aria-pressed={v.id === selectedId}
          onClick={() => onSelect(v.id)}
        >
          {v.id === selectedId ? "●" : "○"}
          <span>{v.name}</span>
        </button>
      ))}
      <p className="diagram-note">Example layout. Not a street map.</p>
    </div>
  );
}

export default function MapTilerMap(props) {
  if (!props.result)
    return (
      <div className="map-empty">
        <div className="empty-map-heading">
          <span>MEETING POINT</span>
          <span aria-hidden="true">↗</span>
        </div>
        <div className="map-orbit" aria-hidden="true">
          <i className="orbit-ring ring-one" />
          <i className="orbit-ring ring-two" />
          <i className="orbit-ring ring-three" />
          <b>HERE.</b>
        </div>
        <div className="empty-map-caption">
          <h2>Meeting map</h2>
          <p>Add starting places to find a meeting point.</p>
        </div>
      </div>
    );
  return props.result.mode === "demo" ? (
    <ExampleMap {...props} />
  ) : (
    <Suspense fallback={<div className="live-map" role="status" aria-label="Loading map" />}><LiveMap key={props.result.searchId} {...props} /></Suspense>
  );
}
