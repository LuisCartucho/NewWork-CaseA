// Step 7 (plain code, no AI): every number in the draft must appear in the facts.
// Why not AI: you can't ask the model to check itself. A regex over the draft is a hard guarantee.
//
// Allowed numbers come from the facts (value + source) and from the chosen products' identity
// (name, variant, SKU), so repeating "Atlas Dining Table 200x95" is not a false alarm.
// The email body is deliberately NOT allowed: a number the retailer wrote is not a checked fact.
import type { Fact, Product } from "../types.js";

export function unknownNumbers(draft: string, facts: Fact[], products: Product[] = [], extra: string[] = []): string[] {
  const allowed = new Set([
    ...extra.flatMap(numbersIn),
    // Labels are built from our data too ("Price category of Hallingdal 65"), so their numbers count.
    ...facts.flatMap((f) => numbersIn(`${f.label} ${f.value} ${f.source}`)),
    ...products.flatMap((p) => numbersIn(`${p.name} ${p.variant} ${p.sku}`)),
  ]);
  return [...new Set(numbersIn(draft).filter((n) => !allowed.has(n)))];
}

/** Normalised numbers: "3,995" / "3.995" (thousands) -> "3995", "8,49" (decimal) -> "8.49". */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map(normalise);
}

function normalise(n: string): string {
  const parts = n.split(/[.,]/);
  if (parts.length === 1) return n;
  // Every group after the first is exactly 3 digits -> thousands separators ("3,995", "1.250.000").
  if (parts.slice(1).every((p) => p.length === 3) && parts[0].length <= 3) return parts.join("");
  // Otherwise the last separator is the decimal point.
  return `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
}
