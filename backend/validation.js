import { ServiceError } from "./errors.js";
export const ACTIVITIES = [
  "coffee",
  "restaurants",
  "parks",
  "bowling",
  "cinemas",
  "libraries",
  "ice cream",
];
export const text = (value, label, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new ServiceError(
      `${label} must be between 1 and ${max} characters.`,
      400,
      "VALIDATION",
    );
  return value.trim();
};
export function validateTrip(body) {
  if (!body || typeof body !== "object")
    throw new ServiceError("Send a JSON object.", 400);
  if (!["maptiler", "demo"].includes(body.mode))
    throw new ServiceError("Choose live or example mode.", 400);
  if (!ACTIVITIES.includes(body.activity))
    throw new ServiceError("Choose an activity from the list.", 400);
  if (
    !Array.isArray(body.participants) ||
    body.participants.length < 2 ||
    body.participants.length > 8
  )
    throw new ServiceError("Add between 2 and 8 people.", 400);
  const ids = new Set();
  const participants = body.participants.map((p, i) => {
    if (!p || typeof p !== "object")
      throw new ServiceError(`Check person ${i + 1}.`, 400);
    const id = text(p.id, "Participant ID", 80);
    if (ids.has(id))
      throw new ServiceError("Each participant needs a unique ID.", 400);
    ids.add(id);
    return {
      id,
      name: text(p.name, `Name for person ${i + 1}`, 60),
      address: text(p.address, `Starting place for person ${i + 1}`),
      placeId: text(
        p.placeId,
        `Confirm the starting place for person ${i + 1}`,
        255,
      ),
    };
  });
  // Older saved plans may still send travel limits or a ranking preference.
  // The current planner gives everyone equal weight and does not use either.
  return {
    mode: body.mode,
    activity: body.activity,
    participants,
    objective: "balanced",
  };
}
