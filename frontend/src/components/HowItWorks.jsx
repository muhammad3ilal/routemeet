import Reveal from "./Reveal.jsx";

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </svg>
  );
}

function MatrixIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v16M4 4h16M4 20h16M20 4v16" />
      <path d="M4 10h16M4 15h16M9 4v16M14 4v16" opacity="0.5" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M7 21h10" />
      <path d="M5 7 3 12a2.5 2.5 0 0 0 5 0L6 7ZM19 7l-2 5a2.5 2.5 0 0 0 5 0l-2-5Z" />
      <path d="M3 7h18" opacity="0.6" />
    </svg>
  );
}

const STEPS = [
  {
    icon: MapPinIcon,
    title: "Geocode everyone",
    text: "Every starting address is turned into coordinates via OpenStreetMap's Nominatim.",
  },
  {
    icon: GridIcon,
    title: "Generate candidates",
    text: "A grid of possible meeting points is built around — and slightly beyond — the bounding box of everyone's location.",
  },
  {
    icon: MatrixIcon,
    title: "One batched query",
    text: "A single OSRM request returns real driving-time durations for every person against every candidate at once.",
  },
  {
    icon: ScaleIcon,
    title: "Score two ways",
    text: "Candidates are ranked by fairness (minimize the worst commute) and by total time (minimize the group's combined drive).",
  },
];

function handleCardMove(e) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  el.style.setProperty("--my", `${e.clientY - rect.top}px`);
}

export default function HowItWorks() {
  return (
    <section className="how-section" id="how-it-works">
      <Reveal as="div" className="section-heading">
        <h2>How it works</h2>
        <p>
          Not just a midpoint on a map — an actual optimization problem, solved with real
          road-network data.
        </p>
      </Reveal>

      <div className="step-grid">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <Reveal as="div" className="step-card" delay={i * 90} key={step.title} onMouseMove={handleCardMove}>
              <span className="step-number">
                <Icon />
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
