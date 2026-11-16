// Offline and deterministic: never call an LLM from tests.
process.env.LLM_DISABLED = "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import { lookup } from "./lookup.js";
import { resolve } from "./resolve.js";
import { redact } from "./redact.js";
import { findDataIssues } from "./conflicts.js";
import { loadData } from "../data/loadData.js";

const data = loadData();

/** Lookup WITHOUT the LLM, exactly as the pipeline runs in facts-only mode. */
function run(id: string) {
  const e = data.emails.find((x) => x.id === id)!;
  const body = redact(e.body).redactedBody;
  const resolution = resolve({ extraction: null, subject: e.subject, redactedBody: body, products: data.products });
  return { resolution, ...lookup({ extraction: null, resolution, factSheets: data.factSheets, text: `${e.subject}\n${body}` }) };
}
const fact = (r: ReturnType<typeof run>, label: string) => r.facts.find((f) => f.label.endsWith(label));

test("M003: dimensions agree in both sources, and both are cited", () => {
  const r = run("M003");
  assert.deepEqual(r.asked, ["dimensions"]);
  assert.equal(fact(r, "Width")?.value, "250 cm");
  assert.equal(fact(r, "Depth")?.value, "95 cm");
  assert.equal(fact(r, "Height")?.value, "74 cm");
  assert.match(fact(r, "Width")!.source, /products\.csv SKU 42721; Atlas Dining Table .*p\.2/);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.conflicts, []);
});

test("keyword traps: 'stainless' is not a care question, 'Costa Black' is not a price question", () => {
  assert.deepEqual(run("M004").asked, ["dimensions"]);
  assert.ok(!run("M026").asked.includes("price"));
});

test("M012 (A1): Karl-Johan net weight is never stated; packed weight is, and the conflict is shown", () => {
  const r = run("M012");
  assert.equal(fact(r, "Net weight"), undefined);
  assert.ok(r.missing.some((m) => m.includes("net weight")));
  assert.equal(fact(r, "Weight incl. packaging")?.value, "1.9 kg");
  assert.ok(r.conflicts.some((c) => c.includes("10.2 kg")));
});

test("M010 (A3, B4): EU row gives 5.6 kg, not the 7.8 kg packed weight; Kunis Breccia not on the sheet", () => {
  const r = run("M010");
  assert.equal(fact(r, "Net weight")?.value, "5.6 kg");
  assert.ok(r.conflicts.some((c) => c.includes("Kunis Breccia is not on the fact sheet")));
});

test("facts that only exist in the fact sheet are found (section C)", () => {
  assert.equal(fact(run("M023"), "Seat height")?.value, "40 cm");
  assert.equal(fact(run("M018"), "Dimmable")?.value, "Yes (Triac phase dimming)");
  assert.match(fact(run("M001"), "COM fabric requirement")!.value, /^0\.6 metre/);
  assert.equal(fact(run("M029"), "Leather upholstery")?.value, "Upholstery with leather not possible");
});

test("M029 (D2): Hallingdal 65 category comes from the Tembo sheet", () => {
  const r = run("M029");
  const f = fact(r, "Price category of Hallingdal 65")!;
  assert.equal(f.value, "Category C");
  assert.match(f.source, /^Tembo Lounge Chair/);
});

test("gaps stay gaps: Nebra dimmable (D1), Coupe seat height (A6), Atlas lead time (E)", () => {
  assert.ok(run("M028").missing.includes("Nebra Floor Lamp: dimmable"));
  assert.ok(run("M011").missing.includes("Coupe Stool / Bar Stool: seat height"));
  assert.ok(run("M006").missing.includes("Atlas Dining Table: lead time"));
});

test("M007: Covent lead time differs by variant, one fact per value", () => {
  const r = run("M007");
  const lead = r.facts.filter((f) => f.label.includes("Lead time"));
  assert.equal(lead.length, 2);
  assert.ok(lead.some((f) => f.value === "Stock item" && f.skus.join() === "42220NEBA024"));
});

test("prices are never returned as facts, for any email", () => {
  for (const e of data.emails) {
    const r = run(e.id);
    const prices = new Set(r.resolution.candidates.map((p) => p.rrp_dkk));
    for (const f of r.facts) {
      for (const n of f.value.match(/\d+/g) ?? []) assert.ok(!prices.has(n), `${e.id}: ${f.label} = ${f.value}`);
    }
    if (r.asked.includes("price")) assert.ok(r.missing.some((m) => m.includes("price")), e.id);
  }
});

test("conflicts only for fields that were asked: price-list emails show none", () => {
  assert.deepEqual(run("M014").conflicts, []);
  assert.deepEqual(run("M022").conflicts, []);
});

test("data issues: known disagreements found, agreeing products clean", () => {
  const issues = findDataIssues(data.products, data.factSheets);
  const has = (sku: string, kind: string) => issues.some((i) => i.sku === sku && i.kind === kind);
  assert.ok(has("20310UK", "mismatch")); // height 23 vs 23.5 (A2)
  assert.ok(has("20310AU", "csv_blank")); // height empty (A2)
  assert.ok(has("20415AU", "net_ge_packed")); // Kizu Kunis 7.8 kg (A3)
  assert.ok(has("20425US", "net_ge_packed")); // (A4)
  assert.ok(has("20311", "net_ge_packed")); // Karl-Johan marble (A1)
  assert.ok(has("10310", "net_ge_packed")); // Pi-No-Pi-No (A13)
  assert.ok(!issues.some((i) => i.product.startsWith("Atlas"))); // A11: Atlas sources agree
  assert.ok(!issues.some((i) => i.product === "May Lounge Armchair")); // 2-pack packed weight is not a conflict
});
