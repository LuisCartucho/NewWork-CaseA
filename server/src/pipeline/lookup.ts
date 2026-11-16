// Step 4 (plain code, no AI): pull each requested fact from products.csv AND the
// hand-checked fact sheet facts, compare the two, and attach a source to every value.
// Why not AI: this is a table lookup; an LLM could only add risk (invented numbers).
import type { Extraction, Fact, FactSheet, Resolution } from "../types.js";

export interface LookupResult {
  facts: Fact[];
  conflicts: string[];
  missing: string[]; // asked for but not in either source
}

export function lookup(_extraction: Extraction | null, _resolution: Resolution, _factSheets: FactSheet[]): LookupResult {
  // TODO step 2
  return { facts: [], conflicts: [], missing: [] };
}
