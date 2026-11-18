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
  return {
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
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE) || 120,
    generateRateLimitPerMinute: Number(env.GENERATE_RATE_LIMIT_PER_MINUTE) || 12,
    databasePath: path.resolve(rootDir, env.DATABASE_PATH || "data/inform.db"),
    publicDir: path.join(rootDir, "public"),
    migrationsDir: path.join(rootDir, "server", "migrations"),
  };
}
