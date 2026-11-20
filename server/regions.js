// Regions for the Local / Global / Both choice.
//
// "Local" means the regional Google News editions of the chosen continent. Only
// English-language editions are used (English-only at launch), so a continent
// can have none: South America has no English edition yet, and the app says so
// instead of pretending.
//
// These editions are NOT yet verified against live Google News. Each one is a
// plain news search with its own hl/gl/ceid; check them with
//   npm run ingest -- "topic:news@nz"

export const EDITIONS = {
  NZ: { code: "NZ", label: "New Zealand", hl: "en-NZ", gl: "NZ", ceid: "NZ:en" },
  AU: { code: "AU", label: "Australia", hl: "en-AU", gl: "AU", ceid: "AU:en" },
  GB: { code: "GB", label: "United Kingdom", hl: "en-GB", gl: "GB", ceid: "GB:en" },
  IE: { code: "IE", label: "Ireland", hl: "en-IE", gl: "IE", ceid: "IE:en" },
  ZA: { code: "ZA", label: "South Africa", hl: "en-ZA", gl: "ZA", ceid: "ZA:en" },
  NG: { code: "NG", label: "Nigeria", hl: "en-NG", gl: "NG", ceid: "NG:en" },
  KE: { code: "KE", label: "Kenya", hl: "en-KE", gl: "KE", ceid: "KE:en" },
  IN: { code: "IN", label: "India", hl: "en-IN", gl: "IN", ceid: "IN:en" },
  SG: { code: "SG", label: "Singapore", hl: "en-SG", gl: "SG", ceid: "SG:en" },
  PH: { code: "PH", label: "Philippines", hl: "en-PH", gl: "PH", ceid: "PH:en" },
  US: { code: "US", label: "United States", hl: "en-US", gl: "US", ceid: "US:en" },
  CA: { code: "CA", label: "Canada", hl: "en-CA", gl: "CA", ceid: "CA:en" },
};

export const REGIONS = [
  { id: "europe", label: "Europe", editions: ["GB", "IE"] },
  { id: "africa", label: "Africa", editions: ["ZA", "NG", "KE"] },
  { id: "asia", label: "Asia", editions: ["IN", "SG", "PH"] },
  { id: "oceania", label: "Oceania", editions: ["NZ", "AU"] },
  { id: "north-america", label: "North America", editions: ["US", "CA"] },
  { id: "south-america", label: "South America", editions: [] },
];

export const SCOPES = ["local", "global", "both"];
export const REGION_IDS = REGIONS.map((r) => r.id);

const BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

export function getRegion(id) {
  return BY_ID.get(id) ?? null;
}

export function getEdition(code) {
  return EDITIONS[String(code).toUpperCase()] ?? null;
}

/** The editions a region draws on, as full edition objects. */
export function editionsFor(areaId) {
  return (getRegion(areaId)?.editions ?? []).map((c) => EDITIONS[c]);
}
