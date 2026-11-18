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
import { quantityIn } from "./quantity.js";

export async function runPipeline(email: Email, data: Data, opts: { ai?: boolean } = {}): Promise<PipelineResult> {
  const useAi = opts.ai !== false; // false: facts only (e.g. the Try page fallback when the AI is too slow)
  // 1. plain code. The subject is redacted too: it goes to the AI with the body.
  const bodyRedaction = redact(email.body);
  const subjectRedaction = redact(email.subject);
  const subject = subjectRedaction.redactedBody; // only the redacted subject is used from here on
  const redaction = {
    ...bodyRedaction,
    containsPersonalData: bodyRedaction.containsPersonalData || subjectRedaction.containsPersonalData,
    redactedFields: [...new Set([...bodyRedaction.redactedFields, ...subjectRedaction.redactedFields])],
  };
  const extraction = useAi ? await extract(subject, redaction.redactedBody) : null; // 2. LLM
  const resolution = resolve({                                             // 3. plain code
    extraction, subject, redactedBody: redaction.redactedBody, products: data.products,
  });
  const found = lookup({                                                   // 4. plain code
    extraction, resolution, factSheets: data.factSheets, text: [subject, redaction.redactedBody].join("\n"),
  });
  const quantity = quantityIn(redaction.redactedBody);                     //    plain code
  const flags = decide({                                                   // 5. rules
    redaction, extraction, resolution, lookup: found, body: redaction.redactedBody, date: email.date, quantity,
  });

  // Doubted facts (e.g. Covent COM fabric 0.6 m) are not trusted: the draft gets them as
  // "to confirm", never as a fact it may state.
  const trusted = found.facts.filter((f) => !f.doubt);
  const toConfirm = found.facts.filter((f) => f.doubt).map((f) => `${f.label} (to confirm with Product)`);
  const ai = useAi ? await draftReply({                                    // 6. LLM
    redactedBody: redaction.redactedBody, facts: trusted, flags, missing: [...found.missing, ...toConfirm], quantity,
  }) : null;
  const aiUsed = ai !== null;
  const draft = ai?.text ?? factsOnlyDraft(found.facts, found.missing);

  // 7. plain code. Runs on EVERY AI draft, even if extraction (step 2) fell back to keywords.
  // The retailer's own quantity ("the 4 chairs") is allowed: it's theirs, not a claim about our products.
  const bad = aiUsed ? unknownNumbers(draft, found.facts, resolution.chosen, quantity ? [String(quantity)] : []) : [];
  if (bad.length) {
    flags.push({
      level: "red",
      reason: `The draft contains numbers that are not in our data (${bad.join(", ")}). Do not send it without checking them.`,
      short: `Draft has numbers not in our data (${bad.join(", ")}): don't send`,
      action: `Remove or verify ${bad.join(", ")} in the draft`,
    });
  }

  const rank = { red: 0, yellow: 1, green: 2 } as const;
  flags.sort((a, b) => rank[a.level] - rank[b.level]); // most serious reason first

  return {
    email: { ...email, subject, body: redaction.redactedBody }, // never keep the unredacted subject or body
    redaction, extraction, resolution,
    facts: found.facts, conflicts: found.conflicts, missing: found.missing, asked: found.asked,
    flags, status: worst(flags), draft, aiUsed, ...(quantity ? { quantity } : {}),
    ai: { extract: extraction?.provider ?? null, draft: ai?.provider ?? null },
  };
}
