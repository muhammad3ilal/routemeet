import { useRef } from "react";
import BrandMark from "./BrandMark.jsx";
import RouteGraphic from "./RouteGraphic.jsx";

export default function Hero({ onLaunch, onLearnMore }) {
  const heroRef = useRef(null);
  const bgRef = useRef(null);

  function handleMouseMove(e) {
    const hero = heroRef.current;
    if (!hero) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = hero.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    hero.style.setProperty("--mx", `${(x / rect.width) * 100}%`);
    hero.style.setProperty("--my", `${(y / rect.height) * 100}%`);

    const dx = (x / rect.width - 0.5) * 2;
    const dy = (y / rect.height - 0.5) * 2;
    if (bgRef.current) {
      bgRef.current.style.transform = `translate3d(${dx * -16}px, ${dy * -12}px, 0)`;
    }
  }

  function handleMouseLeave() {
    if (bgRef.current) {
      bgRef.current.style.transform = "translate3d(0, 0, 0)";
    }
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="#top">
            <BrandMark size={30} />
            RouteMeet
          </a>
          <div className="nav-links">
            <button type="button" className="nav-link" onClick={onLearnMore}>
              How it works
            </button>
            <button type="button" className="nav-link nav-cta" onClick={onLaunch}>
              Try it
            </button>
          </div>
        </div>
      </nav>

      <section className="hero" id="top" ref={heroRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <div className="hero-spotlight" aria-hidden="true" />

        <div className="hero-bg" ref={bgRef}>
          <RouteGraphic />
        </div>

        <div className="hero-content">
          <span className="hero-eyebrow">Fair meeting-point finder</span>
          <h1 className="hero-title">
            Meet in the middle.
            <br />
            Actually fair this time.
          </h1>
          <p className="hero-subtitle">
            RouteMeet finds the real-world place for your group to meet — scored by actual
            driving time from OpenStreetMap and OSRM, not a straight line on a map.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-button large" onClick={onLaunch}>
              Find a meeting point
            </button>
            <button type="button" className="ghost-button" onClick={onLearnMore}>
              See how it works ↓
            </button>
          </div>
        </div>

        <div className="hero-scroll-cue" aria-hidden="true">
          <span />
        </div>
      </section>
    </>
  );
}
