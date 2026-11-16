// Step 5 (plain code, no AI): decide green / yellow / red with fixed rules.
// Why not AI: the status is the trust signal. It must be explainable and identical every
// run. "Prices are never guessed" is a rule, not a model judgement.
//   green  = every requested fact found, sources agree, no personal data, product active
//   yellow = partial answer, sources disagree, variant not specified, date reasoning (Christmas)
//   red    = prices/price lists, certificates, discontinued, orders/personal data, not in data
// The status itself is always worst(flags): one source of truth.
//
// Every reason is specific to the email: it names the product and the exact fact. `reason` is the
// full sentence (detail page); `short` is max ~90 characters (inbox row); `action` is what the person
// must do before sending (the "Before sending" checklist).
import type { Extraction, Fact, Flag, ProductMatch, Redaction, Resolution, Status } from "../types.js";
import type { LookupResult } from "./lookup.js";
import { issueKey, type DataConflict } from "./conflicts.js";

/** Data issue field -> words for the checklist ("Confirm the correct net weight for …"). */
const FIELD_NAME: Record<string, string> = {
  weight_kg: "net weight", height_cm: "height", width_cm: "width", depth_cm: "depth",
};

/** "net weight" (a missing item) -> "weight_kg" (a data issue field). */
const MISSING_FIELD: Record<string, string> = {
  "net weight": "weight_kg", height: "height_cm", width: "width_cm", depth: "depth_cm", diameter: "width_cm",
};

/** Issues where the CSV value is proven wrong and lookup.ts withheld it (same list as there). */
const WITHHELD = new Set(["mismatch", "packed_as_net", "weight_wrong"]);

const ORDER = /please (deliver|send|ship)|we('d| would) like to order|place an order|could we (also )?order|purchase order|\bPO\b/i;
const DATE_PROMISE = /before christmas|christmas|before (the )?(end|start) of \w+|by (the )?end of \w+|in time for [\w ]{1,20}|deadline|by \d{1,2}(st|nd|rd|th)? \w+/i;
const NUMBER_WITH_UNIT = /(\d+(?:[.,]\d+)?)\s?(cm|mm|kg)\b/gi;
const SHORT_MAX = 90;

export function decide(input: {
  redaction: Redaction;
  extraction: Extraction | null;
  resolution: Resolution;
  lookup: LookupResult;
  body: string;
  date?: string; // email date, for "6-8 weeks from 2 Nov" reasoning
  quantity?: number;
}): Flag[] {
  const { redaction, resolution, lookup, body, quantity } = input;
  const flags: Flag[] = [];
  const add = (level: Status, reason: string, short: string, action?: string, issueKeys?: string[]) =>
    flags.push({ level, reason, short: clip(short), ...(action ? { action } : {}), ...(issueKeys?.length ? { issueKeys } : {}) });
  const products = resolution.matches;
  const names = products.map((m) => m.name).join(" and ");

  // ---- red: a person must handle it ----
  if (redaction.containsPersonalData) {
    add("red",
      `Contains a private person's details (${redaction.redactedFields.join(", ")}). They were removed before processing; handle this email yourself.`,
      `Private customer details removed: ${redaction.redactedFields.map(shortField).join(", ")}`,
      "Handle the customer's details yourself: don't paste them into any other tool");
  }
  if (ORDER.test(body)) {
    const what = products.map((m) => `${m.name}${variantLabel(m)}`).join(" and ") || "products";
    add("red",
      `This is an order for ${what}${quantity ? ` (${quantity} units)` : ""}, not a product question. Orders are processed by a person.`,
      `Order for ${names || "products"}: needs a person`,
      `Process the order for ${what}${quantity ? ` (${quantity} units)` : ""}, or pass it to whoever does`);
  }
  if (lookup.asked.includes("price")) {
    if (resolution.families.length || /price ?list/i.test(body)) {
      const fam = resolution.families.join(", ") || names;
      add("red",
        `Asks for the current wholesale price list for the ${fam} family. This tool never quotes prices: send the current price list yourself.`,
        `Asks for the ${fam} price list. Prices are never quoted`,
        `Attach the current ${fam} wholesale price list`);
    } else {
      const what = `${quantity ? `${quantity} × ` : ""}${products.map((m) => `${m.name}${variantLabel(m)}`).join(", ") || "the product"}`;
      add("red",
        `Asks the price for ${what}. This tool never quotes prices: only retail RRP is in our data, and the price must come from you.`,
        `Asks the price for ${what}. Never quoted`,
        `Add the price for ${what}`);
    }
  }
  if (lookup.asked.includes("certificates")) {
    for (const m of products.length ? products : [null]) {
      const label = m ? `${m.name}${variantLabel(m)}` : "the product";
      const listed = m && lookup.facts.find((f) => f.label.startsWith(`${m.name}: Certificates`));
      add("red",
        `Asks for test certificates for ${label}. The documents are not in our data.${listed ? ` The fact sheet lists: ${listed.value}` : ""}`,
        `Wants certificates for ${label}: documents not in our data`,
        `Attach the test certificates for ${label}, or say they're being requested`);
    }
  }
  for (const m of products) {
    const gone = m.variants.filter((p) => p.status === "discontinued");
    if (gone.length) {
      add("red",
        `${m.name} (${gone.map((p) => p.sku).join(", ")}) is discontinued. Decide what to offer instead.`,
        `${m.name} is discontinued`,
        `Say ${m.name} is discontinued and suggest an alternative`,
        [`${m.name}|status`]);
    }
  }
  if (!products.length) {
    add("red", "No product from our range was recognised in this email.", "No product from our range recognised",
      "Find out which product they mean");
  }

  // ---- yellow: a usable draft, but check it ----
  for (const item of lookup.missing.filter((x) => !x.includes("price") && !x.startsWith("Product:"))) {
    const [product, field] = splitMissing(item);
    // Missing only because a wrong value was withheld (Karl-Johan net weight): caused by that data issue.
    const column = MISSING_FIELD[field.replace(/ \(.*$/, "")];
    const cause = lookup.conflictItems.find((c) => c.product === product && c.field === column);
    add("yellow",
      `${capital(field)} for ${product} is not in products.csv or the fact sheet. The draft says we will check.`,
      `${capital(field)} for ${product} isn't in our data`,
      `Find the ${field} for ${product}, or keep "we'll check" in the draft`,
      cause ? [issueKey(cause)] : undefined);
  }

  for (const group of groupConflicts(lookup.conflictItems)) add("yellow", group.reason, group.short, group.action, group.issueKeys);

  for (const f of lookup.facts.filter((x) => x.doubt)) {
    const [product, label] = splitLabel(f.label);
    add("yellow",
      `${label} for ${product}: the fact sheet says ${f.value.split(" (")[0]}, but ${lowerFirst(f.doubt!)}`,
      `${product}: ${label} ${f.value.split(" (")[0]} looks implausible`,
      `Confirm the ${label.replace(/^COM/, "COM").toLowerCase().replace(/^com /, "COM ")} for ${product} with Product`,
      [`${product}|doubt`]);
  }

  for (const m of products) {
    if (m.variants.length < 2) continue;
    const differing = lookup.facts.filter((f) => f.label.startsWith(`${m.name}:`) && f.skus.length < m.variants.length);
    if (!differing.length) continue;
    const fields = [...new Set(differing.map((f) => splitLabel(f.label)[1].replace(/ \(.*$/, "").toLowerCase()))];
    const examples = differing.slice(0, 2).map((f) => `${f.value} (${f.label.match(/\(([^)]*)\)/)?.[1] ?? f.skus.join(", ")})`);
    add("yellow",
      `The retailer didn't say which ${m.name} (${m.variants.length} variants possible), and the ${fields.join(", ")} ${fields.length > 1 ? "differ" : "differs"}: ${examples.join(" vs ")}.`,
      `${m.name} variant not given: ${fields.join(", ")} ${fields.length > 1 ? "differ" : "differs"}`,
      `Ask which ${m.name} they mean, or keep the value for each variant in the draft`);
  }

  for (const hint of resolution.unmatchedHints) {
    if (lookup.facts.some((f) => f.value.toLowerCase().includes(hint.toLowerCase()))) continue;
    add("yellow", `Asks for "${hint}", which doesn't match any ${names || "product"} variant in our data.`, `"${hint}" doesn't match any variant in our data`,
      `Check what they mean by "${hint}"`);
  }

  const datePhrase = body.match(DATE_PROMISE)?.[0];
  if (lookup.asked.includes("lead_time") && datePhrase) {
    const lead = lookup.facts.find((f) => /Lead time/.test(f.label));
    const window = lead && input.date ? arrivalWindow(input.date, lead.value) : null;
    add("yellow",
      `Asks for delivery "${datePhrase}". ${lead ? `Lead time is ${lead.value}${window ? `: from ${fmtDate(input.date!)} that's ${window}` : ""}, but a` : "A"} lead time is not a delivery date: confirm before promising.`,
      `Wants it "${datePhrase}"${lead ? `; lead time ${lead.value.split(" ")[0]} weeks` : ""}: not a delivery date`,
      `Confirm whether delivery "${datePhrase}" is possible before promising it`);
  }

  if (quantity && quantity > 1 && (lookup.asked.includes("lead_time") || products.some((m) => m.variants.some((p) => p.made_to_order === "true")))) {
    add("yellow",
      `Asks about ${quantity} units of ${names}. The lead time in our data is per item: confirm it holds for ${quantity} made-to-order units.`,
      `${quantity} units requested: confirm lead time for that quantity`,
      `Confirm the lead time for ${quantity} units of ${names}`);
  }

  if (lookup.asked.includes("colours")) {
    for (const m of products) {
      const today = lookup.facts.find((f) => f.label === `${m.name}: Variants in products.csv`);
      add("yellow",
        `Asks about other colours/finishes for ${m.name}. Our data only shows what exists today${today ? ` (${today.value})` : ""}, not what is possible or planned.`,
        `Asks about other colours for ${m.name}: we only know today's`,
        `Answer the other-colours question for ${m.name} (our data only has today's range)`);
    }
  }

  // Numbers the retailer quotes (e.g. "your feed says 27 cm"): name which source says what.
  const known = new Set(lookup.facts.flatMap((f) => (f.value.match(/\d+(?:[.,]\d+)?/g) ?? []).map(normaliseNumber)));
  if (products.length) {
    for (const q of new Set([...body.matchAll(NUMBER_WITH_UNIT)].map((m) => m[0]))) {
      const [, num, unit] = q.match(/(\d+(?:[.,]\d+)?)\s?(\w+)/)!;
      if (known.has(normaliseNumber(num))) continue;
      const close = closestFact(lookup.facts, Number(num.replace(",", ".")), unit.toLowerCase());
      if (close) {
        const [, label] = splitLabel(close.label);
        add("yellow",
          `The email says ${q}, but our data says ${close.value} (${label.toLowerCase()}; ${close.source}). Check where ${q} comes from.`,
          `Email says ${q}; our data says ${close.value} (${label.toLowerCase()})`,
          `Check where ${q} comes from: our data says ${close.value}`);
      } else {
        add("yellow", `The email mentions ${q}, which is not in our data for ${names}.`, `Email mentions ${q}: not in our data for ${names}`,
          `Check whether ${q} matters for the answer`);
      }
    }
  }

  if (!flags.length) add("green", "Every requested fact was found, and products.csv and the fact sheet agree.", "All facts found; sources agree");
  return flags;
}

/** One reason per product + issue, with the SKUs grouped: "Karl-Johan Table Lamp (4 variants): …". */
function groupConflicts(items: DataConflict[]): { reason: string; short: string; action: string; issueKeys: string[] }[] {
  const groups = new Map<string, DataConflict[]>();
  for (const c of items) groups.set(`${c.product}|${c.message}`, [...(groups.get(`${c.product}|${c.message}`) ?? []), c]);
  // Same product + same kind with different numbers (e.g. per-SKU heights) stay separate: they're different facts.
  return [...groups.values()].map((g) => {
    const who = g.length > 1 ? `${g[0].product} (${g.length} variants)` : `${g[0].product} ${g[0].sku}`;
    return {
      reason: `Our data disagrees for ${who}: ${g[0].message}. ${WITHHELD.has(g[0].kind)
        ? "That value is left out of the draft."
        : "Check this before sending."}`,
      short: `${g[0].product}: ${g[0].short}`,
      action: g[0].kind === "not_on_sheet"
        ? `Don't send the ${g[0].product} fact sheet as-is: it doesn't list ${g[0].short.replace(/ isn't on its fact sheet$/, "")}`
        : `Confirm the correct ${FIELD_NAME[g[0].field] ?? g[0].field.replace(/_/g, " ")} for ${g[0].product} with Product`,
      issueKeys: [...new Set(g.map(issueKey))],
    };
  });
}

/** " (COM)", " (200x95, Fumed Oak)" for one variant; " (lacquered)" from the email's words for several. */
function variantLabel(m: ProductMatch): string {
  if (m.variants.length === 1 && m.variants[0].variant) return ` (${m.variants[0].variant})`;
  const hints = m.hints.map((h) => h.replace(/\s*\(.*\)$/, ""));
  return hints.length ? ` (${hints.join(", ")})` : "";
}

function closestFact(facts: Fact[], n: number, unit: string): Fact | undefined {
  const wanted = unit === "mm" ? n / 10 : n;
  const want = unit === "kg" ? "kg" : "cm";
  return facts
    .map((f) => ({ f, v: Number(f.value.match(/^[\d.]+/)?.[0]) }))
    .filter(({ f, v }) => f.value.includes(want) && v && Math.abs(v - wanted) / wanted <= 0.15)
    .sort((a, b) => Math.abs(a.v - wanted) - Math.abs(b.v - wanted))[0]?.f;
}

/** "6-8 weeks…" from 2026-11-02 -> "14 Dec–28 Dec". */
function arrivalWindow(date: string, lead: string): string | null {
  const m = lead.match(/^(\d+)(?:\s*-\s*(\d+))?\s*weeks?/);
  const start = new Date(`${date}T00:00:00Z`);
  if (!m || Number.isNaN(start.getTime())) return null;
  const add = (w: number) => fmtDate(new Date(start.getTime() + w * 7 * 86_400_000).toISOString().slice(0, 10));
  return m[2] ? `${add(Number(m[1]))}–${add(Number(m[2]))}` : add(Number(m[1]));
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

const splitMissing = (item: string): [string, string] => {
  const i = item.indexOf(": ");
  return i < 0 ? ["the product", item] : [item.slice(0, i), item.slice(i + 2)];
};
const splitLabel = (label: string): [string, string] => splitMissing(label);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const SHORT_FIELD: Record<string, string> = {
  "personal ID number": "ID", "phone number": "phone", "street address": "address",
  "postcode and city": "postcode", "private person's name": "name", "email address": "email",
};
const shortField = (f: string) => SHORT_FIELD[f] ?? f;
const clip = (s: string) => (s.length <= SHORT_MAX ? s : `${s.slice(0, SHORT_MAX - 1).trimEnd()}…`);

function normaliseNumber(n: string): string {
  return String(Number(n.replace(",", ".")));
}

export function worst(flags: Flag[]): Status {
  if (flags.some((f) => f.level === "red")) return "red";
  if (flags.some((f) => f.level === "yellow")) return "yellow";
  return "green";
}
