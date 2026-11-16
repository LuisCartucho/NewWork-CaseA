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
  const resolution = resolve({                                             // 3. plain code
    extraction, subject: email.subject, redactedBody: redaction.redactedBody, products: data.products,
  });
  const found = lookup({                                                   // 4. plain code
    extraction, resolution, factSheets: data.factSheets, text: [email.subject, redaction.redactedBody].join("\n"),
  });
  const flags = decide({ redaction, extraction, resolution, lookup: found, body: redaction.redactedBody }); // 5. rules

  const ai = await draftReply({                                            // 6. LLM
    redactedBody: redaction.redactedBody, facts: found.facts, flags, missing: found.missing,
  });
  const aiUsed = ai !== null;
  const draft = ai?.text ?? factsOnlyDraft(found.facts, found.missing);

  // 7. plain code. Runs on EVERY AI draft, even if extraction (step 2) fell back to keywords.
  const bad = aiUsed ? unknownNumbers(draft, found.facts, resolution.chosen) : [];
  if (bad.length) {
    flags.push({ level: "red", reason: `The draft contains numbers not found in our data (${bad.join(", ")}). Do not send without checking.` });
  }

  const rank = { red: 0, yellow: 1, green: 2 } as const;
  flags.sort((a, b) => rank[a.level] - rank[b.level]); // most serious reason first

  return {
    email: { ...email, body: redaction.redactedBody }, // never keep the unredacted body
    redaction, extraction, resolution,
    facts: found.facts, conflicts: found.conflicts, missing: found.missing,
    flags, status: worst(flags), draft, aiUsed,
    ai: { extract: extraction?.provider ?? null, draft: ai?.provider ?? null },
  };
}
