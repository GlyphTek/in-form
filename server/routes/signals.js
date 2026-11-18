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
import { itemKey } from "../store/signals.js";
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

const idParams = {
  type: "object",
  // URL params are strings (type coercion is off app-wide); validate digits, convert below.
  properties: { id: { type: "string", pattern: "^[1-9][0-9]{0,9}$" } },
  required: ["id"],
};

const stateBody = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: { dismissed: { type: "boolean" }, useful: { type: "boolean" } },
};

export default async function signalRoutes(app, { ingestor, store, signals, generateOptions = {} }) {
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

      // Anything already shown to this user is left out, so pressing again gives
      // the next batch instead of the same items.
      const seen = signals.seenKeys(request.user.id);
      const result = await generateSignals({
        ingestor,
        sources,
        platforms,
        exclude: (item) => seen.get(itemKey(item)) ?? false,
        log: request.log,
        ...generateOptions,
      });
      // Store what is being shown now so each item has an id to act on.
      result.channels = signals.recordShown(request.user.id, result.channels);

      request.log.info(
        {
          status: result.status,
          sources: result.sources.length,
          failed: result.sources.filter((s) => s.status === "error").length,
          filled: Object.values(result.channels).filter((items) => items.length > 0).length,
          hidden: result.hidden,
          items: Object.values(result.channels).reduce((n, items) => n + items.length, 0),
          perChannel: Object.fromEntries(Object.entries(result.channels).map(([k, v]) => [k, v.length])),
        },
        "signals generated",
      );
      reply.header("cache-control", "no-store");
      return result;
    },
  );

  // The user opened a signal's link.
  app.post("/api/signals/:id/open", { schema: { params: idParams }, preHandler: app.requireAuth }, async (request, reply) => {
    if (!signals.recordOpen(request.user.id, Number(request.params.id))) {
      return reply.code(404).send({ statusCode: 404, error: "not_found", message: "Signal not found." });
    }
    return reply.code(204).send();
  });

  // Dismiss (hide from future runs) and/or mark useful. Idempotent, and
  // `false` undoes either one.
  app.put(
    "/api/signals/:id/state",
    { schema: { params: idParams, body: stateBody }, preHandler: app.requireAuth },
    async (request, reply) => {
      const state = signals.updateState(request.user.id, Number(request.params.id), request.body);
      if (!state) return reply.code(404).send({ statusCode: 404, error: "not_found", message: "Signal not found." });
      reply.header("cache-control", "no-store");
      return state;
    },
  );

  // Note: no global feed-health endpoint yet. The feeds table is shared across
  // users and feed URLs reveal what people follow, so it needs per-user scoping
  // first (Step 7). Each generate response already carries per-source health.
}
