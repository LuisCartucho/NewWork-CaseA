import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "./redact.js";
import { loadData } from "../data/loadData.js";

test("M027: every piece of personal data is removed", () => {
  const { emails } = loadData();
  const m027 = emails.find((e) => e.id === "M027")!;
  const r = redact(m027.body);
  for (const leak of ["Anna", "Lindqvist", "Storgatan", "211 34", "Malmö", "123 45 67", "850612"]) {
    assert.ok(!r.redactedBody.includes(leak), `leaked: ${leak}\n${r.redactedBody}`);
  }
  assert.equal(r.containsPersonalData, true);
  assert.deepEqual(new Set(r.redactedFields),
    new Set(["personal ID number", "phone number", "street address", "postcode and city", "private person's name"]));
  // The product question must survive redaction.
  assert.ok(r.redactedBody.includes("Atlas Dining Table 200x95 in fumed oak"));
  assert.ok(r.redactedBody.includes("lead time"));
});

test("no false positives on the other 29 emails (product text untouched)", () => {
  const { emails } = loadData();
  for (const e of emails.filter((e) => e.id !== "M027")) {
    const r = redact(e.body);
    assert.equal(r.containsPersonalData, false, `${e.id} flagged: ${r.redactedFields}`);
    assert.equal(r.redactedBody, e.body);
  }
});

test("other common formats", () => {
  const cases: [string, string][] = [
    ["Danish CPR 120385-1234 please", "personal ID number"],
    ["call me on tel: 30 12 34 56", "phone number"],
    ["mail jens.hansen@gmail.com", "email address"],
    ["Attn: Jens Hansen, Nørrebrogade 12, 2200 København", "private person's name"],
  ];
  for (const [text, field] of cases) assert.ok(redact(text).redactedFields.includes(field), `${text} -> ${redact(text).redactedBody}`);
  const dk = redact("Attn: Jens Hansen, Nørrebrogade 12, 2200 København").redactedBody;
  assert.equal(dk, "Attn: [NAME], [ADDRESS], [POSTCODE CITY]");
});

test("product language is not redacted", () => {
  for (const text of [
    "Knot Rug 300x400 in warm grey, 6-8 weeks",
    "Tense Pendant Lamp Ø55 (US version), item 21240US",
    "Delivery to customer: one Atlas Stool in espresso",
    "Our price list from 2026 spring, EN 15372:2023",
  ]) {
    assert.equal(redact(text).containsPersonalData, false, `${text} -> ${redact(text).redactedBody}`);
  }
});
