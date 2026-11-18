// GET /api/config and PUT /api/config — the signed-in user's sources and platforms.
//
// PUT replaces the whole configuration (the setup screen always sends the full
// lists). Sources are checked with the same detector the ingestion layer uses,
// so anything that could never be fetched is rejected up front with a reason
// per source instead of failing silently later.

import { detectSource } from "../ingest/detect.js";
import { MAX_PLATFORMS, MAX_SOURCES, normalizeList } from "../store/config.js";

const putSchema = {
  type: "object",
  required: ["sources", "platforms"],
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

export default async function configRoutes(app, { store }) {
  app.get("/api/config", { preHandler: app.requireAuth }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return store.get(request.user.id);
  });

  app.put("/api/config", { schema: { body: putSchema }, preHandler: app.requireAuth }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    const inputs = normalizeList(request.body.sources);
    const platforms = normalizeList(request.body.platforms);

    const sources = [];
    const invalid = [];
    for (const input of inputs) {
      try {
        sources.push({ input, kind: detectSource(input).kind });
      } catch (err) {
        invalid.push({ input, message: err.message });
      }
    }
    if (invalid.length) {
      return reply.code(400).send({
        error: "invalid_sources",
        message: invalid.map((i) => `"${i.input.slice(0, 40)}": ${i.message}`).join("; "),
        invalid,
      });
    }

    return store.replace(request.user.id, { sources, platforms });
  });
}
