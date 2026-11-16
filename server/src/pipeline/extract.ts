// Step 2 (LLM): understand what the retailer is asking, as strict JSON validated with zod.
// Why AI here: free-text emails phrase the same question many ways ("fits between two walls",
// "exact seat height", "with and without packaging"). Rules would be brittle.
// Only the REDACTED body is sent.
import { z } from "zod";
import { INTENTS, type Extraction } from "../types.js";

export const ExtractionSchema = z.object({
  intents: z.array(z.enum(INTENTS)).min(1),
  family: z.string().nullable(),
  productName: z.string().nullable(),
  variantHints: z.array(z.string()),
  factsAsked: z.array(z.string()),
});

export async function extract(_subject: string, _redactedBody: string): Promise<Extraction | null> {
  // TODO step 3: call llm.ts with a JSON-only prompt, validate with ExtractionSchema.
  return null; // null => facts-only mode
}
