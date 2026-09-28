# RouteMeet UI direction

User preference: no floating dialogs/toasts, no promotional slogan banners, and no technical stack chatter in the product UI. Keep errors inline with the related control. Footer contains only RouteMeet and Privacy Policy. Preserve these preferences in future UI work.

Overhaul of the earlier pale-green card-based planner. Existing functions, form order, planner workflow stay intact. The map provider now uses MapTiler with OSRM routing. The new visual language uses compact Archivo display typography, a vermilion accent, off-white/charcoal surfaces, flatter controls and purposeful spacing. Design variance 8, motion intensity 7, density 4.

The two hero words travel in opposite directions on scroll, representing different starting points. GSAP ScrollTrigger uses scrub, so movement reverses with scroll direction. It does not intercept wheel events, pin the planner, or animate form fields. GSAP matchMedia and context cleanup support reduced motion and React Strict Mode. One kinetic heading; no looping marquee or artificial loading interstitial.

The GSAP 3.15.0 modules are from Downloads/gsap-public/esm. The distribution's original license headers remain. Only the modules required for ScrollTrigger are vendored. The planner remains usable without animation. Dark mode follows the system setting.

Verification: production build and lint passed. The example search and inline UI were exercised in the browser. Mobile 320/390px, tablet 768px and desktop were checked. Light palette and static reduced-motion branch were rendered using temporary development overrides, then restored to actual system media queries. No OS preferences were changed. No Lighthouse audit was run.
