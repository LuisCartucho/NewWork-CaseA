// Part of step 4 (plain code): compare products.csv with the hand-checked fact sheet facts,
// SKU by SKU. Used per email (lookup.ts) and for the whole catalogue (Data issues page).
import type { FactSheet, FactSheetFact, Product } from "../types.js";

export type ConflictKind =
  | "mismatch" //       both sources have a value and they differ
  | "net_ge_packed" //  CSV net weight >= fact sheet weight incl. packaging (packed weight in the net field)
  | "csv_blank" //      fact sheet has a value, CSV is empty (not a risk: lookup uses the fact sheet)
  | "not_on_sheet"; //  the variant's colour is not on the product's fact sheet

export interface DataConflict {
  sku: string;
  product: string;
  field: string;
  kind: ConflictKind;
  message: string;
}

/** CSV column -> fact sheet field it is checked against. Lamps: CSV width/depth hold the diameter. */
const NUMERIC_CHECKS: { column: keyof Product; field: string; label: string; unit: string }[] = [
  { column: "width_cm", field: "width_cm", label: "width", unit: "cm" },
  { column: "depth_cm", field: "depth_cm", label: "depth", unit: "cm" },
  { column: "height_cm", field: "height_cm", label: "height", unit: "cm" },
  { column: "weight_kg", field: "weight_kg", label: "weight", unit: "kg" },
];

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

export function conflictsForSku(p: Product, sheet: FactSheet | undefined): DataConflict[] {
  if (!sheet) return [];
  const out: DataConflict[] = [];
  const add = (field: string, kind: ConflictKind, message: string) =>
    out.push({ sku: p.sku, product: p.name, field, kind, message });
  const src = (f: FactSheetFact) => `fact sheet p.${f.page}`;

  for (const check of NUMERIC_CHECKS) {
    const csv = String(p[check.column] ?? "").trim();
    const fact = factFor(sheet, check.field, p.sku)
      ?? (check.field === "width_cm" || check.field === "depth_cm" ? factFor(sheet, "diameter_cm", p.sku) : undefined);
    if (!fact) continue;
    if (!csv) {
      add(check.field, "csv_blank", `${p.name} ${p.sku}: ${check.label} is empty in products.csv; the ${src(fact)} says ${leadingNumber(fact.value) ?? fact.value} ${check.unit}.`);
    } else if (!sameNumber(csv, fact.value)) {
      add(check.field, "mismatch", `${p.name} ${p.sku}: ${check.label} is ${csv} ${check.unit} in products.csv but ${leadingNumber(fact.value) ?? fact.value} ${check.unit} in the ${src(fact)}.`);
    }
  }

  const packed = factFor(sheet, "weight_incl_packaging_kg", p.sku);
  const net = Number(p.weight_kg);
  const packedKg = packed ? Number(leadingNumber(packed.value)) : NaN;
  // May: the packed weight is for a 2-pack, so net < packed doesn't hold per chair; skip "(two …)" notes.
  if (packed && p.weight_kg && !/two/.test(packed.value) && net >= packedKg) {
    add("weight_kg", "net_ge_packed", `${p.name} ${p.sku}: weight in products.csv (${p.weight_kg} kg) is not less than the weight incl. packaging on the ${src(packed)} (${packedKg} kg). It is probably the packed weight in the net weight field.`);
  }

  const colours = factFor(sheet, "colours_listed", p.sku);
  if (colours) {
    const listed = colours.value.split("(")[0].toLowerCase();
    const colour = p.variant.split(",")[0].trim();
    if (colour && !listed.includes(colour.toLowerCase()) && !listed.includes(p.sku)) {
      add("colour", "not_on_sheet", `${p.name} ${p.sku}: ${colour} is not on the ${src(colours)} (it lists ${colours.value.split("(")[0].trim()}).`);
    }
  }
  return out;
}

/** Every conflict in the catalogue, for the Data issues page. */
export function findDataIssues(products: Product[], factSheets: FactSheet[]): DataConflict[] {
  const sheets = new Map(factSheets.map((s) => [s.name, s]));
  return products.flatMap((p) => conflictsForSku(p, sheets.get(p.name)));
}
