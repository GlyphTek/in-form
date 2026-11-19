import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { testConfig } from "./helpers.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import { createAuth } from "../server/auth/service.js";

const PASSWORD = "correct horse battery staple";

const ingestor = {
  async getItems(input) {
    return { input, kind: "keyword", status: "ok", items: [], fetchedAt: null, error: null };
  },
  listHealth: () => [],
};

async function makeApp({ auth = {}, ...rest } = {}, extra = {}) {
  const db = openDatabase(":memory:");
  const config = testConfig({ auth: { mode: "password", password: PASSWORD, loginRateLimitPerMinute: 100, ...auth }, ...rest, ...extra });
  const app = await buildApp(config, { db, ingestor });
  return { app, db };
}

const login = (app, password = PASSWORD, headers = {}) =>
  app.inject({ method: "POST", url: "/api/auth/login", payload: { password }, headers });

function sessionCookie(res) {
  const c = res.cookies.find((x) => x.name === "inform_session");
  return c;
}
const cookieHeader = (res) => ({ cookie: `inform_session=${sessionCookie(res).value}` });

test("refuses to start without a password or an explicit INFORM_AUTH=off", async () => {
  await assert.rejects(
    () => buildApp(testConfig({ auth: { mode: "unconfigured", password: "" } }), { db: openDatabase(":memory:"), ingestor }),
    /Authentication is not configured/,
  );
});

test("refuses a short password", async () => {
  await assert.rejects(
    () => buildApp(testConfig({ auth: { mode: "password", password: "short" } }), { db: openDatabase(":memory:"), ingestor }),
    /at least 12 characters/,
  );
});

test("signed-out state: me says authRequired and not authenticated", async () => {
  const { app } = await makeApp();
  const res = await app.inject({ url: "/api/auth/me" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { authRequired: true, authenticated: false, user: null });
  assert.equal(res.headers["cache-control"], "no-store");
  await app.close();
});

test("wrong or empty passwords are rejected with one generic message and no cookie", async () => {
  const { app } = await makeApp();
  for (const password of ["wrong password here", PASSWORD + "x", PASSWORD.slice(0, -1), "x"]) {
    const res = await login(app, password);
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, "invalid_credentials");
    assert.equal(sessionCookie(res), undefined);
  }
  assert.equal((await login(app, "")).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/login", payload: {} })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: 12345 } })).statusCode, 400);
  await app.close();
});

test("login sets a hardened cookie and unlocks protected routes", async () => {
  const { app } = await makeApp();
  assert.equal((await app.inject({ url: "/api/config" })).statusCode, 401);

  const res = await login(app);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { authRequired: true, authenticated: true, user: { email: "owner@in-form.local" } });

  const cookie = sessionCookie(res);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Lax");
  assert.equal(cookie.path, "/");
  assert.ok(cookie.maxAge >= 29 * 86400);
  assert.ok(!cookie.secure, "plain http must not set Secure");
  assert.ok(cookie.value.length >= 40);

  assert.equal((await app.inject({ url: "/api/config", headers: cookieHeader(res) })).statusCode, 200);
  const me = await app.inject({ url: "/api/auth/me", headers: cookieHeader(res) });
  assert.equal(me.json().authenticated, true);
  await app.close();
});

test("the cookie is Secure when the request arrived over https behind a trusted proxy", async () => {
  const { app } = await makeApp({ trustProxy: true });
  const res = await login(app, PASSWORD, { "x-forwarded-proto": "https" });
  assert.equal(sessionCookie(res).secure, true);
  await app.close();
});

test("only a hash of the session token is stored", async () => {
  const { app, db } = await makeApp();
  const res = await login(app);
  const token = sessionCookie(res).value;
  const rows = db.prepare("SELECT token_hash FROM sessions").all();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
  assert.equal(rows[0].token_hash, crypto.createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(db.prepare("SELECT * FROM sessions").all()).includes(token));
  await app.close();
});

test("each login gets its own session", async () => {
  const { app } = await makeApp();
  const a = sessionCookie(await login(app)).value;
  const b = sessionCookie(await login(app)).value;
  assert.notEqual(a, b);
  await app.close();
});

test("logout deletes the session server-side and clears the cookie", async () => {
  const { app, db } = await makeApp();
  const res = await login(app);
  const headers = cookieHeader(res);

  const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers });
  assert.equal(out.statusCode, 200);
  assert.equal(out.json().authenticated, false);
  assert.equal(sessionCookie(out).value, "");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);

  // The old cookie is dead even if a client keeps sending it.
  assert.equal((await app.inject({ url: "/api/config", headers })).statusCode, 401);
  await app.close();
});

test("forged, truncated and unknown tokens are rejected", async () => {
  const { app } = await makeApp();
  for (const value of ["", "abc", "x".repeat(43), "x".repeat(500), "../../etc/passwd", "' OR 1=1 --"]) {
    const res = await app.inject({ url: "/api/config", headers: { cookie: `inform_session=${encodeURIComponent(value)}` } });
    assert.equal(res.statusCode, 401, value.slice(0, 20));
  }
  await app.close();
});

test("expired sessions stop working and are pruned on the next login", async () => {
  const db = openDatabase(":memory:");
  let t = Date.parse("2026-11-18T00:00:00Z");
  const config = testConfig({ auth: { mode: "password", password: PASSWORD, sessionDays: 30, loginRateLimitPerMinute: 100 } });
  const app = await buildApp(config, { db, ingestor });
  // Drive the service directly with a controllable clock on the same database.
  const auth = createAuth({ db, config, now: () => t });
  const user = auth.owner();
  const { token } = auth.createSession(user.id);

  assert.equal(auth.userForToken(token).id, user.id);
  t += 29 * 86_400_000;
  assert.ok(auth.userForToken(token));
  t += 2 * 86_400_000;
  assert.equal(auth.userForToken(token), null);

  auth.createSession(user.id); // prunes the expired one
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 1);
  await app.close();
});

test("login is strictly rate limited", async () => {
  const { app } = await makeApp({ auth: { loginRateLimitPerMinute: 3 } });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await login(app, "nope nope nope")).statusCode);
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  // Even the right password is blocked while limited.
  assert.equal((await login(app)).statusCode, 429);
  await app.close();
});

test("cross-origin writes are refused; same-origin and origin-less requests pass", async () => {
  const { app } = await makeApp();
  const evil = await login(app, PASSWORD, { origin: "https://evil.example" });
  assert.equal(evil.statusCode, 403);
  assert.equal(evil.json().error, "forbidden_origin");

  const garbage = await login(app, PASSWORD, { origin: "not a url" });
  assert.equal(garbage.statusCode, 403);

  const same = await login(app, PASSWORD, { origin: "http://localhost", host: "localhost" });
  assert.equal(same.statusCode, 200);
  const samePort = await login(app, PASSWORD, { origin: "http://localhost:3000", host: "localhost:3000" });
  assert.equal(samePort.statusCode, 200);
  const wrongPort = await login(app, PASSWORD, { origin: "http://localhost:4000", host: "localhost:3000" });
  assert.equal(wrongPort.statusCode, 403);

  assert.equal((await login(app)).statusCode, 200); // curl-style, no Origin
  await app.close();
});

test("ALLOWED_ORIGINS lets a proxy that rewrites Host keep working, and nothing else", async () => {
  const { app } = await makeApp({}, { allowedOrigins: ["https://inform.example.com"] });
  const viaProxy = await login(app, PASSWORD, { origin: "https://inform.example.com", host: "127.0.0.1:3000" });
  assert.equal(viaProxy.statusCode, 200);
  const other = await login(app, PASSWORD, { origin: "https://evil.example", host: "127.0.0.1:3000" });
  assert.equal(other.statusCode, 403);
  await app.close();
});

test("non-JSON bodies cannot be used to smuggle a form post", async () => {
  const { app } = await makeApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: `password=${encodeURIComponent(PASSWORD)}`,
  });
  assert.equal(res.statusCode, 415);
  await app.close();
});

test("signals and config are locked to signed-in users", async () => {
  const { app } = await makeApp();
  assert.equal((await app.inject({ method: "POST", url: "/api/signals/generate", payload: { sources: ["x"] } })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/api/config" })).statusCode, 401);
  assert.equal((await app.inject({ method: "PUT", url: "/api/config", payload: { sources: [] } })).statusCode, 401);
  // Health and static files stay public.
  assert.equal((await app.inject({ url: "/api/health" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/" })).statusCode, 200);
  await app.close();
});

test("auth-off mode (local development) acts as the owner and has no sign-in", async () => {
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:"), ingestor });
  const me = (await app.inject({ url: "/api/auth/me" })).json();
  assert.deepEqual(me, { authRequired: false, authenticated: true, user: { email: "owner@in-form.local" } });
  assert.equal((await app.inject({ url: "/api/config" })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "anything at all" } })).statusCode, 400);
  await app.close();
});

test("a custom owner email is used for the account", async () => {
  const { app } = await makeApp({ auth: { ownerEmail: "me@example.com" } });
  const res = await login(app);
  assert.equal(res.json().user.email, "me@example.com");
  await app.close();
});
