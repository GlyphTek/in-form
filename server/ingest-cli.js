// Manual check for the ingestion layer against the real internet:
//
//   npm run ingest -- "quantum computing" https://example.com/feed.xml bbc.com
//
// Uses an in-memory database, so nothing is persisted. Run this on your own
// machine or server to verify live fetching (the dev sandbox blocks it).

import { openDatabase, runMigrations } from "./db.js";
import { loadConfig } from "./config.js";
import { createSafeFetcher } from "./ingest/fetcher.js";
import { createIngestor } from "./ingest/service.js";
import { detectSource } from "./ingest/detect.js";

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('Usage: npm run ingest -- "<topic | site | feed URL>" [...]');
  process.exit(2);
}

const config = loadConfig();
const db = openDatabase(":memory:");
runMigrations(db, config.migrationsDir, {});
const fetcher = createSafeFetcher();
const ingestor = createIngestor({ db, fetcher, log: { ...console, info() {}, debug() {} } });

for (const input of inputs) {
  let detected;
  try {
    detected = detectSource(input);
  } catch (err) {
    console.log(`\n✗ ${input}\n  ${err.kind}: ${err.message}`);
    continue;
  }
  const t0 = Date.now();
  const result = await ingestor.getItems(input);
  console.log(`\n${result.status === "ok" ? "✓" : "✗"} ${input}  [${detected.kind} → ${result.feedUrl ?? "unresolved"}]  ${Date.now() - t0}ms`);
  console.log(`  ${result.items.length} item(s)`);
  if (result.error) console.log(`  error: ${result.error.kind}: ${result.error.message}`);
  for (const item of result.items.slice(0, 3)) {
    console.log(`  - ${item.published?.slice(0, 10) ?? "undated   "}  ${item.title}\n    ${item.link}`);
  }
  if (result.items.length > 3) console.log(`  … ${result.items.length - 3} more`);
}

fetcher.close();
db.close();
