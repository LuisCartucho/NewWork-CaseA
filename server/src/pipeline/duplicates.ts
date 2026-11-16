// Plain code: emails that are the same.
//  - Identical: same retailer + same text (M007 = M015). Reply once; the later one is flagged.
//  - Same question: same text from a DIFFERENT retailer (M003 ≈ M020). Both need their own reply,
//    but one checked answer serves both, so they're linked. Status is not changed.
import type { PipelineResult } from "../types.js";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function markDuplicates(results: PipelineResult[]): void {
  const byText = new Map<string, PipelineResult[]>();
  for (const r of results) {
    const key = `${norm(r.email.subject)}\u0000${norm(r.email.body)}`;
    byText.set(key, [...(byText.get(key) ?? []), r]);
  }

  for (const group of byText.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      const identical = group.filter((o) => o !== r && norm(o.email.from_retailer) === norm(r.email.from_retailer));
      const same = group.filter((o) => o !== r && norm(o.email.from_retailer) !== norm(r.email.from_retailer));
      if (identical.length) r.identicalTo = identical.map((o) => o.email.id);
      if (same.length) r.sameQuestionAs = same.map((o) => o.email.id);
    }
    // The later identical email points at the first one and is flagged "reply once".
    const firstByRetailer = new Map<string, string>();
    for (const r of group) {
      const first = firstByRetailer.get(norm(r.email.from_retailer));
      if (!first) { firstByRetailer.set(norm(r.email.from_retailer), r.email.id); continue; }
      r.duplicateOf = first;
      r.flags.unshift({
        level: "yellow",
        reason: `Identical to ${first}: same retailer, same text. Reply once and close both.`,
        short: `Identical to ${first}: reply once`,
        action: `Reply once: this also answers ${first}`,
      });
      if (r.status === "green") r.status = "yellow";
    }
  }
}
