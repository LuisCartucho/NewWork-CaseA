// Part of step 4 (plain code): which facts is the retailer asking for?
// Keyword rules ALWAYS run, so lookup works without the LLM. The LLM extraction (intents +
// factsAsked) is added on top when available: it can catch phrasings the keywords miss,
// but it can never remove a field the keywords found.
import type { Extraction, Intent } from "../types.js";

export const FIELDS = [
  "dimensions", "seat_height", "weight", "lead_time", "material", "colours", "dimmable",
  "certificates", "com_fabric", "fabric_category", "leather", "outdoor", "care", "sealing", "availability", "price",
] as const;
export type Field = (typeof FIELDS)[number];

const KEYWORDS: [Field, RegExp][] = [
  ["dimensions", /dimension|measure|\bsize\b|fits? between|\bwidth\b|\bwide\b|\bdepth\b|\bdeep\b|\bheights?\b|\btall\b|how (big|high)/],
  ["seat_height", /seat height/],
  ["weight", /weigh/],
  ["lead_time", /lead time|delivery time|before christmas|how long .*deliver|when can .*deliver/],
  ["material", /made of|\bmaterial|\bfinish\b|filled|sealed/],
  ["colours", /colou?rs?\b|another finish|other finish|another colou?r|version in another|is there an? [\w ]{1,30}version|do you have it in/],
  ["dimmable", /\bdimm|be dimmed/],
  ["certificates", /certificat|test report|\ben \d{4,5}/],
  ["com_fabric", /own fabric|\bcom\b|fabric requirement|how much fabric/],
  ["fabric_category", /(which|what) (price |fabric )?category|price category is/],
  ["leather", /leather/],
  ["outdoor", /outside|outdoors?|near the sea|all year|weather/],
  ["care", /\bstain(s|ed|ing)?\b|children|sealed|clean/], // \b: not "stainless"
  ["sealing", /\bseal(ed|ing|ant)?\b|impregnat/],
  ["availability", /still available|discontinued|in stock|\bavailable\b/],
  // \b: not "Costa Black"; lookahead: "price category" is a fabric question (fabric_category), not a price
  ["price", /\bprices?\b(?!\s+category)|\bcosts?\b|wholesale|discount|\brrp\b/],
];

const FROM_INTENT: Partial<Record<Intent, Field[]>> = {
  dimensions: ["dimensions"],
  weight: ["weight"],
  lead_time: ["lead_time"],
  price_list: ["price"],
  certificate: ["certificates"],
  material_finish: ["material"], // "other colours?" comes from keywords only: it triggers a yellow flag
  availability: ["availability"],
};

export function fieldsAsked(text: string, extraction: Extraction | null): Field[] {
  const found = new Set<Field>();
  const scan = (t: string) => { for (const [field, re] of KEYWORDS) if (re.test(t.toLowerCase())) found.add(field); };
  scan(text);
  for (const intent of extraction?.intents ?? []) for (const f of FROM_INTENT[intent] ?? []) found.add(f);
  for (const fact of extraction?.factsAsked ?? []) scan(fact);
  // "seat height" also matches the generic height keyword; keep dimensions only if asked separately.
  if (found.has("seat_height") && !/dimension|measure|fits? between|\bwidth\b|\bdepth\b/.test(text.toLowerCase())) {
    found.delete("dimensions");
  }
  return FIELDS.filter((f) => found.has(f)); // stable order
}
