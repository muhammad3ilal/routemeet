// Shared per-person color palette so a given person's color stays
// consistent across the address form, the map markers, and the
// per-person breakdown bars in results.
export const PERSON_COLORS = [
  "#4f8cff", // blue
  "#34c98f", // green
  "#f5a623", // amber
  "#ff6b9d", // pink
  "#a78bfa", // violet
  "#22d3ee", // cyan
  "#f97362", // coral
  "#facc15", // yellow
];

export function getPersonColor(index) {
  return PERSON_COLORS[index % PERSON_COLORS.length];
}
