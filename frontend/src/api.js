import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const client = axios.create({ baseURL: API_BASE_URL });

/**
 * @param {string[]} addresses
 * @param {string} [activity] - free text describing what the group wants to do; empty/omitted skips venue search
 * @returns {Promise<{origins: object[], fairest: object[], fastest: object[], activityLabel: string|null}>}
 */
export async function optimizeMeetingPoint(addresses, activity) {
  const payload = { addresses };
  if (activity) {
    payload.activity = activity;
  }
  const { data } = await client.post("/api/optimize", payload);
  return data;
}
