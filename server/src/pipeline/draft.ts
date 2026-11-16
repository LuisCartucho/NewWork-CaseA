// Step 6 (LLM): write the reply from ONLY the looked-up facts and flags.
// Why AI here: turning a list of facts into a polite, natural email is what LLMs are good at.
// It may not add numbers; missing items become "I'll check this with the team".
import type { Fact, Flag } from "../types.js";

export async function draftReply(_input: {
  redactedBody: string;
  facts: Fact[];
  flags: Flag[];
  missing: string[];
}): Promise<string | null> {
  // TODO step 3
  return null; // null => use factsOnlyDraft()
}

/** Used when the LLM is unavailable: a plain list the person can paste and edit. */
export function factsOnlyDraft(facts: Fact[], missing: string[]): string {
  const lines = ["AI unavailable, facts only.", ""];
  for (const f of facts) lines.push(`- ${f.label}: ${f.value} (${f.source})`);
  for (const m of missing) lines.push(`- ${m}: I'll check this with the team and come back to you.`);
  return lines.join("\n");
}
