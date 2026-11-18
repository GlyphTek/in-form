// POST /api/signals/generate
//
// Body: { sources: string[], platforms: string[] }
//
// Until accounts arrive (Step 4) the client sends its declared configuration;
// afterwards the server will read it from the user's stored config instead.
// Always answers 200 with a status for source-level problems; only malformed
// requests (400) and rate limiting (429) are errors.

import { generateSignals } from "../signals/generate.js";

export const MAX_SOURCES = 20;
export const MAX_PLATFORMS = 20;

const bodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sources: {
      type: "array",
      maxItems: MAX_SOURCES,
      items: { type: "string", minLength: 1, maxLength: 2048 },
      default: [],
    },
    platforms: {
      type: "array",
      maxItems: MAX_PLATFORMS,
      items: { type: "string", minLength: 1, maxLength: 80 },
      default: [],
    },
  },
};

function uniqueTrimmed(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    const t = v.trim().replace(/\s+/g, " ");
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

export default async function signalRoutes(app, { ingestor, generateOptions = {} }) {
  app.post(
    "/api/signals/generate",
    {
      schema: { body: bodySchema },
      config: { rateLimit: { max: app.config.generateRateLimitPerMinute, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const sources = uniqueTrimmed(request.body?.sources ?? []);
      const platforms = uniqueTrimmed(request.body?.platforms ?? []);

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
  // users and feed URLs reveal what people follow, so it waits for auth (Step 4).
  // Each generate response already carries per-source health for the caller.
}
