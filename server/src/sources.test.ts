import { test } from "node:test";
import assert from "node:assert/strict";
import { createSourceLookup } from "./sources.js";
import { loadData } from "./data/loadData.js";

const snippet = createSourceLookup(loadData().factSheets);

test("source snippet: the fact sheet lines a fact was read from", () => {
  const h = snippet("Atlas Coffee Table - Fact Sheet.pdf", 2, "Atlas Coffee Table: Height (82x82, Costa Black)")!;
  assert.ok(h.lines.some((l) => l.includes("265 mm")), h.lines.join("\n"));
  const com = snippet("Product Fact Sheet_Covent_Club_Chair.pdf", 2, "Covent Club Chair: COM fabric requirement")!;
  assert.ok(com.lines.some((l) => l.includes("0,6 meter")), com.lines.join("\n"));
  const cat = snippet("Tembo Lounge Chair New Works Fact Sheet.pdf", 3, "Tembo Lounge Chair: Price category of Hallingdal 65")!;
  assert.ok(cat.lines.some((l) => /Hallingdal/.test(l)), cat.lines.join("\n"));
});

test("source snippet: only known fact sheets, never a path", () => {
  assert.equal(snippet("../../.env", 1, "Height"), null);
  assert.equal(snippet("..\..\.env", 1, "Height"), null);
  assert.equal(snippet("Atlas Coffee Table - Fact Sheet.pdf", 0, "Height"), null);
});
