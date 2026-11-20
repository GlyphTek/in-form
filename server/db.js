// SQLite connection and a deliberately small, explicit migration runner.
//
// Migrations are plain .sql files in server/migrations, named NNN_description.sql.
// They run in filename order, each inside a transaction, and are recorded in
// schema_migrations so they only ever run once. Never edit a migration that has
// been applied anywhere; add a new one instead.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Node's built-in SQLite (no native build step, so installs work on Windows
// without a C++ toolchain). This thin subclass keeps the small API the rest of
// the code uses: pragma(), transaction(), and an `open` flag.
class Db extends DatabaseSync {
  #depth = 0;

  get open() {
    return this.isOpen;
  }

  pragma(statement) {
    this.exec(`PRAGMA ${statement}`);
  }

  // Returns a function that runs `fn` atomically; nested calls use savepoints.
  transaction(fn) {
    return (...args) => {
      const nested = this.#depth > 0;
      const name = `sp_${this.#depth}`;
      this.exec(nested ? `SAVEPOINT ${name}` : "BEGIN IMMEDIATE");
      this.#depth++;
      try {
        const result = fn(...args);
        this.#depth--;
        this.exec(nested ? `RELEASE ${name}` : "COMMIT");
        return result;
      } catch (err) {
        this.#depth--;
        this.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : "ROLLBACK");
        throw err;
      }
    };
  }
}

export function openDatabase(databasePath) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Db(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function runMigrations(db, migrationsDir, log = console) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((row) => row.name),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  const record = db.prepare("INSERT INTO schema_migrations (name) VALUES (?)");
  const ran = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file);
    })();
    ran.push(file);
    log.info?.({ migration: file }, "applied migration");
  }

  return ran;
}
