// POST /api/signals/generate
//
// Body: { sources?: string[], platforms?: string[] }
//
// Requires a signed-in user. Each field the body supplies is used as given (this
// is how the browser sends its current setup). A field the body omits falls back
// to the account's stored configuration, so `{}` means "use what I saved".
// Always answers 200 with a status for source-level problems; only malformed
// requests (400), missing sign-in (401) and rate limiting (429) are errors.

import { generateSignals } from "../signals/generate.js";
import { MAX_PLATFORMS, MAX_SOURCES, normalizeList } from "../store/config.js";

const bodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sources: {
      type: "array",
      maxItems: MAX_SOURCES,
      items: { type: "string", minLength: 1, maxLength: 2048 },
    },
    platforms: {
      type: "array",
      maxItems: MAX_PLATFORMS,
      items: { type: "string", minLength: 1, maxLength: 80 },
    },
  },
};

export default async function signalRoutes(app, { ingestor, store, generateOptions = {} }) {
  app.post(
    "/api/signals/generate",
    {
      schema: { body: bodySchema },
      preHandler: app.requireAuth,
      config: { rateLimit: { max: app.config.generateRateLimitPerMinute, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const stored = body.sources === undefined || body.platforms === undefined ? store.get(request.user.id) : null;
      const sources = normalizeList(body.sources ?? stored.sources);
      const platforms = normalizeList(body.platforms ?? stored.platforms);

      const result = await generateSignals({
        ingestor,
        sources,
        platforms,
        log: request.log,
        ...generateOptions,
      });

      request.log.info(
        {
          status: result.status,
          sources: result.sources.length,
          failed: result.sources.filter((s) => s.status === "error").length,
          filled: Object.values(result.channels).filter(Boolean).length,
        },
        "signals generated",
      );
      reply.header("cache-control", "no-store");
      return result;
    },
  );

  // Note: no global feed-health endpoint yet. The feeds table is shared across
  // users and feed URLs reveal what people follow, so it needs per-user scoping
  // first (Step 7). Each generate response already carries per-source health.
}
