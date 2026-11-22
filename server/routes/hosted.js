// The public, account-free API used by the phone version (INFORM_MODE=hosted).
//
//   GET  /api/topics       the built-in topics and regions (fixed lists)
//   POST /api/v1/generate  one stateless run
//
// Stateless means the server keeps nothing about the person. The phone sends what
// a run needs, the server fetches, ranks and answers, and then forgets:
//
//   topics    ids of built-in topics, e.g. ["technology", "news"]. Nothing else can be
//             fetched here: no custom sites or feeds, so this is not an open fetch proxy
//   region    { scope, area } or null, as in the desktop app
//   seen      keys of items already shown (each is offered once)
//   dismissed keys of items the person dismissed
//   feedback  recent opens, Useful marks and dismissals, which nudge the ranking
//
// The answer has the same shape as POST /api/signals/generate, except each item has
// a `key` (to remember it as seen) instead of an `id`.
//
// What the server does and does not do with a request:
//   - it reads and writes no per-person table: there are no users or sessions here,
//     and the ranking inputs come from the request body
//   - request bodies are never logged, and this route logs only counts
//   - it does see the request while it handles it, and the usual operational logs
//     (time, address, path) exist; it just does not keep topics, seen items or feedback

import { generateSignals } from "../signals/generate.js";
import { itemKey } from "../store/signals.js";
import { affinity, buildProfile } from "../signals/learn.js";
import { TOPICS, TOPIC_PREFIX } from "../topics.js";
import { regionSchema, topicsPayload } from "./config.js";

export const LIMITS = { seen: 3000, dismissed: 1000, feedback: 500, keyLength: 1024, bodyBytes: 1024 * 1024 };

const keyList = (max) => ({ type: "array", maxItems: max, items: { type: "string", maxLength: LIMITS.keyLength } });
const time = { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] };

const bodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["topics"],
  properties: {
    topics: { type: "array", maxItems: TOPICS.length, uniqueItems: true, items: { type: "string", enum: TOPICS.map((t) => t.id) } },
    region: { anyOf: [regionSchema, { type: "null" }] },
    seen: keyList(LIMITS.seen),
    dismissed: keyList(LIMITS.dismissed),
    feedback: {
      type: "array",
      maxItems: LIMITS.feedback,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "source"],
        properties: {
          title: { type: "string", maxLength: 300 },
          source: { type: "string", maxLength: 200 },
          openCount: { type: "integer", minimum: 0, maximum: 1000 },
          openedAt: time,
          usefulAt: time,
          dismissedAt: time,
        },
      },
    },
  },
};

// Anything the generator would log about a source names what the person follows, so
// in hosted mode it gets a logger that says nothing.
const silent = {
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
  child() { return silent; },
};

export default async function hostedRoutes(app, { ingestor, generateOptions = {} }) {
  app.get("/api/topics", async (request, reply) => {
    reply.header("cache-control", "no-store");
    return topicsPayload();
  });

  app.post(
    "/api/v1/generate",
    {
      schema: { body: bodySchema },
      bodyLimit: LIMITS.bodyBytes,
      config: { rateLimit: { max: app.config.generateRateLimitPerMinute, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = request.body;
      const seen = new Set(body.seen ?? []);
      const dismissed = new Set(body.dismissed ?? []);
      const profile = buildProfile(body.feedback ?? []);

      const result = await generateSignals({
        ingestor,
        sources: body.topics.map((id) => `${TOPIC_PREFIX}${id}`),
        exclude: (item) => {
          const key = itemKey(item);
          return dismissed.has(key) ? "dismissed" : seen.has(key) ? "seen" : false;
        },
        affinity: (candidate) => affinity(profile, candidate),
        region: body.region ?? null,
        log: silent,
        ...generateOptions,
      });

      // The phone remembers items by key; there is no server-side id to hand out.
      for (const channel of Object.keys(result.channels)) {
        result.channels[channel] = result.channels[channel].map((item) => ({ ...item, key: itemKey(item) }));
      }

      request.log.info(
        {
          status: result.status,
          sources: result.sources.length,
          failed: result.sources.filter((s) => s.status === "error").length,
          items: Object.values(result.channels).reduce((n, items) => n + items.length, 0),
        },
        "stateless generate",
      );
      reply.header("cache-control", "no-store");
      return result;
    },
  );
}
