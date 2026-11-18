// CLI entry: `npm run migrate`. Applies any pending migrations and exits.

import { loadConfig } from "./config.js";
import { openDatabase, runMigrations } from "./db.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
const ran = runMigrations(db, config.migrationsDir, {
  info: (obj) => console.log(`applied ${obj.migration}`),
});
console.log(ran.length ? `Done: ${ran.length} migration(s) applied.` : "Database is up to date.");
db.close();
