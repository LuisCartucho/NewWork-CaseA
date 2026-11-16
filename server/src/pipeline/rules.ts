// Step 5 (plain code, no AI): decide green / yellow / red with fixed rules.
// Why not AI: the status is the trust signal. It must be explainable and identical every
// run. "Prices are never guessed" is a rule, not a model judgement.
//   green  = every requested fact found, sources agree, no personal data, product active
//   yellow = partial answer, sources disagree, variant not specified, date reasoning (Christmas)
//   red    = prices/price lists, certificates, discontinued, orders/personal data, not in data
// The status itself is always worst(flags): one source of truth.
import type { Extraction, Flag, Redaction, Resolution, Status } from "../types.js";
import type { LookupResult } from "./lookup.js";

const ORDER = /please (deliver|send|ship)|we('d| would) like to order|place an order|could we (also )?order|purchase order|\bPO\b/i;
const DATE_PROMISE = /christmas|before (the )?(end|start)|by (the )?end of|in time for|deadline|by \d{1,2}(st|nd|rd|th)? \w+/i;
const NUMBER_WITH_UNIT = /(\d+(?:[.,]\d+)?)\s?(cm|mm|kg)\b/gi;

export function decide(input: {
  redaction: Redaction;
  extraction: Extraction | null;
  resolution: Resolution;
  lookup: LookupResult;
  body: string;
}): Flag[] {
  const { redaction, resolution, lookup, body } = input;
  const flags: Flag[] = [];
  const red = (reason: string) => flags.push({ level: "red", reason });
  const yellow = (reason: string) => flags.push({ level: "yellow", reason });

  // ---- red: a person must handle it ----
  if (redaction.containsPersonalData) {
    red(`Contains personal data (${redaction.redactedFields.join(", ")}). It was removed before processing; handle this email personally.`);
  }
  if (ORDER.test(body)) red("This is an order, not a product question. It needs to be processed by a person.");
  if (lookup.asked.includes("price")) red("Asks about prices or a price list. This tool never quotes prices; send the current price list manually.");
  if (lookup.asked.includes("certificates")) {
    red("Asks for certificates. The test documents are not in our data; the fact sheet only names the standards.");
  }
  for (const m of resolution.matches) {
    if (m.variants.some((p) => p.status === "discontinued")) red(`${m.name} is discontinued.`);
  }
  if (!resolution.matches.length) red("No product from our range was recognised in this email.");

  // ---- yellow: a usable draft, but check it ----
  const missing = lookup.missing.filter((m) => !m.includes("price"));
  if (missing.length) yellow(`Not in our data: ${missing.join("; ")}. The draft says we will check.`);
  if (lookup.conflicts.length) {
    yellow(`Our sources disagree (${lookup.conflicts.length}): ${lookup.conflicts[0]}${lookup.conflicts.length > 1 ? " …" : ""}`);
  }
  for (const m of resolution.matches) {
    if (m.variants.length < 2) continue;
    const differing = lookup.facts.filter((f) => f.label.startsWith(`${m.name}:`) && f.skus.length < m.variants.length);
    if (differing.length) {
      yellow(`The retailer didn't say which ${m.name} variant (${m.variants.length} possible), and the answer differs between them.`);
    }
  }
  // A hint that matches no variant, unless a fact already answers it ("leather" -> "leather not possible").
  for (const hint of resolution.unmatchedHints) {
    if (lookup.facts.some((f) => f.value.toLowerCase().includes(hint.toLowerCase()))) continue;
    yellow(`Asks for "${hint}", which doesn't match any variant in our data.`);
  }
  if (lookup.asked.includes("lead_time") && DATE_PROMISE.test(body)) {
    yellow("Asks about a delivery date. A lead time is not a delivery promise; confirm the date before replying.");
  }
  if (lookup.asked.includes("colours")) {
    yellow("Asks about other colours/finishes. Our data only shows what exists today, not what is possible or planned.");
  }
  // A number the retailer quotes (e.g. "your feed says 27 cm") that is in none of our facts.
  const known = new Set(lookup.facts.flatMap((f) => (f.value.match(/\d+(?:[.,]\d+)?/g) ?? []).map(normaliseNumber)));
  const quoted = [...body.matchAll(NUMBER_WITH_UNIT)].filter((m) => !known.has(normaliseNumber(m[1]))).map((m) => m[0]);
  if (quoted.length && resolution.matches.length) {
    yellow(`The email mentions ${[...new Set(quoted)].join(", ")}, which is not in our data for this product.`);
  }

  if (!flags.length) flags.push({ level: "green", reason: "Every requested fact was found and our sources agree." });
  return flags;
}

function normaliseNumber(n: string): string {
  return String(Number(n.replace(",", ".")));
}

export function worst(flags: Flag[]): Status {
  if (flags.some((f) => f.level === "red")) return "red";
  if (flags.some((f) => f.level === "yellow")) return "yellow";
  return "green";
}
