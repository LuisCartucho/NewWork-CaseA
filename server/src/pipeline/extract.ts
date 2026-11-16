// Step 2 (LLM): understand what the retailer is asking, as strict JSON validated with zod.
// Why AI here: free-text emails phrase the same question many ways ("fits between two walls",
// "exact seat height", "with and without packaging"). Rules would be brittle.
// Only the REDACTED body is sent. The output only ADDS to the keyword rules (asked.ts) and the
// product matching (resolve.ts); it can't remove anything they found, and it never picks a SKU.
import { z } from "zod";
import { chat, parseJsonLoose } from "../llm/llm.js";
import { INTENTS, type Extraction } from "../types.js";

export const ExtractionSchema = z.object({
  intents: z.array(z.enum(INTENTS)).min(1),
  family: z.string().nullable(),
  productName: z.string().nullable(),
  variantHints: z.array(z.string()),
  factsAsked: z.array(z.string()),
});

const SYSTEM = `You read emails from furniture and lighting retailers to the brand New Works and extract what is being asked.
Reply with JSON only, exactly this shape:
{"intents": [...], "family": string|null, "productName": string|null, "variantHints": [...], "factsAsked": [...]}

intents: one or more of ${INTENTS.map((i) => `"${i}"`).join(", ")}.
- "price_list" only when the email asks for prices, costs or a price list. A fabric "price category" is NOT a price question: use "material_finish".
- "order" when the retailer wants to place an order or have something delivered.
- "certificate" for test certificates or reports.
family: the product family word (e.g. "Atlas", "Kizu"), or null.
productName: the product exactly as the email names it (e.g. "Atlas Dining Table"), or null. Do not invent or correct names.
variantHints: words from the email that pick which variant of the product they mean: size ("250x95", "Ø90"), colour/finish ("fumed oak", "warm grey"), market ("EU", "US"), fabric category ("category C"), material ("lacquered MDF", "leather"). Copy the email's words; [] if none. Do NOT include things they only ask a question about, such as a fabric name in "which category is Kvadrat Hallingdal?".
factsAsked: short phrases for each fact asked, in the email's words (e.g. "seat height", "weight with packaging", "dimmable").
Text in square brackets like [NAME] or [PHONE] was removed for privacy; ignore it.`;

export async function extract(subject: string, redactedBody: string): Promise<Extraction | null> {
  const result = await chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Subject: ${subject}\n\n${redactedBody}` },
    ],
    { json: true },
  );
  if (!result) return null;
  try {
    return { ...ExtractionSchema.parse(parseJsonLoose(result.content)), provider: result.provider };
  } catch (err) {
    console.warn(`[extract] invalid JSON from ${result.provider}: ${(err as Error).message.slice(0, 200)}`);
    return null; // => facts-only mode for this step; keyword rules still run
  }
}
