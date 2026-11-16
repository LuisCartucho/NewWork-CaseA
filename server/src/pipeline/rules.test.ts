// Offline and deterministic: never call an LLM from tests.
process.env.LLM_DISABLED = "1";

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

const run = async (id: string) => runPipeline(data.emails.find((e) => e.id === id)!, data);

test("reasons are specific: product and fact named, short version fits the inbox", async () => {
  for (const e of data.emails) {
    const r = await runPipeline(e, data);
    for (const f of r.flags) {
      assert.ok(f.short && f.short.length <= 90, `${e.id}: short reason missing or too long: ${f.short}`);
      assert.ok(!/^Asks about prices or a price list/.test(f.reason), `${e.id}: generic price reason`);
    }
  }
  const m001 = await run("M001");
  assert.match(m001.flags[0].reason, /price for 4 × Covent Club Chair \(COM\)/);
  assert.equal(m001.quantity, 4);
  assert.ok(m001.flags.some((f) => /0\.6 metre.*looks too low/.test(f.reason))); // COM fabric not trusted
  assert.ok(m001.flags.some((f) => /4 made-to-order units/.test(f.reason))); // quantity can change the lead time
  const m026 = await run("M026");
  assert.equal(m026.status, "yellow");
  assert.match(m026.flags[0].reason, /email says 27 cm, but our data says 26\.5 cm.*products\.csv.*Fact Sheet/i);
  const m012 = await run("M012");
  assert.ok(m012.flags.some((f) => /Net weight 10\.2 kg, but only 1\.9 kg packed/.test(f.short!)));
  const m005 = await run("M005");
  assert.match(m005.flags[0].reason, /from 2 Nov that's 14 Dec–28 Dec/);
});

test("M027: the stored result never contains the unredacted body", async () => {
  const r = await runPipeline(data.emails.find((e) => e.id === "M027")!, data);
  assert.ok(!JSON.stringify(r).includes("Lindqvist"));
});

test("duplicates: identical (same retailer) vs same question (other retailer)", async () => {
  const { markDuplicates } = await import("./duplicates.js");
  const rs = await Promise.all(["M003", "M007", "M015", "M020"].map(run));
  markDuplicates(rs);
  const [m003, m007, m015, m020] = rs;
  assert.deepEqual(m007.identicalTo, ["M015"]);
  assert.deepEqual(m015.identicalTo, ["M007"]);
  assert.equal(m015.duplicateOf, "M007");
  assert.equal(m007.duplicateOf, undefined);
  assert.deepEqual(m003.sameQuestionAs, ["M020"]);
  assert.deepEqual(m020.sameQuestionAs, ["M003"]);
  assert.equal(m020.status, "green"); // same question from another retailer still needs its own reply
});
