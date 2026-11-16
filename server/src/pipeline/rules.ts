// Step 5 (plain code, no AI): decide green / yellow / red with fixed rules.
// Why not AI: the status is the trust signal. It must be explainable and identical every
// run. "Prices are never guessed" is a rule, not a model judgement.
//   green  = every requested fact found, sources agree, no personal data, product active
//   yellow = partial answer, sources disagree, ambiguous variant, date reasoning (Christmas)
//   red    = prices/price lists, certificates, discontinued, orders/personal data, not in data
import type { Extraction, Flag, Redaction, Resolution, Status } from "../types.js";
import type { LookupResult } from "./lookup.js";

export function decide(_input: {
  redaction: Redaction;
  extraction: Extraction | null;
  resolution: Resolution;
  lookup: LookupResult;
  body: string;
}): { status: Status; flags: Flag[] } {
  // TODO step 2
  return { status: "red", flags: [{ level: "red", reason: "Not processed yet." }] };
}

export function worst(flags: Flag[]): Status {
  if (flags.some((f) => f.level === "red")) return "red";
  if (flags.some((f) => f.level === "yellow")) return "yellow";
  return "green";
}
