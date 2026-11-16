// Step 3 (plain code, no AI): match product name + variant hints against products.csv.
// Why not AI: picking the wrong SKU is the costliest error. Code either finds an exact
// match or lists the candidates and flags it. It never picks silently.
//
// Works WITHOUT the LLM too (extraction === null): then it matches product names/families
// and variant words directly in the subject + redacted body. The extraction only sharpens it.
import type { Extraction, Product, Resolution } from "../types.js";

export function resolve(_input: {
  extraction: Extraction | null;
  subject: string;
  redactedBody: string;
  products: Product[];
}): Resolution {
  // TODO step 2: name/family match (extraction first, else subject + body text), then narrow
  // by variant hints (size, colour, market, synonyms like "lacquered" -> FSC MDF rows).
  return { candidates: [], chosen: [], ambiguous: false };
}
