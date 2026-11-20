// The topics offered as one-tap chips on the setup screen. Each maps to a tuned
// news search phrase. A topic is stored as the source "topic:<id>".
//
// `local: true` marks topics that have regional variants (see regions.js).
// `localQuery` overrides the phrase for regional editions (News is "world news"
// globally but just "news" in an edition, which already leans local).
// Adding a topic is one line here. Phrases are searched as plain news queries,
// so they should be short and broad enough to always have recent coverage.

export const TOPICS = [
  { id: "technology", label: "Technology", query: "technology" },
  { id: "science", label: "Science", query: "science" },
  { id: "news", label: "News", query: "world news", localQuery: "news", local: true },
  { id: "sport", label: "Sport", query: "sport", local: true },
  { id: "education", label: "Education", query: "education", local: true },
  { id: "religion", label: "Religion", query: "religion" },
  { id: "relationships-wellbeing", label: "Relationships and wellbeing", query: "relationships wellbeing" },
];

const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export const TOPIC_PREFIX = "topic:";

export function getTopic(id) {
  return BY_ID.get(id) ?? null;
}
