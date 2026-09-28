import { useLayoutEffect, useRef } from "react";
import { gsap } from "../../vendor/gsap/index.js";
import { ScrollTrigger } from "../../vendor/gsap/ScrollTrigger.js";

gsap.registerPlugin(ScrollTrigger);

export default function KineticIntro() {
  const root = useRef(null);
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    // Scrubbing links the two starting points to the same scroll position.
    // Native scrolling stays intact; reversing the scroll reverses the type.
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom top",
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        });
        timeline
          .to(".meet-word", { xPercent: 15, ease: "none" }, 0)
          .to(".halfway-word", { xPercent: -12, ease: "none" }, 0)
          .to(".meeting-symbol", { rotation: 75, y: -50, ease: "none" }, 0);
        gsap.from(".hero-action", {
          y: 18,
          opacity: 0,
          duration: 0.65,
          ease: "power2.out",
          clearProps: "all",
        });
      }, root);
      return () => context.revert();
    });
    return () => media.revert();
  }, []);

  return (
    <section className="kinetic-intro" ref={root} aria-label="Plan a meetup">
      <div className="hero-heading">
        <h1>
          <span className="meet-word">MEET</span>
          <span className="halfway-word">HALFWAY.</span>
        </h1>
        <div className="meeting-symbol" aria-hidden="true">
          <span>↗</span>
        </div>
      </div>
      <div className="hero-action">
        <p>Compare driving times<br />for up to 8 people.</p>
        <a className="hero-link" href="#planner">
          Plan a meetup <span aria-hidden="true">↘</span>
        </a>
      </div>
    </section>
  );
}
