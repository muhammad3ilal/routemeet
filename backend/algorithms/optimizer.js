import { topK } from "./heap.js";

// Two-objective skyline, O(C log C). Equal points remain alternatives;
// an option dominates another only if one objective is strictly better.
export function paretoFrontier(candidates) {
  const sorted = [...candidates].sort(
    (a, b) => a.maxSeconds - b.maxSeconds || a.totalSeconds - b.totalSeconds,
  );
  let priorMin = Infinity;
  const result = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j < sorted.length && sorted[j].maxSeconds === sorted[i].maxSeconds)
      j++;
    const groupMin = sorted[i].totalSeconds;
    for (let k = i; k < j; k++) {
      if (sorted[k].totalSeconds === groupMin && groupMin < priorMin)
        result.push(sorted[k]);
    }
    priorMin = Math.min(priorMin, groupMin);
    i = j;
  }
  return result;
}

export function candidateComparator() {
  return (a, b) =>
    a.spreadSeconds - b.spreadSeconds ||
    a.maxSeconds - b.maxSeconds ||
    a.totalSeconds - b.totalSeconds ||
    a.id.localeCompare(b.id);
}

// First bound the longest drive, then equalize actual driving times within
// that bound. Equal but very long detours must not beat a practical meeting.
// The fourth argument remains accepted for saved clients; fairness is now the
// single objective and neither old preferences nor personal limits affect it.
export function optimizeVenues(origins, venues, matrix, _objective = "balanced", k = 5) {
  if (
    !origins.length ||
    !Array.isArray(matrix) ||
    matrix.length !== origins.length ||
    matrix.some((row) => !Array.isArray(row) || row.length !== venues.length)
  )
    throw new Error("Invalid travel matrix dimensions");
  const scored = [];
  for (let c = 0; c < venues.length; c++) {
    const times = origins.map((_, i) => matrix[i][c]);
    if (times.some((t) => !Number.isFinite(t) || t < 0)) continue;
    // Sort for deterministic floating-point summation regardless of person order.
    const totalSeconds = [...times].sort((a, b) => a - b).reduce((a, b) => a + b, 0);
    const maxSeconds = Math.max(...times), minSeconds = Math.min(...times);
    scored.push({
      ...venues[c],
      perPerson: origins.map((p, i) => ({ id: p.id, name: p.name, seconds: times[i] })),
      totalSeconds,
      maxSeconds,
      minSeconds,
      avgSeconds: totalSeconds / origins.length,
      spreadSeconds: maxSeconds - minSeconds,
    });
  }
  const bestMaxSeconds = scored.length ? Math.min(...scored.map((c) => c.maxSeconds)) : null;
  const detourAllowanceSeconds = scored.length ? Math.max(300, bestMaxSeconds * 0.2) : null;
  const maxAllowedSeconds = scored.length ? bestMaxSeconds + detourAllowanceSeconds : null;
  const practical = scored.filter((c) => c.maxSeconds <= maxAllowedSeconds);
  const bestSpreadSeconds = practical.length ? Math.min(...practical.map((c) => c.spreadSeconds)) : null;
  const balanceWindowSeconds = scored.length ? Math.max(180, bestMaxSeconds * 0.15) : null;
  const maxAllowedSpreadSeconds = scored.length ? bestSpreadSeconds + balanceWindowSeconds : null;
  // Do not pad the shortlist with a place close to just one person when much
  // fairer places exist. A sparse region can honestly yield fewer than five.
  const balanced = practical.filter((c) => c.spreadSeconds <= maxAllowedSpreadSeconds);
  const frontierIds = new Set(paretoFrontier(balanced.map((c) => ({
    id: c.id, maxSeconds: c.spreadSeconds, totalSeconds: c.maxSeconds,
  }))).map((c) => c.id));
  const ranked = topK(balanced, k, candidateComparator()).map((c) => ({
    ...c,
    paretoOptimal: frontierIds.has(c.id),
  }));
  return {
    candidates: ranked,
    diagnostics: {
      evaluatedVenues: venues.length,
      reachableVenues: scored.length,
      balancedVenues: balanced.length,
      unreachableVenues: venues.length - scored.length,
      paretoVenues: frontierIds.size,
      matrixElements: origins.length * venues.length,
      bestMaxSeconds,
      detourAllowanceSeconds,
      maxAllowedSeconds,
      bestSpreadSeconds,
      balanceWindowSeconds,
      maxAllowedSpreadSeconds,
      balanceAvailable: scored.length > 0 && bestSpreadSeconds <= Math.max(300, bestMaxSeconds * 0.2),
      objective: "balanced",
      rankingRule: "Minimize the gap between shortest and longest drives, allowing the longest drive at most 5 extra minutes or 20% above the best found, whichever is greater. Omit alternatives more than 3 minutes or 15% of that best longest drive less balanced than the best gap, whichever is greater.",
      guarantee: "Best balance among the discovered reachable venues within the detour allowance, not every place in the region. A geographic midpoint does not guarantee equal road travel times.",
    },
  };
}
