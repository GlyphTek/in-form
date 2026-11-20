// /api/auth/*  — session state, login and logout.
//
// GET /api/auth/me always answers 200 so the frontend can decide which screen to
// show without treating "signed out" as an error:
//   { authRequired, authenticated, user? }
//
// Login failures give one generic message and are strictly rate limited.

import { SESSION_COOKIE } from "../auth/service.js";

export default async function authRoutes(app, { auth }) {
  const noStore = (reply) => reply.header("cache-control", "no-store");

  app.get("/api/auth/me", async (request, reply) => {
    noStore(reply);
    return {
      authRequired: auth.mode === "password",
      authenticated: Boolean(request.user),
      user: request.user ? { email: request.user.email } : null,
    };
  });

  app.post(
    "/api/auth/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["password"],
          additionalProperties: false,
          properties: { password: { type: "string", minLength: 1, maxLength: 1024 } },
        },
      },
      config: { rateLimit: { max: app.config.auth.loginRateLimitPerMinute, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      noStore(reply);
      if (auth.mode !== "password") {
        // In "off" mode everyone is already the owner; there is nothing to log in to.
        return reply.code(400).send({ error: "auth_disabled", message: "Sign-in is not required here." });
      }
      if (!auth.verifyPassword(request.body.password)) {
        request.log.warn("failed login attempt");
        return reply.code(401).send({ error: "invalid_credentials", message: "Incorrect password." });
      }

      const user = auth.owner();
      const session = auth.createSession(user.id);
      reply.setCookie(SESSION_COOKIE, session.token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: request.protocol === "https",
        maxAge: session.maxAgeSeconds,
      });
      request.log.info({ userId: user.id }, "login");
      return { authRequired: true, authenticated: true, user: { email: user.email } };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    noStore(reply);
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) auth.destroySession(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { authRequired: auth.mode === "password", authenticated: false, user: null };
  });
}
