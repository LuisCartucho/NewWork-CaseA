// Step 7 (plain code, no AI): every number in the draft must appear in the facts.
// Why not AI: you can't ask the model to check itself. A regex over the draft is a hard guarantee.
import type { Fact } from "../types.js";

export function unknownNumbers(draft: string, facts: Fact[]): string[] {
  const allowed = new Set(facts.flatMap((f) => numbersIn(`${f.value} ${f.source}`)));
  return numbersIn(draft).filter((n) => !allowed.has(n));
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}
