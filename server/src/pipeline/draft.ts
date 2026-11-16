// Step 6 (LLM): write the reply from ONLY the looked-up facts and flags.
// Why AI here: turning a list of facts into a polite, natural email is what LLMs are good at.
// It may not add numbers; missing items become "I'll check this with the team".
// Step 7 (numberCheck.ts) then verifies every number in the draft against the facts.
import { chat } from "../llm/llm.js";
import type { Fact, Flag } from "../types.js";

const SYSTEM = `You write short, friendly, professional email replies for New Works Sales Support to retailers.
You get the retailer's email, a list of FACTS from New Works' product data, a list of MISSING items, and NOTES for the reply.

Hard rules:
- Use ONLY the FACTS. Never add a number, measurement, date, price, certificate or claim that is not in the FACTS.
- Do not repeat numbers from the retailer's email unless the same number is in the FACTS.
- For every MISSING item, say you will check with the team and come back to them. Do not guess.
- Never say something does NOT exist, is NOT available or is NOT the case unless a FACT says exactly that. Absence from the FACTS means "I'll check", never "no".
- Answer only what was asked; for any part of the question the FACTS don't answer, say you will check.
- Never quote prices or discounts. Never promise a delivery date: a lead time is not a delivery date.
- Never confirm or accept an order. If they want to order, say the team will follow up on the order.
- If a QUANTITY is given, mention it (e.g. "for the four chairs"). Never say a lead time applies to that quantity: give the lead time per item and say you will confirm it for that quantity.
- If the retailer did not specify the variant and the facts differ per variant, give each variant's value.
- Text in square brackets like [NAME] was removed for privacy: never fill it in or repeat it.
- Plain text, no markdown, no source references or page numbers. Keep it under 150 words.
- Start with "Hi," and end with "Best regards,\nNew Works Sales Support".`;

export async function draftReply(input: {
  redactedBody: string;
  facts: Fact[];
  flags: Flag[];
  missing: string[];
  quantity?: number;
}): Promise<{ text: string; provider: string } | null> {
  const facts = input.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n") || "(none)";
  const missing = input.missing.map((m) => `- ${m}`).join("\n") || "(none)";
  const notes = input.flags.filter((f) => f.level !== "green").map((f) => `- ${f.reason}`).join("\n") || "(none)";

  const result = await chat([
    { role: "system", content: SYSTEM },
    { role: "user", content: `RETAILER EMAIL:\n${input.redactedBody}\n\n${input.quantity ? `QUANTITY: ${input.quantity}\n\n` : ""}FACTS:\n${facts}\n\nMISSING:\n${missing}\n\nNOTES (for you, not to copy):\n${notes}` },
  ]);
  return result ? { text: result.content, provider: result.provider } : null;
}

/** Used when the LLM is unavailable: a plain list the person can paste and edit. */
export function factsOnlyDraft(facts: Fact[], missing: string[]): string {
  const lines = ["AI unavailable, facts only.", ""];
  for (const f of facts) lines.push(`- ${f.label}: ${f.value} (${f.source})`);
  for (const m of missing) lines.push(`- ${m}: I'll check this with the team and come back to you.`);
  return lines.join("\n");
}
