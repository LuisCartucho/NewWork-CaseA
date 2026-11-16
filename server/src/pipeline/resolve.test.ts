import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "./resolve.js";
import { redact } from "./redact.js";
import { loadData } from "../data/loadData.js";
import type { Extraction } from "../types.js";

const { emails, products } = loadData();

function run(id: string, extraction: Extraction | null = null) {
  const e = emails.find((x) => x.id === id)!;
  return resolve({ extraction, subject: e.subject, redactedBody: redact(e.body).redactedBody, products });
}
const skus = (id: string) => run(id).chosen.map((p) => p.sku).sort();

// Expected rows for every email WITHOUT the LLM (subject + redacted body only).
// One SKU = exact match. Several = the retailer didn't say enough; never narrowed by guessing.
const EXPECTED: Record<string, string[]> = {
  M001: ["42220"], // COM
  M002: ["21210", "21210US"], // Ø90, market not given
  M003: ["42721"], // 250x95 fumed oak
  M004: ["45111"], // stainless steel
  M005: ["40101-C"], // category C fabric
  M006: ["42710"], // 200x95 natural oak
  M007: ["42220", "42220-A", "42220-B", "42220-C", "42220-D", "42220-E", "42220-F", "42220NEBA024"],
  M008: ["42432"], // walnut
  M009: ["22111", "22111US"], // Ø60 nickel plated, market not given
  M010: ["20415"], // Kunis Breccia, EU (and NOT the AU/UK/US rows with the packed weight)
  M011: ["44821"], // Coupe Bar Stool, black, 65
  M012: ["20310", "20310AU", "20310UK", "20310US"], // smoked oak, market not given
  M013: products.filter((p) => p.name.startsWith("Atlas")).map((p) => p.sku), // Atlas family
  M014: products.filter((p) => p.name.startsWith("Kizu")).map((p) => p.sku), // Kizu family
  M015: ["42220", "42220-A", "42220-B", "42220-C", "42220-D", "42220-E", "42220-F", "42220NEBA024"],
  M016: ["12121"], // 300x400 warm grey
  M017: ["43250", "43251"], // "other colours than dark green and light grey": keep both
  M018: ["21520", "21520US", "21530", "21530US"], // finish is the same on all; size not given
  M019: ["42732", "42733", "42734", "42735", "42736", "42737"], // lacquered = 6 MDF rows
  M020: ["42721"],
  M021: ["21240US"], // Ø55 US version
  M022: ["10303", "11610"], // Pleat Pitcher + Pi-No-Pi-No complete set grey/fuchsia
  M023: ["40101-A", "40101-B", "40101-C", "40101-D", "40101-E", "40101-F"],
  M024: ["21210", "21210US", "21220", "21220US", "21230", "21230US", "21240", "21240US"], // Tense family
  M025: ["42610", "42620"], // travertine, size not given
  M026: ["42611"], // 82x82 Costa Black
  M027: ["42711"], // 200x95 fumed oak (after redaction)
  M028: ["22250"],
  M029: ["40101-A", "40101-B", "40101-C", "40101-D", "40101-E", "40101-F"],
  M030: ["42710", "42711", "42720", "42721"],
};

test("all 30 emails resolve to the expected rows without the LLM", () => {
  assert.equal(Object.keys(EXPECTED).length, emails.length);
  for (const [id, expected] of Object.entries(EXPECTED)) {
    assert.deepEqual(skus(id), [...expected].sort(), id);
  }
});

test("ambiguous is true exactly when some product has more than one row left", () => {
  assert.equal(run("M003").ambiguous, false);
  assert.equal(run("M019").ambiguous, true);
  assert.equal(run("M022").ambiguous, false); // two products, each exact
  assert.equal(run("M022").matches.length, 2);
});

test("family-only emails are reported as families", () => {
  assert.deepEqual(run("M013").families, ["Atlas"]);
  assert.deepEqual(run("M024").families, ["Tense"]);
  assert.deepEqual(run("M003").families, []);
});

test("no product mentioned -> nothing chosen", () => {
  const r = resolve({ extraction: null, subject: "Question", redactedBody: "May I ask about your opening hours?", products });
  assert.deepEqual(r.matches, []);
  assert.deepEqual(r.chosen, []);
});

test("LLM hints narrow further, and hints that fit no row are reported", () => {
  const extraction: Extraction = {
    intents: ["material_finish"], family: "Tembo", productName: "Tembo Lounge Chair",
    variantHints: ["leather", "category B"], factsAsked: [],
  };
  const r = run("M029", extraction);
  assert.deepEqual(r.chosen.map((p) => p.sku), ["40101-B"]);
  assert.deepEqual(r.unmatchedHints, ["leather"]);
});

test("Kizu without a size matches both sizes", () => {
  const r = resolve({ extraction: null, subject: "", redactedBody: "Is the Kizu Table Lamp dimmable?", products });
  assert.deepEqual(r.matches.map((m) => m.name).sort(), ["Kizu Table Lamp Large", "Kizu Table Lamp Small"]);
  assert.equal(r.ambiguous, true);
});

test("traps: the product name is not a variant hint, and unstated shape stays ambiguous", () => {
  const r1 = resolve({ extraction: null, subject: "", redactedBody: "Weight of the Kizu Table Lamp Large in White Marble, UK?", products });
  assert.deepEqual(r1.chosen.map((p) => p.sku), ["20410UK"]); // "Large" from the name must not pick the Kunis row
  const r2 = resolve({ extraction: null, subject: "", redactedBody: "Do you have the Atlas Stool in espresso?", products });
  assert.deepEqual(r2.chosen.map((p) => p.sku).sort(), ["42732", "42735"]); // square or round: not said
  const r3 = resolve({ extraction: null, subject: "", redactedBody: "Price for the Coupe Stool in black?", products });
  assert.deepEqual(r3.chosen.map((p) => p.sku), ["44831"]); // not the bar stools
});
