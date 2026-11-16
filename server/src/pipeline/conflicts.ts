// Part of step 4 (plain code): data quality checks, SKU by SKU.
//  - products.csv against the hand-checked fact sheet facts
//  - products.csv against itself (variants of the same product that disagree, odd values)
//  - fact sheet values that look implausible (marked with "doubt" in fact_sheet_facts.json)
// Used per email (lookup.ts: only issues relevant to what was asked) and for the whole
// catalogue (Data issues page).
import type { Email, FactSheet, FactSheetFact, Product } from "../types.js";
import { redact } from "./redact.js";
import { resolve } from "./resolve.js";

export type ConflictKind =
  | "mismatch" //          CSV and fact sheet both have a value and they differ
  | "packed_as_net" //     CSV net weight equals the fact sheet's packed weight (within 1%)
  | "weight_wrong" //      CSV net weight is much bigger than the packed weight: implausible
  | "csv_inconsistent" //  products.csv disagrees with itself (variants, names, categories, spelling…)
  | "not_on_sheet" //      the variant's colour is not on the product's fact sheet
  | "missing" //           a value is empty in products.csv
  | "implausible"; //      the fact sheet says it, but it looks wrong (doubt)

/** How bad it is for a retailer answer. */
export type Severity = "wrong" | "inconsistent" | "missing" | "cosmetic";

export interface DataConflict {
  sku: string;
  product: string;
  field: string; // what it's about: "weight_kg", "height_cm", "category", "colour", …
  kind: ConflictKind;
  severity: Severity;
  message: string; // plain language, without product/SKU (shown next to them)
  short: string; // a few words for the inbox row (max ~60 characters)
  emails?: string[]; // emails that ask about it (set by findDataIssues when emails are given)
}

/** Links a data issue to the email flags it causes (see Flag.issueKeys). */
export function issueKey(c: Pick<DataConflict, "product" | "field" | "kind">): string {
  if (c.kind === "implausible") return `${c.product}|doubt`;
  return `${c.product}|${c.field}`;
}

/** CSV column -> fact sheet field it is checked against. Lamps: CSV width/depth hold the diameter. */
const NUMERIC_CHECKS: { column: keyof Product; field: string; label: string; unit: string }[] = [
  { column: "width_cm", field: "width_cm", label: "Width", unit: "cm" },
  { column: "depth_cm", field: "depth_cm", label: "Depth", unit: "cm" },
  { column: "height_cm", field: "height_cm", label: "Height", unit: "cm" },
  { column: "weight_kg", field: "weight_kg", label: "Net weight", unit: "kg" },
];

const MARKETS = new Set(["EU", "UK", "US", "AU", "CN", "JP"]);

/** The most specific fact for this SKU: one listing the SKU beats one for the whole product. */
export function factFor(sheet: FactSheet | undefined, field: string, sku: string): FactSheetFact | undefined {
  const facts = sheet?.facts.filter((f) => f.field === field) ?? [];
  return facts.find((f) => f.appliesTo?.includes(sku)) ?? facts.find((f) => !f.appliesTo);
}

/** First number (or range) in a value: "21 (printed on…)" -> "21", "148-175" -> "148-175". */
export function leadingNumber(value: string): string | null {
  const m = value.trim().match(/^\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?/);
  return m ? m[0].replace(/,/g, ".").replace(/\s+/g, "") : null;
}

export function sameNumber(a: string, b: string): boolean {
  const x = leadingNumber(a), y = leadingNumber(b);
  if (x === null || y === null) return false;
  return x.includes("-") || y.includes("-") ? x === y : Number(x) === Number(y);
}

const page = (f: FactSheetFact) => `fact sheet p.${f.page}`;

/** products.csv vs the fact sheet, for one SKU. */
export function conflictsForSku(p: Product, sheet: FactSheet | undefined): DataConflict[] {
  if (!sheet) return [];
  const out: DataConflict[] = [];
  const add = (field: string, kind: ConflictKind, severity: Severity, message: string, short = message) =>
    out.push({ sku: p.sku, product: p.name, field, kind, severity, message, short });

  for (const check of NUMERIC_CHECKS) {
    const csv = String(p[check.column] ?? "").trim();
    const fact = factFor(sheet, check.field, p.sku)
      ?? (check.field === "width_cm" || check.field === "depth_cm" ? factFor(sheet, "diameter_cm", p.sku) : undefined);
    if (!fact) continue;
    const factNum = leadingNumber(fact.value) ?? fact.value;
    if (!csv) {
      add(check.field, "missing", "missing", `${check.label} empty in products.csv (${page(fact)} says ${factNum} ${check.unit})`);
    } else if (!sameNumber(csv, fact.value)) {
      add(check.field, "mismatch", "wrong", `${check.label} ${csv} ${check.unit} in products.csv, ${factNum} ${check.unit} on the ${page(fact)}`,
        `${check.label} ${csv} vs ${factNum} ${check.unit} on the fact sheet`);
    }
  }

  // Net weight vs the fact sheet's weight INCLUDING packaging. Net can't be more than packed.
  // May: the packed weight is for a 2-pack, so the comparison doesn't apply ("two" in the value).
  const packed = factFor(sheet, "weight_incl_packaging_kg", p.sku);
  const net = Number(p.weight_kg);
  const packedKg = packed ? Number(leadingNumber(packed.value)) : NaN;
  if (packed && p.weight_kg && !/two/.test(packed.value) && Number.isFinite(packedKg)) {
    const ratio = net / packedKg;
    // ±1%: the real cases are exact (Kizu 7.8 = 7.8). A rug 1.5% under its packed weight is plausible.
    if (Math.abs(ratio - 1) <= 0.01) {
      add("weight_kg", "packed_as_net", "wrong", `Net weight ${net} kg is the packed weight on the ${page(packed)} (${packedKg} kg)`,
        `Net weight ${net} kg is really the packed weight`);
    } else if (ratio > 1.01) {
      add("weight_kg", "weight_wrong", "wrong", `Net weight ${net} kg, but the packed weight on the ${page(packed)} is only ${packedKg} kg`,
        `Net weight ${net} kg, but only ${packedKg} kg packed`);
    }
  }

  const colours = factFor(sheet, "colours_listed", p.sku);
  if (colours) {
    const listed = colours.value.split("(")[0].toLowerCase();
    const colour = p.variant.split(",")[0].trim();
    if (colour && !listed.includes(colour.toLowerCase()) && !listed.includes(p.sku)) {
      add("colour", "not_on_sheet", "inconsistent", `${colour} is not on the ${page(colours)} (it lists ${colours.value.split("(")[0].trim()})`,
        `${colour} isn't on its fact sheet`);
    }
  }

  // Values the fact sheet states but that look wrong: never trusted.
  for (const f of sheet.facts) {
    if (f.doubt && (!f.appliesTo || f.appliesTo.includes(p.sku))) {
      add(f.field, "implausible", "wrong", `${f.value.split(" (")[0]} on the ${page(f)}: ${f.doubt}`,
        `${f.value.split(" (")[0]} looks implausible`);
    }
  }
  return out;
}

/** products.csv against itself, for every row of the given products. */
export function catalogueIssues(products: Product[], factSheets: FactSheet[] = []): DataConflict[] {
  const out: DataConflict[] = [];
  const add = (p: Product, field: string, kind: ConflictKind, severity: Severity, message: string, short = message) =>
    out.push({ sku: p.sku, product: p.name, field, kind, severity, message, short });
  const sheets = new Map(factSheets.map((s) => [s.name, s]));

  for (const [name, rows] of groupBy(products, (p) => p.name)) {
    // 1. Same colour, different market -> weight should be the same.
    for (const [colour, group] of groupBy(rows, colourKey)) {
      const weights = new Set(group.map((p) => p.weight_kg).filter(Boolean));
      if (weights.size < 2) continue;
      const parts = [...weights].map((w) => `${w} kg (${group.filter((p) => p.weight_kg === w).map(market).join(", ")})`);
      const range = [...weights].map(Number).sort((a, b) => a - b).join(" vs ");
      for (const p of group) {
        add(p, "weight_kg", "csv_inconsistent", "inconsistent", `${colour}: weight differs by market: ${parts.join(" vs ")}`,
          `${colour} weight differs by market (${range} kg)`);
      }
    }

    // 2. A number in the variant name that disagrees with the height ("Bar Stool, 65" but 66 cm).
    for (const p of rows) {
      const n = p.variant.split(/,\s*/).find((x) => /^\d{2,3}$/.test(x.trim()));
      const h = Number(p.height_cm);
      if (n && h && Number(n) !== h && Math.abs(Number(n) - h) <= 5) {
        add(p, "height_cm", "csv_inconsistent", "inconsistent", `Called "${n}" but the height is ${h} cm (seat height not given anywhere)`,
          `Called "${n}" but ${h} cm tall`);
      }
    }

    // 3. Categories: different from the product's other variants, or not matching the name.
    const counts = new Map<string, number>();
    for (const p of rows) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    const usual = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    for (const p of rows) {
      const words = p.category.split(/[\s/]+/);
      const fitsName = words.some((w) => name.includes(w) || p.variant.includes(w));
      if (p.variant.includes(p.category)) continue; // "Oak Wood, Lid" really is a lid
      if (p.category !== usual && counts.size > 1) {
        add(p, "category", "csv_inconsistent", "cosmetic", `Category "${p.category}", but the other variants are "${usual}"`);
      } else if (!fitsName) {
        add(p, "category", "csv_inconsistent", "cosmetic", `Category "${p.category}" doesn't fit the product name`);
      }
    }

    // 4. Spelling variants inside one product ("Anodised" vs "Anodized").
    const spellings = new Map<string, Set<string>>();
    for (const p of rows) {
      for (const word of p.variant.split(/[\s,/]+/).filter((w) => w.length > 4)) {
        const key = word.toLowerCase().replace(/z/g, "s");
        spellings.set(key, (spellings.get(key) ?? new Set()).add(word));
      }
    }
    for (const forms of spellings.values()) {
      if (forms.size < 2) continue;
      const all = [...forms];
      for (const p of rows) {
        const used = all.find((w) => p.variant.includes(w));
        const others = all.filter((w) => w !== used);
        if (used) add(p, "variant", "csv_inconsistent", "cosmetic", `Spelt "${used}" here, "${others.join('", "')}" on other variants`);
      }
    }

    // 5. Empty values (weight/height only when the fact sheet doesn't have them: that's reported above).
    const sheet = sheets.get(name);
    for (const p of rows) {
      for (const [col, label] of [["weight_kg", "Weight"], ["height_cm", "Height"]] as const) {
        if (!p[col] && !factFor(sheet, col, p.sku)) add(p, col, "missing", "missing", `${label} is empty in products.csv`);
      }
      if (!p.family) add(p, "family", "missing", "cosmetic", "Family is empty in products.csv");
      if (!p.made_to_order) add(p, "made_to_order", "missing", "cosmetic", "Made to order (true/false) is empty in products.csv");
      if (!p.variant) add(p, "variant", "missing", "cosmetic", "Variant name is empty in products.csv");
    }
  }
  return out;
}

/** Every issue in the catalogue, for the Data issues page. With emails: which emails ask about each product. */
export function findDataIssues(products: Product[], factSheets: FactSheet[], emails: Email[] = []): DataConflict[] {
  const sheets = new Map(factSheets.map((s) => [s.name, s]));
  const issues = [
    ...products.flatMap((p) => conflictsForSku(p, sheets.get(p.name))),
    ...catalogueIssues(products, factSheets),
  ];

  // Which emails ask about which SKUs (same matching as the pipeline, without AI).
  const asking = new Map<string, string[]>();
  for (const e of emails) {
    const r = resolve({ extraction: null, subject: e.subject, redactedBody: redact(e.body).redactedBody, products });
    for (const p of r.chosen) asking.set(p.sku, [...(asking.get(p.sku) ?? []), e.id]);
  }
  for (const i of issues) {
    const ids = asking.get(i.sku);
    if (ids) i.emails = [...new Set(ids)];
  }

  // Discontinued products that retailers still ask for.
  for (const p of products) {
    const ids = asking.get(p.sku);
    if (p.status === "discontinued" && ids) {
      issues.push({ sku: p.sku, product: p.name, field: "status", kind: "csv_inconsistent", severity: "inconsistent",
        message: `Discontinued, but still asked for (${ids.join(", ")})`, short: "Discontinued, still asked for", emails: ids });
    }
  }
  return issues;
}

/** "Kunis Breccia, Large, EU" -> "Kunis Breccia"; "Ø60, Black, EU/AU/UK" -> "Ø60, Black". */
function colourKey(p: Product): string {
  return p.variant.split(/,\s*/)
    .filter((x) => !x.split("/").every((m) => MARKETS.has(m.trim())) && !/^(Large|Small)$/.test(x.trim()))
    .join(", ");
}

function market(p: Product): string {
  return p.variant.split(/,\s*/).find((x) => x.split("/").every((m) => MARKETS.has(m.trim()))) ?? p.sku;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}
