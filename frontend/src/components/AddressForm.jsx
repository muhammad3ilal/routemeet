import { getPersonColor } from "../lib/colors.js";
import { MIN_PEOPLE, MAX_PEOPLE } from "../lib/constants.js";

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default function AddressForm({ rows, onRowsChange, nextId }) {
  function updateAddress(id, value) {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, value } : r)));
  }

  function addRow() {
    if (rows.length >= MAX_PEOPLE) return;
    onRowsChange([...rows, { id: nextId(), value: "" }]);
  }

  function removeRow(id) {
    if (rows.length <= MIN_PEOPLE) return;
    onRowsChange(rows.filter((r) => r.id !== id));
  }

  return (
    <div className="address-form card">
      <div className="form-heading">
        <h2>Who's meeting up?</h2>
        <span className={`people-count ${rows.length >= MAX_PEOPLE ? "maxed" : ""}`}>
          {rows.length} / {MAX_PEOPLE} people
        </span>
      </div>
      <p className="hint">
        Enter where each person is starting from ({MIN_PEOPLE}&ndash;{MAX_PEOPLE} people).
      </p>

      <div className="address-rows">
        {rows.map((row, i) => (
          <div className="address-row" key={row.id}>
            <span className="address-index" style={{ "--marker-color": getPersonColor(i) }}>
              {i + 1}
            </span>
            <label className="address-field">
              <PinIcon />
              <input
                type="text"
                placeholder="e.g. Arlington, VA"
                value={row.value}
                onChange={(e) => updateAddress(row.id, e.target.value)}
                aria-label={`Address for person ${i + 1}`}
              />
            </label>
            {rows.length > MIN_PEOPLE && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove person ${i + 1}`}
                onClick={() => removeRow(row.id)}
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={addRow}
          disabled={rows.length >= MAX_PEOPLE}
        >
          + Add person
        </button>
      </div>
    </div>
  );
}
