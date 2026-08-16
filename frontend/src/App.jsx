import { useEffect, useRef, useState } from "react";
import Hero from "./components/Hero.jsx";
import HowItWorks from "./components/HowItWorks.jsx";
import Reveal from "./components/Reveal.jsx";
import AddressForm from "./components/AddressForm.jsx";
import ActivityPicker from "./components/ActivityPicker.jsx";
import MapView from "./components/MapView.jsx";
import ResultsTable from "./components/ResultsTable.jsx";
import { optimizeMeetingPoint } from "./api.js";
import { MIN_PEOPLE } from "./lib/constants.js";

const STRATEGIES = {
  fairest: {
    label: "Fairest",
    blurb: "Minimizes the worst individual commute, so no one gets stuck with a much longer drive than everyone else.",
  },
  fastest: {
    label: "Fastest total",
    blurb: "Minimizes the group's combined travel time, even if that means one person drives noticeably more.",
  },
};

const STRATEGY_KEYS = Object.keys(STRATEGIES);

const BASE_PROGRESS_STEPS = [
  "Geocoding addresses…",
  "Building candidate meeting points…",
  "Computing the travel-time matrix…",
  "Ranking candidates…",
];

function useFakeProgress(active, steps) {
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState(steps[0]);
  const pctRef = useRef(0);
  const stepsRef = useRef(steps);

  useEffect(() => {
    pctRef.current = pct;
  }, [pct]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    let growTimer;
    let stepTimer;
    let resetTimer;

    if (active) {
      setPct(6);
      setLabel(stepsRef.current[0]);
      let stepIndex = 0;
      growTimer = setInterval(() => {
        setPct((p) => Math.min(92, p + (92 - p) * 0.15 + 1));
      }, 220);
      stepTimer = setInterval(() => {
        const currentSteps = stepsRef.current;
        stepIndex = Math.min(stepIndex + 1, currentSteps.length - 1);
        setLabel(currentSteps[stepIndex]);
      }, 1300);
    } else if (pctRef.current > 0) {
      setPct(100);
      resetTimer = setTimeout(() => setPct(0), 450);
    }

    return () => {
      clearInterval(growTimer);
      clearInterval(stepTimer);
      clearTimeout(resetTimer);
    };
  }, [active]);

  return { pct, label };
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

let idCounter = 2;

function App() {
  const [rows, setRows] = useState([
    { id: 0, value: "" },
    { id: 1, value: "" },
  ]);
  const [activity, setActivity] = useState("");
  const [result, setResult] = useState(null);
  const [strategy, setStrategy] = useState("fairest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const progressSteps =
    activity.trim() !== "" ? [...BASE_PROGRESS_STEPS, "Finding nearby spots…"] : BASE_PROGRESS_STEPS;
  const { pct, label } = useFakeProgress(loading, progressSteps);

  const appSectionRef = useRef(null);
  const howSectionRef = useRef(null);

  function scrollToApp() {
    appSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToHow() {
    howSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const addresses = rows.map((r) => r.value.trim()).filter(Boolean);
    if (addresses.length < MIN_PEOPLE) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await optimizeMeetingPoint(addresses, activity.trim());
      setResult(data);
      setStrategy("fairest");
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        "Something went wrong reaching RouteMeet's server. Is the backend running?";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const filledCount = rows.filter((r) => r.value.trim()).length;
  const canSubmit = filledCount >= MIN_PEOPLE && !loading;

  const candidates = result ? result[strategy] : [];
  const topCandidate = candidates?.[0];
  const strategyIndex = STRATEGY_KEYS.indexOf(strategy);
  const activityLabel = result?.activityLabel;

  return (
    <div className="page">
      <div className="bg-glow" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <Hero onLaunch={scrollToApp} onLearnMore={scrollToHow} />

      <div ref={howSectionRef}>
        <HowItWorks />
      </div>

      <section className="app-section" id="app" ref={appSectionRef}>
        <Reveal as="div" className="section-heading">
          <h2>Plan your meetup</h2>
          <p>Enter 2–8 starting addresses, pick what you're up for, and RouteMeet does the rest.</p>
        </Reveal>

        <form onSubmit={handleFormSubmit}>
          <AddressForm rows={rows} onRowsChange={setRows} nextId={() => idCounter++} />
          <ActivityPicker value={activity} onChange={setActivity} />

          <div className="search-actions">
            <button type="submit" className="primary-button large" disabled={!canSubmit}>
              {loading && <span className="spinner" />}
              {loading ? "Calculating…" : "Find the fairest meeting point"}
            </button>
          </div>
        </form>

        {loading && (
          <div className="progress-wrap-outer">
            <div className="progress-wrap">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="progress-label">{label}</p>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <ErrorIcon />
            <p>{error}</p>
            <button className="error-dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>
              &times;
            </button>
          </div>
        )}

        {result && (
          <section className="results-section card">
            <div className="summary-row">
              <h3>Recommended meeting points</h3>
              <span className="summary-chip">
                {result.origins.length} people &middot; top {candidates.length} candidates
              </span>
            </div>

            <div className="strategy-toggle">
              <span
                className="strategy-toggle-indicator"
                style={{
                  width: `calc(${100 / STRATEGY_KEYS.length}% - 4px)`,
                  transform: `translateX(${strategyIndex * 100}%)`,
                }}
              />
              {STRATEGY_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`strategy-button ${strategy === key ? "active" : ""}`}
                  onClick={() => setStrategy(key)}
                >
                  {STRATEGIES[key].label}
                </button>
              ))}
            </div>
            <p className="strategy-blurb">{STRATEGIES[strategy].blurb}</p>

            <MapView origins={result.origins} topCandidate={topCandidate} />
            <ResultsTable candidates={candidates} activityLabel={activityLabel} />
          </section>
        )}
      </section>

      <footer className="app-footer">
        <p>
          Geocoding by OpenStreetMap Nominatim &middot; Routing by OSRM &middot; Places by Overpass &middot; Built as a
          portfolio project.
        </p>
      </footer>
    </div>
  );
}

export default App;
