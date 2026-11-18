// Checks what actually reaches the AI. fetch is mocked: nothing leaves the machine.
process.env.LLM_DISABLED = "0";
process.env.GEMINI_API_KEY = "test-key"; // set before config loads; dotenv never overrides it

import { test, mock } from "node:test";
import assert from "node:assert/strict";

test("the subject is redacted before it reaches the AI, and in the result", async () => {
  const sent: string[] = [];
  mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const { messages } = JSON.parse(init.body) as { messages: { content: string }[] };
    sent.push(...messages.map((m) => m.content));
    const isExtract = messages[0].content.includes("Reply with JSON only");
    const content = isExtract
      ? JSON.stringify({ intents: ["order"], family: "Atlas", productName: "Atlas Dining Table", variantHints: [], factsAsked: [] })
      : "Thank you for your order.";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });

  const { runPipeline } = await import("./index.js");
  const { loadData } = await import("../data/loadData.js");
  const r = await runPipeline({
    id: "T001", date: "2026-11-18", from_retailer: "Test Retailer",
    subject: "Order for Anna Lindqvist, +46 70 123 45 67",
    body: "Hello, we would like to order one Atlas Dining Table.",
  }, loadData());

  const extractCall = sent.find((c) => c.startsWith("Subject:"));
  assert.ok(extractCall?.startsWith("Subject: Order for [NAME], [PHONE]\n"), extractCall);
  for (const leak of ["Anna", "Lindqvist", "123 45 67"]) {
    assert.ok(!sent.some((c) => c.includes(leak)), `leaked to the AI: ${leak}`);
    assert.ok(!JSON.stringify(r).includes(leak), `leaked in the result: ${leak}`);
  }
  assert.equal(r.email.subject, "Order for [NAME], [PHONE]");
  assert.equal(r.redaction.containsPersonalData, true);
  assert.deepEqual(new Set(r.redaction.redactedFields), new Set(["private person's name", "phone number"]));
  mock.restoreAll();
});
