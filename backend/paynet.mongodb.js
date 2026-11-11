// MongoDB for VS Code Playground. Select your Atlas connection before running.
// Read-only: no accounts, payments, or balances are changed.
use('paynet');

const connectionCheck = db.runCommand({ ping: 1 });
({
  connected: connectionCheck.ok === 1,
  database: db.getName(),
  collections: db.getCollectionNames(),
});
