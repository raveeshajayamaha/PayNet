// Only an unconfirmed request is stored, scoped to this tab and account. Never JWTs.
const keyFor = (kind, userId) => 'paynet:pending:' + kind + ':' + userId;
export function readPending(kind, userId) {
  try {
    const value = JSON.parse(sessionStorage.getItem(keyFor(kind, userId)));
    return value && typeof value.key === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value.key) && value.input && Number.isSafeInteger(value.input.amountCents) ? value : null;
  } catch { return null; }
}
export function savePending(kind, userId, value) {
  // If persistence is unavailable, keep the in-memory key and warn via the caller.
  sessionStorage.setItem(keyFor(kind, userId), JSON.stringify(value));
}
export function clearPending(kind, userId) {
  try { sessionStorage.removeItem(keyFor(kind, userId)); } catch { /* In-memory outcome is already confirmed. */ }
}
