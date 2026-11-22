// Central place for runtime configuration. Everything comes from environment
// variables with safe local-development defaults.

import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readPort(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

// An integer from the environment, clamped to [min, max]; the fallback when unset or invalid.
function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (value === undefined || value === "" || !Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Authentication mode, decided once from the environment:
//   password      INFORM_PASSWORD is set (12+ characters). The normal mode.
//   off           INFORM_AUTH=off. Local development only: every request acts as
//                 the owner, so never expose this to a network.
//   unconfigured  neither is set. buildApp refuses to start, so a forgotten
//                 variable can never leave a deployed instance open.
function readAuth(env) {
  const password = env.INFORM_PASSWORD || "";
  const mode = password ? "password" : env.INFORM_AUTH === "off" ? "off" : "unconfigured";
  return {
    mode,
    password,
    ownerEmail: env.INFORM_USER_EMAIL || "owner@in-form.local",
    sessionDays: Number(env.SESSION_DAYS) || 30,
    loginRateLimitPerMinute: Number(env.LOGIN_RATE_LIMIT_PER_MINUTE) || 8,
  };
}

export function loadConfig(env = process.env) {
  const mode = env.INFORM_MODE === "hosted" ? "hosted" : "local";
  return {
    // local   one person on their own computer (or a password-protected copy): setup and
    //         history live in this server's database.
    // hosted  a public website for phones. It has NO accounts and stores nothing about
    //         anyone: the phone sends what the server needs with each request (see
    //         routes/hosted.js), and only the built-in topics can be fetched.
    mode,
    auth: readAuth(env),
    // Extra origins allowed to make API writes, e.g. https://inform.example.com.
    // Only needed if a proxy rewrites the Host header; same-host requests always pass.
    allowedOrigins: (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
    rootDir,
    env: env.NODE_ENV || "development",
    port: readPort(env.PORT, 3000),
    // Bind to loopback by default; set HOST=0.0.0.0 deliberately when deploying.
    host: env.HOST || "127.0.0.1",
    logLevel: env.LOG_LEVEL || "info",
    // Set TRUST_PROXY=true behind Fly.io / nginx so rate limits see real client IPs.
    trustProxy: env.TRUST_PROXY === "true",
    // Requests per minute per client: general, and for the expensive generate call.
    // Google News search window for keyword sources, e.g. 7d, 30d, 12h.
    newsWindow: /^\d{1,3}[hd]$/.test(env.NEWS_WINDOW ?? "") ? env.NEWS_WINDOW : "30d",
    // Relevant only takes items newer than this many hours (1 to 720).
    relevantMaxAgeHours: boundedInt(env.RELEVANT_MAX_AGE_HOURS, 48, 1, 720),
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE) || 120,
    // Tight (12) when it may be a shared website with a password; generous (120) when
    // auth is off, which only ever means one person on their own computer.
    // Hosted: per visitor (needs TRUST_PROXY=true behind Fly.io so it is the real address).
    generateRateLimitPerMinute: Number(env.GENERATE_RATE_LIMIT_PER_MINUTE) || (mode === "hosted" ? 30 : readAuth(env).mode === "off" ? 120 : 12),
    databasePath: path.resolve(rootDir, env.DATABASE_PATH || "data/inform.db"),
    publicDir: path.join(rootDir, "public"),
    migrationsDir: path.join(rootDir, "server", "migrations"),
  };
}
