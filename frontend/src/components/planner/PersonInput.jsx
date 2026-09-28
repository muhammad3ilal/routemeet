import { useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { getPersonColor } from "../../lib/colors.js";

export default function PersonInput({
  person,
  index,
  mode,
  onChange,
  onRemove,
  removable,
}) {
  const [matches, setMatches] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  function update(patch) {
    request.current?.abort();
    setBusy(false);
    setMatches([]);
    setError("");
    onChange({ ...person, ...patch });
  }
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setMatches([]);
    try {
      const { places } = await api("/places/search", {
        body: { query: person.address, mode },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setMatches(places);
      if (!places.length)
        setError("No selectable place found. Try a named landmark and city.");
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <fieldset className="person-input">
      <legend>
        <span
          className="person-number"
          style={{ background: getPersonColor(index) }}
        >
          {index + 1}
        </span>{" "}
        Person {index + 1}
      </legend>
      <div className="person-top">
        <label>
          Name
          <input
            value={person.name}
            maxLength={60}
            onChange={(e) => update({ name: e.target.value })}
            required
          />
        </label>
        {removable && (
          <button
            type="button"
            className="remove"
            aria-label={`Remove person ${index + 1}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      <label>
        Starting place
        <div className="place-entry">
          <input
            aria-label={`Starting place for person ${index + 1}`}
            placeholder="Address or landmark, city"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (person.address.trim() && !busy) search();
              }
            }}
            value={person.address}
            maxLength={200}
            onChange={(e) =>
              update({ address: e.target.value, placeId: "", confirmed: "" })
            }
            required
          />
          <button
            type="button"
            onClick={search}
            disabled={busy || !person.address.trim()}
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
      </label>
      {person.placeId && (
        <p className="confirmed">
          ✓ {person.confirmed || "Saved place selected"}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {!!matches.length && (
        <ul
          className="place-matches"
          aria-label={`Choose a place for person ${index + 1}`}
        >
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({
                    ...person,
                    placeId: p.id,
                    confirmed: `${p.name} · ${p.address}`,
                  });
                  setMatches([]);
                }}
              >
                <strong>{p.name}</strong>
                <span>{p.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!!matches.length && mode === "maptiler" && (
        <small className="provider-credit">Place results: MapTiler / OpenStreetMap</small>
      )}
    </fieldset>
  );
}
