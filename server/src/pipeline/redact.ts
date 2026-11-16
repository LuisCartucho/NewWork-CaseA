// Step 1 (plain code, no AI): remove personal data BEFORE anything else sees the email.
// Why not AI: sending the email to an LLM to find personal data would already leak it.
import type { Redaction } from "../types.js";

export function redact(body: string): Redaction {
  // TODO step 1
  return { redactedBody: body, containsPersonalData: false, redactedFields: [] };
}
