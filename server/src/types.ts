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
}

export interface Resolution {
  candidates: Product[];
  chosen: Product[]; // empty when ambiguous; never guessed
  ambiguous: boolean;
}

export interface Fact {
  label: string;
  value: string;
  source: string; // "products.csv SKU 42711" | "Atlas Dining Table - Fact Sheet.pdf p.2"
}

export type Status = "green" | "yellow" | "red";
export interface Flag {
  level: Status;
  reason: string; // one plain-language sentence for Sales Support
}

export interface PipelineResult {
  email: Email;
  redaction: Redaction;
  extraction: Extraction | null;
  resolution: Resolution;
  facts: Fact[];
  conflicts: string[];
  flags: Flag[];
  status: Status;
  draft: string;
  aiUsed: boolean; // false => "AI unavailable, facts only"
  duplicateOf?: string;
}
