// Offline and deterministic: never call an LLM from tests.
process.env.LLM_DISABLED = "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData } from "./data/loadData.js";
import { findDataIssues } from "./pipeline/conflicts.js";
import { runPipeline } from "./pipeline/index.js";
import { markDuplicates } from "./pipeline/duplicates.js";
import { buildReport } from "./dataIssuesReport.js";

const data = loadData();
const results = await Promise.all(data.emails.map((e) => runPipeline(e, data)));
markDuplicates(results);
const report = buildReport(findDataIssues(data.products, data.factSheets, data.emails), data.products, results);
const group = (product: string, kind: string) => report.groups.find((g) => g.product === product && g.kind === kind)!;

test("one row per product + issue, not per SKU", () => {
  const kj = group("Karl-Johan Table Lamp", "weight_wrong");
  assert.equal(kj.skus.length, 8); // oak 10.2 kg and marble 11.55 kg: one fix
  assert.equal(kj.title, "Karl-Johan Table Lamp: all 8 variants");
  assert.equal(group("Kizu Table Lamp Large", "packed_as_net").title, "Kizu Table Lamp Large, Kunis Breccia: AU, UK, US (3 variants)");
  assert.ok(report.totals.groups < report.totals.issues);
});

test("impact: issues link to the emails whose answer they change, most impact first", () => {
  assert.deepEqual(group("Karl-Johan Table Lamp", "weight_wrong").affects, ["M012"]);
  assert.deepEqual(group("Kizu Table Lamp Large", "not_on_sheet").affects, ["M010"]);
  assert.deepEqual(group("Covent Club Chair", "implausible").affects, ["M001"]);
  assert.deepEqual(group("Brolly Pendant Lamp", "csv_inconsistent").affects, []); // spelling changes no answer
  const firstWithout = report.groups.findIndex((g) => !g.affects.length);
  assert.ok(report.groups.slice(firstWithout).every((g) => !g.affects.length), "issues with impact come first");
});

test("summary: which yellow emails turn green when issues are fixed", () => {
  assert.equal(report.top.count, 4);
  assert.deepEqual(report.top.fixesEmails, ["M012"]); // M010 needs a 5th fix (Kunis Breccia on the fact sheet)
  assert.deepEqual(report.allAffecting.fixesEmails.sort(), ["M010", "M012"]);
  assert.ok(report.yellowNotFromData > 0); // e.g. lead times: not a data error, just not in the data
});
