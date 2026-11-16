// Step 4 (plain code, no AI): pull each requested fact from products.csv AND the
// hand-checked fact sheet facts, compare the two, and attach a source to every value.
// Why not AI: this is a table lookup; an LLM could only add risk (invented numbers).
//
// Rules:
// - Every value carries its source (CSV SKU and/or fact sheet + page).
// - If the CSV and the fact sheet disagree, the value is NOT returned as a fact: it goes to
//   `conflicts` (for Sales Support) and `missing` (so the draft says "I'll check").
// - If the remaining rows differ (e.g. 200x95 vs 250x95), one fact per value, labelled by variant.
// - Prices are never looked up. A price question lands in `missing` and rules.ts makes it red.
import type { Extraction, Fact, FactSheet, Product, ProductMatch, Resolution } from "../types.js";
import { fieldsAsked, type Field } from "./asked.js";
import { conflictsForSku, factFor, leadingNumber, sameNumber } from "./conflicts.js";

export interface LookupResult {
  asked: Field[]; // what the retailer asked for (keywords + LLM)
  facts: Fact[];
  conflicts: string[]; // CSV vs fact sheet disagreements relevant to this email
  missing: string[]; // asked for but not answerable from the data, e.g. "Atlas Dining Table: lead time"
}

/** When nothing specific was recognised but a product was: give the basics. */
const DEFAULT_FIELDS: Field[] = ["dimensions", "weight", "material"];

type RowValue = { value: string; source: string } | null;

export function lookup(input: {
  extraction: Extraction | null;
  resolution: Resolution;
  factSheets: FactSheet[];
  text: string; // subject + redacted body
}): LookupResult {
  const { resolution, factSheets } = input;
  const asked = fieldsAsked(input.text, input.extraction);
  const out: LookupResult = { asked, facts: [], conflicts: [], missing: [] };
  const fields = asked.length ? asked : resolution.matches.length ? DEFAULT_FIELDS : [];

  for (const m of resolution.matches) {
    const sheet = factSheets.find((s) => s.name === m.name);
    const allRows = resolution.candidates.filter((p) => p.name === m.name);
    const ctx: Ctx = { m, sheet, out, file: sheet?.file ?? "", allRows };

    // Conflicts that affect what we'd tell the retailer (csv_blank is harmless: we use the sheet).
    // Only conflicts for fields this email asks about: a price-list email shouldn't list weight problems.
    const rowConflicts = m.variants.flatMap((p) => conflictsForSku(p, sheet))
      .filter((c) => c.kind !== "csv_blank" && relevant(c.field, fields));
    out.conflicts.push(...rowConflicts.map((c) => c.message));
    const conflicted = (sku: string, field: string) => rowConflicts.some((c) => c.sku === sku && c.field === field);

    for (const field of fields) {
      switch (field) {
        case "dimensions": {
          const hasDiameter = m.variants.some((p) => factFor(sheet, "diameter_cm", p.sku));
          if (hasDiameter) {
            numeric(ctx, "Diameter", "diameter_cm", "width_cm", "cm", conflicted);
          } else {
            numeric(ctx, "Width", "width_cm", "width_cm", "cm", conflicted);
            numeric(ctx, "Depth", "depth_cm", "depth_cm", "cm", conflicted);
          }
          numeric(ctx, "Height", "height_cm", "height_cm", "cm", conflicted);
          sheetOnly(ctx, "Cord length", "cord_length_cm", { optional: true });
          sheetOnly(ctx, "Canopy diameter", "canopy_diameter_cm", { optional: true });
          break;
        }
        case "seat_height": sheetOnly(ctx, "Seat height", "seat_height_cm"); break;
        case "weight":
          numeric(ctx, "Net weight", "weight_kg", "weight_kg", "kg", conflicted);
          sheetOnly(ctx, "Weight incl. packaging", "weight_incl_packaging_kg");
          sheetOnly(ctx, "Packaging dimensions", "packaging_dimensions_cm", { optional: true });
          break;
        case "lead_time": leadTime(ctx); break;
        case "material":
          sheetOrCsv(ctx, "Material", "material", (p) => p.material);
          sheetOnly(ctx, "Finish", "finish", { optional: true });
          break;
        case "colours": colours(ctx); break;
        case "dimmable": sheetOnly(ctx, "Dimmable", "dimmable"); break;
        case "certificates": sheetOnly(ctx, "Certificates", "certificates"); break;
        case "com_fabric": sheetOnly(ctx, "COM fabric requirement", "com_fabric_requirement"); break;
        case "fabric_category": fabricCategory(ctx, input.text); break;
        case "leather": sheetOnly(ctx, "Leather upholstery", "leather"); break;
        case "outdoor":
          sheetOnly(ctx, "Use", "use");
          sheetOnly(ctx, "Outdoor care", "outdoor_care", { optional: true });
          break;
        case "care":
          sheetOnly(ctx, "Care", "care");
          sheetOnly(ctx, "Finish", "finish", { optional: true });
          break;
        // No fact sheet has a sealing field: this always becomes an explicit "not in our data"
        // item, so the draft says "I'll check" instead of the AI guessing from "Unfilled".
        case "sealing": sheetOnly(ctx, "Sealing", "sealing"); break;
        case "availability": collect(ctx, "Status", (p) => ({ value: p.status, source: `products.csv SKU ${p.sku}` })); break;
        case "price": out.missing.push(`${m.name}: price (never quoted by this tool)`); break;
      }
    }
  }
  if (!resolution.matches.length && asked.length) out.missing.push("Product: no product from our range was recognised");
  out.facts = dedupe(out.facts);
  out.missing = [...new Set(out.missing)];
  out.conflicts = [...new Set(out.conflicts)];
  return out;
}

/** Which asked fields a conflict on a CSV/fact sheet field matters for. */
function relevant(conflictField: string, fields: Field[]): boolean {
  if (/^(width|depth|height)_cm$/.test(conflictField)) return fields.includes("dimensions");
  if (conflictField === "weight_kg") return fields.includes("weight");
  // Variant missing from its fact sheet: matters whenever we answer from that fact sheet.
  return fields.some((f) => !["price", "availability", "lead_time"].includes(f));
}

interface Ctx { m: ProductMatch; sheet: FactSheet | undefined; out: LookupResult; file: string; allRows: Product[] }

/**
 * Core helper: compute a value per row, group rows that share a value, emit one Fact per group.
 * Rows with no value become one `missing` entry. Label gets a variant suffix when values differ.
 */
function collect(ctx: Ctx, label: string, perRow: (p: Product) => RowValue, opts: { optional?: boolean } = {}) {
  const groups = new Map<string, { value: string; sources: Set<string>; rows: Product[] }>();
  const without: Product[] = [];
  for (const p of ctx.m.variants) {
    const v = perRow(p);
    if (!v) { without.push(p); continue; }
    const g = groups.get(v.value) ?? { value: v.value, sources: new Set(), rows: [] };
    g.sources.add(v.source);
    g.rows.push(p);
    groups.set(v.value, g);
  }
  const split = groups.size > 1 || (groups.size === 1 && without.length > 0);
  for (const g of groups.values()) {
    ctx.out.facts.push({
      label: `${ctx.m.name}: ${label}${split ? ` (${variantSummary(g.rows)})` : ""}`,
      value: g.value,
      source: mergeSources([...g.sources]),
      skus: g.rows.map((p) => p.sku),
    });
  }
  if (without.length && !opts.optional) {
    ctx.out.missing.push(`${ctx.m.name}: ${label.toLowerCase()}${split ? ` (${variantSummary(without)})` : ""}`);
  }
}

/** CSV column + fact sheet field, cross-checked. Conflicting rows are left out (see header). */
function numeric(ctx: Ctx, label: string, sheetField: string, column: keyof Product, unit: string,
  conflicted: (sku: string, field: string) => boolean) {
  collect(ctx, label, (p) => {
    const conflictField = column === "width_cm" && sheetField === "diameter_cm" ? "width_cm" : sheetField;
    if (conflicted(p.sku, conflictField)) return null;
    const csv = String(p[column] ?? "").trim();
    const fact = factFor(ctx.sheet, sheetField, p.sku);
    const csvSrc = `products.csv SKU ${p.sku}`;
    if (fact && csv && sameNumber(csv, fact.value)) return { value: withUnit(fact.value, unit), source: `${csvSrc}; ${ctx.file} p.${fact.page}` };
    if (fact) return { value: withUnit(fact.value, unit), source: `${ctx.file} p.${fact.page}` };
    if (csv) return { value: withUnit(csv, unit), source: csvSrc };
    return null;
  });
}

function sheetOnly(ctx: Ctx, label: string, field: string, opts: { optional?: boolean } = {}) {
  const unit = field.endsWith("_cm") ? "cm" : field.endsWith("_kg") ? "kg" : "";
  collect(ctx, label, (p) => {
    const f = factFor(ctx.sheet, field, p.sku);
    return f ? { value: withUnit(f.value, unit), source: `${ctx.file} p.${f.page}` } : null;
  }, opts);
}

/** Fact sheet wording when there is one (richer), else the CSV column. */
function sheetOrCsv(ctx: Ctx, label: string, field: string, csv: (p: Product) => string) {
  collect(ctx, label, (p) => {
    const f = factFor(ctx.sheet, field, p.sku);
    if (f) return { value: f.value, source: `${ctx.file} p.${f.page}` };
    return csv(p) ? { value: csv(p), source: `products.csv SKU ${p.sku}` } : null;
  });
}

function leadTime(ctx: Ctx) {
  collect(ctx, "Lead time", (p) => {
    const f = factFor(ctx.sheet, "lead_time", p.sku);
    const csv = p.lead_time_weeks.trim();
    const csvSrc = `products.csv SKU ${p.sku}`;
    if (f && csv && f.value.includes(csv)) return { value: f.value, source: `${csvSrc}; ${ctx.file} p.${f.page}` };
    if (f) return { value: f.value, source: `${ctx.file} p.${f.page}` };
    if (csv) return { value: `${csv} weeks`, source: csvSrc };
    return null;
  });
}

/** Colours/finishes that exist today: CSV variants plus the fact sheet's own list. */
function colours(ctx: Ctx) {
  // All rows of the product, not just the narrowed ones: "other colours than X" is about the product.
  const rows = ctx.allRows;
  ctx.out.facts.push({
    label: `${ctx.m.name}: Variants in products.csv`,
    value: [...new Set(rows.map((p) => p.variant))].join("; ") || "(none)",
    source: `products.csv SKU ${rows.map((p) => p.sku).join(", ")}`,
    skus: rows.map((p) => p.sku),
  });
  sheetOnly(ctx, "Colours on fact sheet", "colours_listed", { optional: true });
}

/** "Which category is Kvadrat Hallingdal?": search THIS product's category lists (they differ per product). */
function fabricCategory(ctx: Ctx, text: string) {
  const t = text.toLowerCase();
  const hits = (ctx.sheet?.facts ?? [])
    .filter((f) => f.field.startsWith("fabric_category_"))
    .flatMap((f) => fabricNames(f.value)
      .filter((name) => t.includes(name.toLowerCase()) || t.includes(name.replace(/\s+\d+$/, "").toLowerCase()))
      .map((name) => ({ name, cat: f.field.slice(-1), page: f.page })));
  if (!hits.length) { ctx.out.missing.push(`${ctx.m.name}: fabric price category`); return; }
  for (const h of hits) {
    ctx.out.facts.push({
      label: `${ctx.m.name}: Price category of ${h.name}`,
      value: `Category ${h.cat}`,
      source: `${ctx.file} p.${h.page}`,
      skus: ctx.m.variants.map((p) => p.sku),
    });
  }
}

const FABRIC_BRANDS = /^(Kvadrat|JAB|Nevotex|Romo|Alessandro Bini|Osborne & Little|Dedar|Sahco|Élitis|Manuel Canovas|Astrid|Febrik|Zinc|Kirkby Design)\s+/;

/** "Kvadrat Molly 2, Hallingdal 65; Alessandro Bini Talla" -> ["Molly 2", "Hallingdal 65", "Talla"]. */
function fabricNames(value: string): string[] {
  return value.split(";").flatMap((group) => group.trim().replace(FABRIC_BRANDS, "").split(",")).map((s) => s.trim()).filter(Boolean);
}

/** "26.5" -> "26.5 cm"; "30 (one package holds two chairs)" -> "30 kg (one package holds two chairs)". */
function withUnit(value: string, unit: string): string {
  if (!unit) return value;
  const n = leadingNumber(value);
  if (!n) return /\d/.test(value) ? `${value} ${unit}` : value; // "H 35 x W 30 x D 30" -> "… cm"
  const rest = value.trim().slice(value.trim().match(/^[\d.,\s-]+/)![0].trimEnd().length);
  return `${n} ${unit}${rest}`;
}

/** Variant pieces shared by every row in the group: ["200x95, Natural Oak", "200x95, Fumed Oak"] -> "200x95". */
function variantSummary(rows: Product[]): string {
  const pieces = rows.map((p) => p.variant.split(/,\s*/).map((x) => x.trim()));
  const shared = pieces[0].filter((x) => x && pieces.every((ps) => ps.includes(x)));
  return shared.length ? shared.join(", ") : rows.map((p) => p.sku).join(", ");
}

/** "products.csv SKU 42710" + "products.csv SKU 42711" -> "products.csv SKU 42710, 42711". */
function mergeSources(sources: string[]): string {
  const skus: string[] = [];
  const rest = new Set<string>();
  for (const s of sources) {
    for (const part of s.split("; ")) {
      const m = part.match(/^products\.csv SKU (.+)$/);
      if (m) skus.push(m[1]); else rest.add(part);
    }
  }
  return [skus.length ? `products.csv SKU ${skus.join(", ")}` : "", ...rest].filter(Boolean).join("; ");
}

function dedupe(facts: Fact[]): Fact[] {
  const seen = new Set<string>();
  return facts.filter((f) => !seen.has(f.label + f.value) && seen.add(f.label + f.value));
}
