const POLICY = require('../../shared/network-policy.json');
// This bounds networking's wait; the real provider must honor AbortSignal for I/O cancellation.
async function verifyWithDeadline(action, timeoutMs = POLICY.verificationTimeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => action(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(Object.assign(new Error('Verification unavailable.'), { code: 'VERIFICATION_TIMEOUT' }));
      }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
module.exports = { verifyWithDeadline };
