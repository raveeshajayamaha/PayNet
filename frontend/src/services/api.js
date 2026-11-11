export const demoMode = import.meta.env.VITE_DEMO_MODE !== "false";
export const unavailable = () =>
  Promise.reject(
    new Error("This feature will be available when the backend is connected."),
  );
export async function apiRequest(path, options = {}) {
  const response = await fetch(
    `${(import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "")}${path}`,
    {
      ...options,
      signal: options.signal || AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", ...options.headers },
    },
  );
  if (!response.ok)
    throw new Error(
      `Backend request failed (${response.status}). Please try again.`,
    );
  return response.json();
}
export const checkHealth = () => apiRequest("/api/health");
