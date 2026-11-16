// Shared types for the whole pipeline. One email flows through:
// redact -> extract (LLM) -> resolve -> lookup -> rules -> draft (LLM) -> numberCheck

export interface Email {
  id: string;
  date: string;
  from_retailer: string;
  subject: string;
  body: string;
}

export interface Product {
  sku: string;
  name: string;
  family: string;
  category: string;
  variant: string;
  width_cm: string;
  depth_cm: string;
  height_cm: string; // string on purpose: Nebra is "148-175"
  weight_kg: string;
  material: string;
  lead_time_weeks: string;
  made_to_order: string;
  rrp_dkk: string;
  status: string;
}

/** Hand-checked facts from a fact sheet PDF (see data/fact_sheet_facts.json). */
export interface FactSheetFact {
  field: string; // e.g. "seat_height_cm", "dimmable", "weight_incl_packaging_kg"
  value: string;
  appliesTo?: string[]; // SKUs; omitted = whole product
  page: number;
  doubt?: string; // the sheet says it, but it looks implausible: shown, never trusted
}
export interface FactSheet {
  file: string;
  name: string; // product name as in products.csv
  facts: FactSheetFact[];
}

export interface Redaction {
  redactedBody: string;
  containsPersonalData: boolean;
  redactedFields: string[]; // e.g. ["name", "address", "phone", "personal_id"]
}

export const INTENTS = [
  "dimensions", "weight", "lead_time", "price_list", "certificate",
  "material_finish", "availability", "order", "other",
] as const;
export type Intent = (typeof INTENTS)[number];

export interface Extraction {
  intents: Intent[];
  family: string | null;
  productName: string | null;
  variantHints: string[];
  factsAsked: string[];
  provider?: string; // which LLM produced it ("Gemini" | "Groq")
}

/** One product (products.csv `name`) mentioned in the email, narrowed by variant hints. */
export interface ProductMatch {
  name: string;
  matchedBy: string; // the text that identified it, e.g. "Kantarell Pendant" or family "Atlas"
  variants: Product[]; // rows still consistent with the email (1 = exact SKU)
  hints: string[]; // variant attributes found in the email, e.g. ["Ø60", "Nickel Plated"]
}

export interface Resolution {
  matches: ProductMatch[]; // one per product mentioned; empty = no product found
  families: string[]; // families named without a specific product ("Atlas family")
  candidates: Product[]; // every row of every matched product
  chosen: Product[]; // rows still consistent with the email; >1 means not a single SKU. Never guessed.
  ambiguous: boolean; // some product still has more than one row left
  unmatchedHints: string[]; // LLM variant hints that fit no row (e.g. "leather")
}

export interface Fact {
  label: string;
  value: string;
  source: string; // "products.csv SKU 42711" | "Atlas Dining Table - Fact Sheet.pdf p.2"
  skus: string[]; // rows this value is true for
  doubt?: string; // set when the source value looks implausible (see FactSheetFact.doubt)
}

export type Status = "green" | "yellow" | "red";
export interface Flag {
  level: Status;
  reason: string; // full plain-language sentence for the detail page: names the product and the fact
  short?: string; // max ~90 characters for the inbox row
  action?: string; // what the person must do before sending: one "Before sending" checklist item
  issueKeys?: string[]; // data issues that cause this flag ("Karl-Johan Table Lamp|weight_kg"): fixing them clears it
}

export interface PipelineResult {
  email: Email;
  redaction: Redaction;
  extraction: Extraction | null;
  resolution: Resolution;
  facts: Fact[];
  conflicts: string[];
  missing: string[]; // asked for but not in our data
  asked?: string[]; // which facts the retailer asks for (dimensions, lead_time, price…): inbox topic tags
  flags: Flag[];
  status: Status;
  draft: string;
  aiUsed: boolean; // the draft was written by an LLM; false => "AI unavailable, facts only"
  ai: { extract: string | null; draft: string | null }; // provider per AI step, null = not used
  aiTimedOut?: boolean; // Try page: the AI took too long, so this result is facts only
  quantity?: number; // units the retailer mentions ("four Covent Club Chairs"), when more than one
  duplicateOf?: string; // identical email (same retailer + text) seen earlier: reply once
  identicalTo?: string[]; // all other identical emails
  sameQuestionAs?: string[]; // same text from a different retailer: same checked answer, separate reply
}
