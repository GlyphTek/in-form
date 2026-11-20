// POST /api/signals/generate
//
// Body: { sources?: string[], region?: { scope, area } } (omitted: the saved sources are used)
//
// Requires a signed-in user. Each field the body supplies is used as given (this
// is how the browser sends its current setup). A field the body omits falls back
// to the account's stored configuration, so `{}` means "use what I saved".
// Always answers 200 with a status for source-level problems; only malformed
// requests (400), missing sign-in (401) and rate limiting (429) are errors.

import { generateSignals } from "../signals/generate.js";
import { itemKey } from "../store/signals.js";
import { affinity, buildProfile, summarize } from "../signals/learn.js";
import { MAX_SOURCES, normalizeList } from "../store/config.js";
import { regionSchema } from "./config.js";

const bodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sources: {
      type: "array",
      maxItems: MAX_SOURCES,
      items: { type: "string", minLength: 1, maxLength: 2048 },
    },
    region: regionSchema,
    // Deprecated: platforms were removed. Older pages may still send them, so
    // they are accepted and ignored rather than rejected.
    platforms: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
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
      const stored = store.get(request.user.id);
      const sources = normalizeList(body.sources ?? stored.sources);
      const region = body.region ?? stored.region ?? null;

      // Anything already shown to this user is left out, so pressing again gives
      // the next batch instead of the same items.
      const seen = signals.seenKeys(request.user.id);
      // What this user opens, marks useful and dismisses nudges the ranking.
      const profile = buildProfile(signals.feedbackRows(request.user.id));
      const result = await generateSignals({
        ingestor,
        sources,
        exclude: (item) => seen.get(itemKey(item)) ?? false,
        affinity: (candidate) => affinity(profile, candidate),
        region,
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
          // e.g. "topic:news@nz ok 14": one entry per regional fetch.
          editions: result.sources.flatMap((src) =>
            (src.editions ?? []).map((e) => `${e.input} ${e.status === "error" ? `error (${e.error?.kind ?? "unknown"})` : `${e.status} ${e.itemCount}`}`),
          ),
        },
        "signals generated",
      );
      reply.header("cache-control", "no-store");
      return result;
    },
  );

  // What has been learned from this user's opens, useful marks and dismissals.
  app.get("/api/learning", { preHandler: app.requireAuth }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return summarize(buildProfile(signals.feedbackRows(request.user.id)));
  });

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
