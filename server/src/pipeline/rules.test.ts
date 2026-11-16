import { test } from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "./index.js";
import { loadData } from "../data/loadData.js";
import type { Status } from "../types.js";

const data = loadData();

// Expected status for every email in facts-only mode (no LLM), with the reason in one line.
const EXPECTED: Record<string, Status> = {
  M001: "red", //    COM price
  M002: "green", //  Tense Ø90 dimensions
  M003: "green", //  Atlas Dining 250x95 dimensions
  M004: "green", //  Rand dimensions
  M005: "yellow", // lead time + "before Christmas"
  M006: "yellow", // Atlas lead time not in data + Christmas
  M007: "yellow", // Covent: lead time differs by variant + Christmas
  M008: "green", //  Tana dimensions
  M009: "green", //  Kantarell dimensions
  M010: "yellow", // Kunis Breccia not on the fact sheet
  M011: "yellow", // Coupe seat height not in data
  M012: "yellow", // Karl-Johan net weight conflict
  M013: "red", //    price list
  M014: "red", //    price list
  M015: "yellow", // (duplicate is marked by batch.ts, not the pipeline)
  M016: "yellow", // Knot lead time not in data + Christmas
  M017: "yellow", // other colours
  M018: "yellow", // other finishes
  M019: "red", //    certificates
  M020: "green", //  same as M003, different retailer: not a duplicate
  M021: "red", //    certificates
  M022: "red", //    discontinued + order
  M023: "green", //  Tembo dimensions + seat height (fact sheet)
  M024: "red", //    price list
  M025: "yellow", // travertine size not given, answer differs
  M026: "yellow", // retailer quotes 27 cm, not in our data
  M027: "red", //    personal data + order
  M028: "yellow", // Nebra dimmable not in data, other colours
  M029: "green", //  leather not possible + Hallingdal = category C, both from the Tembo sheet
  M030: "red", //    certificates
};

test("all 30 emails get the expected status (facts-only mode)", async () => {
  assert.equal(Object.keys(EXPECTED).length, data.emails.length);
  const wrong: string[] = [];
  for (const e of data.emails) {
    const r = await runPipeline(e, data);
    if (r.status !== EXPECTED[e.id]) wrong.push(`${e.id}: got ${r.status}, expected ${EXPECTED[e.id]} (${r.flags[0]?.reason})`);
  }
  assert.deepEqual(wrong, []);
});

test("every non-green result explains itself, most serious reason first", async () => {
  for (const e of data.emails) {
    const r = await runPipeline(e, data);
    assert.ok(r.flags.length > 0, e.id);
    assert.equal(r.flags[0].level, r.status, `${e.id}: first flag should match the status`);
  }
});

test("M027: the stored result never contains the unredacted body", async () => {
  const r = await runPipeline(data.emails.find((e) => e.id === "M027")!, data);
  assert.ok(!JSON.stringify(r).includes("Lindqvist"));
});
