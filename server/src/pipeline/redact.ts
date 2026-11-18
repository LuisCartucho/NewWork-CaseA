// Step 1 (plain code, no AI): remove personal data BEFORE anything else sees the email.
// Why not AI: sending the email to an LLM to find personal data would already leak it.
// Regex rules are predictable, testable, run locally and cost nothing.
//
// Rules are deliberately conservative: retailer emails are about products, so a false
// positive (redacting "Storgatan 14") is cheap, while a miss leaks a private person's data.
import type { Redaction } from "../types.js";

interface Rule {
  field: string; // what the Sales Support person sees: "personal ID number", "phone number"...
  token: string; // replacement text shown in the redacted email
  pattern: RegExp;
}

const L = "\\p{Lu}"; // any uppercase letter, incl. ÆØÅÄÖÜ
const l = "[\\p{Ll}'-]"; // lowercase letter, apostrophe or hyphen
const NAME = `${L}${l}+(?:\\s+${L}${l}+){1,2}`; // "Anna Lindqvist", "Jan de Vries" style: 2-3 capitalised words

// Order matters: personal IDs before phones (a phone pattern could eat an ID).
const RULES: Rule[] = [
  {
    // Nordic personal ID numbers: SE YYMMDD-XXXX / YYYYMMDD-XXXX, DK CPR DDMMYY-XXXX,
    // FI DDMMYY[-+A]XXXX, NO 11 digits. Last 4 may already be masked with X.
    field: "personal ID number",
    token: "[PERSONAL ID]",
    pattern: /\b(?:\d{8}|\d{6})[-+A]?[\dX]{4}\b|\b\d{11}\b/gu,
  },
  {
    // International numbers (+46 70 123 45 67), or any digit run after "phone/tel/mobile".
    field: "phone number",
    token: "[PHONE]",
    pattern: /\+\d{1,3}[\s-]?\(?\d+\)?(?:[\s-]?\d+){2,}|(?<=\b(?:phone|tel|mobile|mob|telefon)\.?:?\s*)\d[\d\s-]{6,}\d/giu,
  },
  {
    field: "email address",
    token: "[EMAIL]",
    pattern: /[\w.+-]+@[\w-]+\.[\w.]+/gu,
  },
  {
    // Street + house number, using common North-European street suffixes.
    field: "street address",
    token: "[ADDRESS]",
    pattern: new RegExp(
      `\\b[\\p{L}-]*(?:gatan|gata|vägen|väg|gade|vej|veien|vei|gate|straße|strasse|str\\.|weg|laan|straat|street|st\\.|road|rd\\.|avenue|allé|alle|plads|torv)\\s+\\d+[A-Za-z]?\\b`,
      "giu",
    ),
  },
  {
    // Postcode + city: "211 34 Malmö", "1265 København", "10115 Berlin". Only applied when a
    // street address was found too (see below), otherwise "2026 Copenhagen"-style text would match.
    field: "postcode and city",
    token: "[POSTCODE CITY]",
    pattern: new RegExp(`\\b\\d{3}\\s?\\d{2}\\s+${L}${l}+|\\b\\d{4,5}\\s+${L}${l}+`, "gu"),
  },
  {
    // A private person named in delivery instructions: "to our customer directly: Anna Lindqvist",
    // "Attn: ...", "deliver to: ...". Requires the colon so normal sentences don't match.
    // No "i" flag: with it, \p{Lu} would also match lowercase and "customer: one table" would match.
    field: "private person's name",
    token: "[NAME]",
    pattern: new RegExp(
      `(?<=\\b(?:[Cc]ustomer|[Cc]lient|[Rr]ecipient|[Aa]ttn|[Aa]ttention|[Cc]/[Oo]|[Cc]onsignee|[Dd]eliver(?:y)?\\s+to|[Ss]hip\\s+to)\\b[^:\\n]{0,25}:\\s*)${NAME}`,
      "gu",
    ),
  },
  {
    // A name written as a contact, right before a phone number or email that was already
    // redacted above: "Order for Anna Lindqvist, +46 70 123 45 67" (often in a subject line).
    // A product name in that position would be redacted too: a cheap false positive.
    field: "private person's name",
    token: "[NAME]",
    pattern: new RegExp(`${NAME}(?=,?\\s*(?:\\[PHONE\\]|\\[EMAIL\\]))`, "gu"),
  },
];

export function redact(body: string): Redaction {
  let text = body;
  const found = new Set<string>();

  for (const rule of RULES) {
    if (rule.field === "postcode and city" && !found.has("street address")) continue;
    text = text.replace(rule.pattern, () => {
      found.add(rule.field);
      return rule.token;
    });
  }

  return {
    redactedBody: text,
    containsPersonalData: found.size > 0,
    redactedFields: [...found],
  };
}
