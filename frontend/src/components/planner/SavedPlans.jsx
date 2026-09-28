import { useState } from "react";
import { api } from "../../api.js";
export default function SavedPlans({
  groups,
  meetups,
  onLoad,
  onDeleteGroup,
  onDeleteMeetup,
}) {
  const [places, setPlaces] = useState({}), [errors, setErrors] = useState({}), [busy, setBusy] = useState({});
  async function locate(id) {
    setBusy((p) => ({ ...p, [id]: true }));
    setErrors((p) => ({ ...p, [id]: "" }));
    try {
      const { place } = await api(`/meetups/${encodeURIComponent(id)}/place`);
      setPlaces((p) => ({ ...p, [id]: place }));
    } catch (e) { setErrors((p) => ({ ...p, [id]: e.message })); }
    finally { setBusy((p) => ({ ...p, [id]: false })); }
  }
  return (
    <details className="saved-library">
      <summary>
        Saved groups & meetups <span>{groups.length + meetups.length}</span>
      </summary>
      {!groups.length && !meetups.length && <p>No saved plans.</p>}
      {!!groups.length && (
        <>
          <h3>Groups</h3>
          <ul>
            {groups.map((g) => (
              <li key={g.id}>
                <button onClick={() => onLoad(g)}>
                  <strong>{g.name}</strong>
                  <small>
                    {g.participants.length} people ·{" "}
                    {g.mode === "demo" ? "Example" : g.mode === "maptiler" ? "MapTiler" : "Reconfirm starting places"}
                  </small>
                </button>
                <button
                  className="quiet"
                  onClick={() => onDeleteGroup(g.id)}
                  aria-label={`Delete group ${g.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!!meetups.length && (
        <>
          <h3>Meetup choices</h3>
          <ul>
            {meetups.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.label}</strong>
                  <small>
                    {m.created_at.slice(0, 10)} ·{" "}
                    {m.mode === "demo" ? "Example" : m.activity}
                  </small>
                  {m.mode === "maptiler" && (places[m.id] ? <a href={places[m.id].mapsUrl} target="_blank" rel="noreferrer">Open {places[m.id].name} on map ↗</a> : <button onClick={() => locate(m.id)} disabled={busy[m.id]}>{busy[m.id] ? "Finding place…" : "Find saved place"}</button>)}
                  {m.mode !== "demo" && m.mode !== "maptiler" && <small>Saved with the previous map provider. Search again to update this choice.</small>}
                  {errors[m.id] && <p className="field-error" role="alert">{errors[m.id]}</p>}
                </div>
                <button
                  className="quiet"
                  onClick={() => onDeleteMeetup(m.id)}
                  aria-label={`Delete meetup ${m.label}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
