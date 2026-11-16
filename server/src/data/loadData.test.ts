import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadData } from "./loadData.js";
import { config } from "../config.js";

const { products, emails, factSheets } = loadData();

test("CSV parsing: 30 emails with multi-line bodies, 152 product rows", () => {
  assert.equal(emails.length, 30);
  assert.equal(products.length, 152);
  assert.ok(emails.every((e) => e.id && e.body.includes("\n")));
});

test("fact sheet facts: one entry per PDF, names and SKUs exist in products.csv", () => {
  const pdfs = fs.readdirSync(path.join(config.paths.data, "fact_sheets"));
  assert.equal(factSheets.length, pdfs.length);
  const names = new Set(products.map((p) => p.name));
  const skus = new Set(products.map((p) => p.sku));
  for (const fs_ of factSheets) {
    assert.ok(pdfs.includes(fs_.file), `missing PDF: ${fs_.file}`);
    assert.ok(names.has(fs_.name), `unknown product name: ${fs_.name}`);
    for (const f of fs_.facts) {
      for (const sku of f.appliesTo ?? []) {
        assert.ok(skus.has(sku), `${fs_.name}/${f.field}: unknown SKU ${sku}`);
        assert.equal(products.find((p) => p.sku === sku)!.name, fs_.name, `${sku} is not a ${fs_.name}`);
      }
    }
  }
});
