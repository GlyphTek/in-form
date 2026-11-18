// Builds the Fastify app. Kept separate from index.js so tests can create an
// app with an in-memory database and call it via app.inject() without a port.

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { openDatabase, runMigrations } from "./db.js";

export async function buildApp(config, { db: providedDb } = {}) {
  const app = Fastify({
    logger: config.logLevel === "silent" ? false : { level: config.logLevel },
    // Fly.io and most VPS setups sit behind a proxy; trust it for client IPs
    // only if explicitly enabled later. Off by default.
    trustProxy: false,
    bodyLimit: 64 * 1024,
  });

  const db = providedDb ?? openDatabase(config.databasePath);
  const applied = runMigrations(db, config.migrationsDir, app.log);
  if (applied.length) app.log.info({ count: applied.length }, "migrations applied");

  app.decorate("config", config);
  app.decorate("db", db);
  app.addHook("onClose", async () => {
    if (db.open) db.close();
  });

  // Minimal hardening headers. A Content-Security-Policy is deliberately left
  // out for now: the prototype uses inline styles and Google Fonts.
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
  });

  // --- API -----------------------------------------------------------------

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
      error: status >= 500 ? "internal_error" : error.code || "bad_request",
      message: status >= 500 ? "Something went wrong." : error.message,
    });
  });

  return app;
}
