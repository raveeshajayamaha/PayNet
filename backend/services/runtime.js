const { createAuthentication } = require('./authentication');
const { createQueries } = require('./queries');
const { createPayments } = require('./payments');
function createRuntime(db, config, options = {}) {
  const runtime = {
    db, config, publish: async () => {}, disconnectSession() {}, disconnectUser() {}, socketCount: () => 0,
    auth: createAuthentication(db, config), queries: createQueries(db),
  };
  runtime.payments = createPayments(db, { logger: options.logger, beforeCommit: options.beforePaymentCommit, publish: (result) => runtime.publish(result) });
  return runtime;
}
module.exports = { createRuntime };
