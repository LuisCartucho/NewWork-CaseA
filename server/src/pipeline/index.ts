// Runs one email through every step, in order. This file is the whole pipeline at a glance.
import type { Data } from "../data/loadData.js";
import type { Email, PipelineResult } from "../types.js";
import { redact } from "./redact.js";
import { extract } from "./extract.js";
import { resolve } from "./resolve.js";
import { lookup } from "./lookup.js";
import { decide, worst } from "./rules.js";
import { draftReply, factsOnlyDraft } from "./draft.js";
import { unknownNumbers } from "./numberCheck.js";

export async function runPipeline(email: Email, data: Data): Promise<PipelineResult> {
  const redaction = redact(email.body);                                   // 1. plain code
  const extraction = await extract(email.subject, redaction.redactedBody); // 2. LLM
  const resolution = resolve(extraction, email.subject, data.products);    // 3. plain code
  const found = lookup(extraction, resolution, data.factSheets);           // 4. plain code
  const decision = decide({ redaction, extraction, resolution, lookup: found, body: redaction.redactedBody }); // 5. rules

  let draft = await draftReply({                                           // 6. LLM
    redactedBody: redaction.redactedBody, facts: found.facts, flags: decision.flags, missing: found.missing,
  });
  const aiUsed = draft !== null && extraction !== null;
  if (draft === null) draft = factsOnlyDraft(found.facts, found.missing);

  const flags = [...decision.flags];
  const bad = unknownNumbers(draft, found.facts);                         // 7. plain code
  if (aiUsed && bad.length) {
    flags.push({ level: "red", reason: `The draft contains numbers not found in our data (${bad.join(", ")}). Do not send without checking.` });
  }

  return {
    email: { ...email, body: redaction.redactedBody }, // never keep the unredacted body
    redaction, extraction, resolution,
    facts: found.facts, conflicts: found.conflicts,
    flags, status: worst(flags), draft, aiUsed,
  };
}
