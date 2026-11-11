// Cancellation is advisory; generation/identity checks also reject servers that finish after abort.
export function createAccountScope() {
  let generation = 0, userId = null;
  const requests = new Set();
  return {
    get userId() { return userId; },
    get generation() { return generation; },
    change(nextUserId) {
      generation++; userId = nextUserId;
      for (const controller of requests) controller.abort();
      requests.clear();
    },
    capture() {
      const version = generation, owner = userId, controller = new AbortController();
      requests.add(controller);
      return {
        userId: owner, signal: controller.signal,
        isCurrent: () => owner !== null && owner === userId && version === generation && !controller.signal.aborted,
        cancel: () => controller.abort(), release: () => requests.delete(controller),
      };
    },
  };
}
