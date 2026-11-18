import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export function fixture(name) {
  return fs.readFileSync(path.join(dir, name), "utf8");
}

import { loadConfig } from "../server/config.js";

/** App config for tests: silent logs, in-memory DB, auth off unless overridden. */
export function testConfig(overrides = {}) {
  const base = loadConfig({});
  return {
    ...base,
    logLevel: "silent",
    databasePath: ":memory:",
    ...overrides,
    auth: { ...base.auth, mode: "off", ...(overrides.auth ?? {}) },
  };
}
