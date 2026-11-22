// Builds the Fastify app. Kept separate from index.js so tests can create an
// app with an in-memory database and call it via app.inject() without a port.

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { openDatabase, runMigrations } from "./db.js";
import { createSafeFetcher } from "./ingest/fetcher.js";
import { createIngestor } from "./ingest/service.js";
import { createAuth, SESSION_COOKIE } from "./auth/service.js";
import { createSignalStore } from "./store/signals.js";
import { createConfigStore } from "./store/config.js";
import authRoutes from "./routes/auth.js";
import configRoutes from "./routes/config.js";
import signalRoutes from "./routes/signals.js";
import hostedRoutes from "./routes/hosted.js";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(config, { db: providedDb, ingestor: providedIngestor, generateOptions, logStream } = {}) {
  // Hosted mode is the public phone website: no accounts, nothing stored about anyone.
  const hosted = config.mode === "hosted";
  const app = Fastify({
    logger: config.logLevel === "silent" ? false : { level: config.logLevel, ...(logStream ? { stream: logStream } : {}) },
    // Behind Fly.io / nginx set TRUST_PROXY=true so client IPs (and therefore
    // rate limits) are the real ones. Off by default so it cannot be spoofed.
    trustProxy: config.trustProxy ?? false,
    bodyLimit: 64 * 1024,
    // Strict validation: reject wrong types and unknown fields instead of
    // silently coercing or stripping them.
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: true, allErrors: false } },
  });

  const db = providedDb ?? openDatabase(config.databasePath);
  const applied = runMigrations(db, config.migrationsDir, app.log);
  if (applied.length) app.log.info({ count: applied.length }, "migrations applied");

  // Throws (and the process exits) when no auth mode is configured, so a
  // forgotten INFORM_PASSWORD can never leave a deployed instance open.
  // (Hosted mode has no sign-in at all, so it creates none of these.)
  const auth = hosted ? null : createAuth({ db, config });
  const store = hosted ? null : createConfigStore(db);
  const signals = hosted ? null : createSignalStore(db);

  app.decorate("config", config);
  app.decorate("db", db);
  app.addHook("onClose", async () => {
    if (db.open) db.close();
  });

  // --- Identity ----------------------------------------------------------------
  // Registered before the hooks below so request.cookies is already populated.
  if (!hosted) {
    await app.register(cookie);
    app.decorateRequest("user", null);
  }

  // Browsers always send Origin on cross-origin writes. Refusing a mismatch,
  // together with SameSite=Lax cookies and JSON-only bodies, closes off CSRF.
  app.addHook("onRequest", async (request, reply) => {
    if (!STATE_CHANGING.has(request.method) || !request.url.startsWith("/api/")) return;
    const origin = request.headers.origin;
    if (!origin) return;
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {
      /* treated as a mismatch below */
    }
    const allowed = (config.allowedOrigins ?? []).includes(origin.replace(/\/$/, ""));
    if (host !== request.host && !allowed) {
      return reply.code(403).send({ error: "forbidden_origin", message: "Cross-origin request refused." });
    }
  });

  if (!hosted) {
    app.addHook("onRequest", async (request) => {
      if (!request.url.startsWith("/api/")) return;
      if (auth.mode === "off") {
        request.user = auth.owner();
        return;
      }
      const token = request.cookies?.[SESSION_COOKIE];
      request.user = token ? auth.userForToken(token) : null;
    });
  }

  if (!hosted) {
    app.decorate("requireAuth", async (request, reply) => {
      if (request.user) return;
      return reply.code(401).header("cache-control", "no-store").send({ error: "unauthorized", message: "Sign in required." });
    });
  }

  // Minimal hardening headers. A Content-Security-Policy is deliberately left
  // out for now: the prototype uses inline styles and Google Fonts.
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
  });

  // --- Ingestion + rate limiting ---------------------------------------------

  let fetcher = null;
  let ingestor = providedIngestor;
  if (!ingestor) {
    fetcher = createSafeFetcher();
    ingestor = createIngestor({ db, fetcher, log: app.log, news: { hl: "en-US", gl: "US", ceid: "US:en", when: config.newsWindow } });
  }
  app.addHook("onClose", async () => {
    await fetcher?.close();
  });

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitPerMinute ?? 120,
    timeWindow: "1 minute",
    allowList: (request) => !request.url.startsWith("/api/"), // static assets are not limited
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: "rate_limited",
      message: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
    }),
  });

  // --- API -----------------------------------------------------------------

  const runOptions = { relevantMaxAgeHours: config.relevantMaxAgeHours, ...generateOptions };
  if (hosted) {
    // Only the account-free routes exist here: nothing to sign in to, nothing stored per person.
    await app.register(hostedRoutes, { ingestor, generateOptions: runOptions });
  } else {
    await app.register(authRoutes, { auth });
    await app.register(configRoutes, { store, signals });
    await app.register(signalRoutes, { ingestor, store, signals, generateOptions: runOptions });
  }

  app.get("/api/health", async (request, reply) => {
    let database = "ok";
    let migrations = null;
    try {
      migrations = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n;
    } catch (err) {
      request.log.error({ err }, "health check: database unavailable");
      database = "error";
    }
    reply.code(database === "ok" ? 200 : 503);
    return {
      status: database === "ok" ? "ok" : "degraded",
      database,
      migrations,
      uptimeSeconds: Math.round(process.uptime()),
      env: config.env,
      mode: config.mode,
    };
  });

  // --- Static frontend -------------------------------------------------------

  await app.register(fastifyStatic, { root: config.publicDir });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.code(404).type("text/plain").send("Not found");
  });

  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, "unhandled error");
    reply.code(status).send({
      error: status >= 500 ? "internal_error" : error.code || error.error || "bad_request",
      message: status >= 500 ? "Something went wrong." : error.message,
    });
  });

  return app;
}
