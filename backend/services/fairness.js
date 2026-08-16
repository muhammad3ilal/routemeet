// services/fairness.js
//
// Turns a raw travel-time matrix into ranked, explainable
// recommendations. This is the algorithmic heart of RouteMeet.
//
// Given durations[i][j] = seconds for person i to reach candidate j,
// we score every candidate two different ways:
//
//   - "fairest"  minimizes the WORST individual travel time
//     (a Rawlsian / egalitarian objective: nobody should be stuck
//     with a dramatically worse commute than everyone else), using
//     the spread between people's times as a tiebreaker.
//
//   - "fastest"  minimizes the TOTAL travel time across the group
//     (a utilitarian objective: get everyone there with the least
//     combined driving).
//
// Surfacing both lets the group see the tradeoff explicitly -- the
// fastest-total option is sometimes unfair to one person, and the
// fairest option sometimes costs the group more combined driving.

/**
 * @param {Array<{lat:number, lon:number, label?: string}>} candidates
 * @param {number[][]} durations  durations[originIndex][candidateIndex] in seconds
 * @param {string[]} originLabels  names/addresses for each origin, for display
 */
export function scoreCandidates(candidates, durations, originLabels) {
  const numOrigins = durations.length;

  const scored = candidates
    .map((candidate, cIdx) => {
      const times = [];
      for (let oIdx = 0; oIdx < numOrigins; oIdx++) {
        times.push(durations[oIdx][cIdx]);
      }

      if (times.some((t) => t === null || t === undefined)) {
        return null; // unreachable from at least one origin -- discard
      }

      const total = times.reduce((a, b) => a + b, 0);
      const avg = total / times.length;
      const max = Math.max(...times);
      const min = Math.min(...times);
      const variance =
        times.reduce((sum, t) => sum + (t - avg) ** 2, 0) / times.length;
      const stdDev = Math.sqrt(variance);

      return {
        lat: candidate.lat,
        lon: candidate.lon,
        label: candidate.label,
        perPerson: times.map((seconds, i) => ({
          origin: originLabels[i],
          seconds,
          minutes: Math.round(seconds / 60),
        })),
        totalSeconds: total,
        avgSeconds: avg,
        maxSeconds: max,
        minSeconds: min,
        spreadSeconds: max - min,
        stdDevSeconds: stdDev,
      };
    })
    .filter(Boolean);

  const fairest = [...scored].sort((a, b) => {
    if (a.maxSeconds !== b.maxSeconds) return a.maxSeconds - b.maxSeconds;
    return a.stdDevSeconds - b.stdDevSeconds;
  });

  const fastest = [...scored].sort((a, b) => a.totalSeconds - b.totalSeconds);

  return { fairest, fastest, allScored: scored };
}

/**
 * Convenience: dedupe two ranked lists that likely share their #1
 * pick, and attach a `strategy` tag so the frontend can label results.
 */
export function buildTopResults(fairest, fastest, topN = 3) {
  const topFairest = fairest.slice(0, topN).map((c) => ({ ...c, strategy: "fairest" }));
  const topFastest = fastest.slice(0, topN).map((c) => ({ ...c, strategy: "fastest" }));
  return { topFairest, topFastest };
}
