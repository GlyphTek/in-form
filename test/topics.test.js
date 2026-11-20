import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSource } from "../server/ingest/detect.js";
import { TOPICS } from "../server/topics.js";

test("every topic is detected with its search phrase and label", () => {
  for (const t of TOPICS) {
    const d = detectSource(`topic:${t.id}`);
    assert.equal(d.kind, "topic");
    assert.equal(d.query, t.query);
    assert.equal(d.label, t.label);
  }
});

test("topic ids are case-insensitive; unknown ids throw", () => {
  assert.equal(detectSource("TOPIC:Science").query, "science");
  assert.throws(() => detectSource("topic:"), /Unknown topic/);
  assert.throws(() => detectSource("topic:cooking"), /Unknown topic/);
});
