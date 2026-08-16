import { PERSON_COLORS } from "../lib/colors.js";

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

const CX = 300;
const CY = 300;
const RADIUS = 220;
const ANGLES = [0, 60, 120, 180, 240, 300];

export default function RouteGraphic() {
  const nodes = ANGLES.map((deg, i) => {
    const [x, y] = polar(CX, CY, RADIUS, deg - 90);
    return { x, y, color: PERSON_COLORS[i % PERSON_COLORS.length], delay: i * 0.35 };
  });

  return (
    <svg viewBox="0 0 600 600" className="route-graphic" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="heroFade" cx="50%" cy="50%" r="50%">
          <stop offset="45%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="heroMask">
          <rect width="600" height="600" fill="url(#heroFade)" />
        </mask>
      </defs>
      <g mask="url(#heroMask)">
        <circle cx={CX} cy={CY} r={280} className="route-grid-ring" />
        <circle cx={CX} cy={CY} r={200} className="route-grid-ring" />
        <circle cx={CX} cy={CY} r={120} className="route-grid-ring" />
        {nodes.map((n, i) => (
          <path
            key={`line-${i}`}
            d={`M${n.x},${n.y} Q${(n.x + CX) / 2 + (CY - n.y) * 0.15},${(n.y + CY) / 2 + (n.x - CX) * 0.15} ${CX},${CY}`}
            className="route-line"
            style={{ stroke: n.color, animationDelay: `${n.delay}s` }}
          />
        ))}
        {nodes.map((n, i) => (
          <circle
            key={`node-${i}`}
            cx={n.x}
            cy={n.y}
            r="7"
            fill={n.color}
            style={{ color: n.color, animationDelay: `${n.delay}s` }}
            className="route-node"
          />
        ))}
        <circle cx={CX} cy={CY} r="10" className="route-center-pulse" />
        <circle cx={CX} cy={CY} r="9" className="route-center-core" />
      </g>
    </svg>
  );
}
