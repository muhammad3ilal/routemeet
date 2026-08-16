const SUGGESTIONS = ["Coffee", "Food", "Drinks", "Park", "Bowling", "Movies", "Ice cream"];

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v6l12 2-12 2v6l18-8Z" />
    </svg>
  );
}

export default function ActivityPicker({ value, onChange }) {
  return (
    <div className="activity-picker card">
      <div className="form-heading">
        <h2>What's the plan?</h2>
      </div>
      <p className="hint">
        Tell us what you're up for and RouteMeet will suggest an actual place nearby — not just a coordinate.
      </p>

      <div className="activity-input-row">
        <SendIcon />
        <input
          type="text"
          className="activity-input"
          placeholder="e.g. grab coffee, bowling, sushi…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>

      <div className="activity-suggestions">
        <span className="activity-suggestions-label">Try:</span>
        {SUGGESTIONS.map((s) => (
          <button type="button" key={s} className="activity-suggestion" onClick={() => onChange(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
