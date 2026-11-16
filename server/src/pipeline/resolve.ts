// Step 3 (plain code, no AI): match product name + variant hints against products.csv.
// Why not AI: picking the wrong SKU is the costliest error. Code either finds an exact
// match or lists the candidates and flags it. It never picks silently.
import type { Extraction, Product, Resolution } from "../types.js";

export function resolve(_extraction: Extraction | null, _subject: string, _products: Product[]): Resolution {
  // TODO step 2: name/family match, then narrow by variant hints (size, colour, market, synonyms
  // like "lacquered" -> FSC MDF rows).
  return { candidates: [], chosen: [], ambiguous: false };
}
