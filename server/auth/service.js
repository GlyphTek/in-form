// Single-owner authentication for the dogfood phase.
//
// One shared password (INFORM_PASSWORD) unlocks one account. Logging in creates
// an opaque random session token that goes to the browser in an httpOnly cookie.
// Only a SHA-256 hash of the token is stored, so a leaked database cannot be
// replayed as live sessions. The users/sessions tables are the same ones magic
// links or passkeys will use later; only the way a user proves identity changes.

import crypto from "node:crypto";

export const SESSION_COOKIE = "inform_session";
export const MIN_PASSWORD_LENGTH = 12;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest();
const sha256Hex = (value) => sha256(value).toString("hex");

export function createAuth({ db, config, now = Date.now }) {
  const { mode, password, ownerEmail, sessionDays } = config.auth;

  if (mode === "unconfigured") {
    throw new Error(
      "Authentication is not configured. Set INFORM_PASSWORD (at least " +
        `${MIN_PASSWORD_LENGTH} characters), or INFORM_AUTH=off for local development only.`,
    );
  }
  if (mode === "password" && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`INFORM_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  // Comparing fixed-length digests in constant time avoids leaking the password
  // length or matching prefix through timing.
  const passwordDigest = mode === "password" ? sha256(password) : null;

  const insertOwner = db.prepare("INSERT INTO users (email) VALUES (?) ON CONFLICT(email) DO NOTHING");
  const selectOwner = db.prepare("SELECT id, email FROM users WHERE email = ?");
  const insertSession = db.prepare("INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)");
  const selectSessionUser = db.prepare(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  );
  const deleteSession = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const pruneExpired = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");

  function owner() {
    insertOwner.run(ownerEmail);
    return selectOwner.get(ownerEmail);
  }

  function verifyPassword(candidate) {
    if (mode !== "password" || typeof candidate !== "string" || candidate.length > 1024) return false;
    return crypto.timingSafeEqual(sha256(candidate), passwordDigest);
  }

  function createSession(userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const t = now();
    const expiresAt = new Date(t + sessionDays * 86_400_000).toISOString();
    pruneExpired.run(new Date(t).toISOString());
    insertSession.run(userId, sha256Hex(token), new Date(t).toISOString(), expiresAt);
    return { token, expiresAt, maxAgeSeconds: sessionDays * 86_400 };
  }

  function userForToken(token) {
    if (typeof token !== "string" || token.length < 20 || token.length > 128) return null;
    return selectSessionUser.get(sha256Hex(token), new Date(now()).toISOString()) ?? null;
  }

  function destroySession(token) {
    if (typeof token === "string" && token.length <= 128) deleteSession.run(sha256Hex(token));
  }

  return { mode, owner, verifyPassword, createSession, userForToken, destroySession };
}
