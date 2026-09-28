export async function api(path, { body, signal, method } = {}) {
  const response = await fetch(`/api${path}`, {
    method: method || (body ? "POST" : "GET"),
    credentials: "same-origin",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-RouteMeet-Client": "planner",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error || "RouteMeet could not connect. Please try again.",
    );
  return data;
}
