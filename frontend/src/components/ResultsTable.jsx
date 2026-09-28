import { useEffect, useRef, useState } from "react";
import { getPersonColor } from "../lib/colors.js";

function formatMinutes(totalSeconds) {
  return Math.round(totalSeconds / 60);
}

function formatDistance(meters) {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function useCountUp(value, duration = 700) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let raf;
    let start;
    function step(ts) {
      if (start === undefined) start = ts;
      const progress = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function VenuePinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function VenueList({ venues, activityLabel }) {
  if (!venues) return null;

  if (venues.length === 0) {
    return (
      <p className="venue-empty">
        No {activityLabel.toLowerCase()} spots found within about a mile of this point.
      </p>
    );
  }

  return (
    <div className="venue-list">
      <span className="venue-list-label">Suggested {activityLabel.toLowerCase()} spots</span>
      {venues.map((v, k) => (
        <a
          key={k}
          className="venue-item"
          href={`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lon}#map=18/${v.lat}/${v.lon}`}
          target="_blank"
          rel="noreferrer"
        >
          <VenuePinIcon />
          <span className="venue-name">{v.name}</span>
          <span className="venue-distance">{formatDistance(v.distanceMeters)}</span>
        </a>
      ))}
    </div>
  );
}

function ResultCard({ candidate, rank, isTop, delay, activityLabel }) {
  const [open, setOpen] = useState(isTop);
  const maxDisplay = useCountUp(formatMinutes(candidate.maxSeconds));
  const avgDisplay = useCountUp(formatMinutes(candidate.avgSeconds));
  const spreadDisplay = useCountUp(formatMinutes(candidate.spreadSeconds));

  const minutesList = candidate.perPerson.map((p) => p.minutes);
  const maxMinutes = Math.max(...minutesList, 1);
  const fastest = Math.min(...minutesList);
  const slowest = Math.max(...minutesList);
  const hasSpread = fastest !== slowest;

  return (
    <div
      className={`result-card ${isTop ? "result-card--top" : ""}`}
      style={{ "--stagger-delay": `${delay}ms` }}
    >
      <div className="result-card-header">
        <span className="result-rank">#{rank}</span>
        <span className="result-place">{candidate.placeName}</span>
        {isTop && <span className="best-pick-badge">Best pick</span>}
      </div>

      <div className="result-stats">
        <div>
          <span className="stat-label">Worst-case commute</span>
          <span className="stat-value">{maxDisplay} min</span>
        </div>
        <div>
          <span className="stat-label">Average commute</span>
          <span className="stat-value">{avgDisplay} min</span>
        </div>
        <div>
          <span className="stat-label">Spread</span>
          <span className="stat-value">{spreadDisplay} min</span>
        </div>
      </div>

      {isTop && (
        <>
          <PersonBars candidate={candidate} maxMinutes={maxMinutes} fastest={fastest} slowest={slowest} hasSpread={hasSpread} />
          <VenueList venues={candidate.venues} activityLabel={activityLabel} />
        </>
      )}

      {!isTop && (
        <>
          <button
            type="button"
            className={`breakdown-toggle ${open ? "open" : ""}`}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? "Hide" : "View"} per-person breakdown
            <ChevronIcon />
          </button>
          <div className={`collapse ${open ? "open" : ""}`}>
            <div>
              <div className="collapse-inner">
                <PersonBars candidate={candidate} maxMinutes={maxMinutes} fastest={fastest} slowest={slowest} hasSpread={hasSpread} />
                <VenueList venues={candidate.venues} activityLabel={activityLabel} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PersonBars({ candidate, maxMinutes, fastest, slowest, hasSpread }) {
  return (
    <div className="person-bars">
      {candidate.perPerson.map((p, j) => {
        const isFastest = hasSpread && p.minutes === fastest;
        const isSlowest = hasSpread && p.minutes === slowest;
        return (
          <div className="person-bar-row" key={j}>
            <span className="person-bar-name">
              <span className="person-bar-dot" style={{ "--marker-color": getPersonColor(j) }} />
              {p.origin}
            </span>
            <span className="person-bar-track">
              <span
                className={`person-bar-fill ${isSlowest ? "is-slowest" : ""}`}
                style={{
                  width: `${(p.minutes / maxMinutes) * 100}%`,
                  "--marker-color": getPersonColor(j),
                }}
              />
            </span>
            <span className={`person-bar-value ${isFastest ? "is-fastest" : ""} ${isSlowest ? "is-slowest" : ""}`}>
              {p.minutes}m
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ResultsTable({ candidates, activityLabel }) {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="results-list">
      {candidates.map((c, i) => (
        <ResultCard key={i} candidate={c} rank={i + 1} isTop={i === 0} delay={i * 80} activityLabel={activityLabel} />
      ))}
    </div>
  );
}
