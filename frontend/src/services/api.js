export const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
export const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
let csrfToken = '';
export const setCsrfToken = (value = '') => { csrfToken = value; };
export const unavailable = () =>
  Promise.reject(
    new Error("This feature will be available when the backend is connected."),
  );
export async function apiRequest(path, options = {}) {
  let response;
  try { response = await fetch(
    `${apiOrigin}${path}`,
    {
      ...options,
      credentials: 'include',
      signal: options.signal || AbortSignal.timeout(path.includes('/transfers/') ? 30000 : 10000),
      headers: { "Content-Type": "application/json", 'X-PayNet-Request': '1', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers },
    },
  ); } catch {
    throw Object.assign(new Error('Backend unavailable. Check your connection and try again.'), { code: 'NETWORK_ERROR' });
  }
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw Object.assign(new Error(data.error?.message || `Backend request failed (${response.status}). Please try again.`), { status: response.status, code: data.error?.code, details: data.error?.details });
  return data;
}
export const checkHealth = () => apiRequest("/api/health");
export const jsonRequest = (path, method, data = {}, headers = {}) => apiRequest(path, { method, body: JSON.stringify(data), headers });
export const queryString = (values = {}) => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value != null)).toString();
