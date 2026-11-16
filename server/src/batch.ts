// npm run batch: run all 30 emails, write results/results.json + results/results.md.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { loadData } from "./data/loadData.js";
import { runPipeline } from "./pipeline/index.js";
import { llmConfigured, resetCooldowns, sleep } from "./llm/llm.js";
import type { PipelineResult } from "./types.js";

const ICON = { green: "🟢", yellow: "🟡", red: "🔴" } as const;

// Free LLM tiers allow only a few requests/tokens per minute. The batch is a one-off job, so it
// paces itself and, if the AI was busy for an email, waits and retries that email.
const PACE_MS = Number(process.env.BATCH_PACE_MS ?? 4_000);
const RETRY_WAIT_MS = 30_000;
const MAX_RETRIES = 4;

const data = loadData();
const results: PipelineResult[] = [];
for (const email of data.emails) {
  let r = await runPipeline(email, data);
  for (let i = 0; i < MAX_RETRIES && llmConfigured() && !(r.aiUsed && r.extraction); i++) {
    console.log(`${email.id}: AI busy, waiting ${RETRY_WAIT_MS / 1000}s (retry ${i + 1}/${MAX_RETRIES})`);
    await sleep(RETRY_WAIT_MS);
    resetCooldowns();
    r = await runPipeline(email, data);
  }
  results.push(r);
  console.log(email.id, ICON[r.status], r.aiUsed ? `extract=${r.ai.extract} draft=${r.ai.draft}` : "facts only");
  if (llmConfigured()) await sleep(PACE_MS);
}
// Duplicates: same retailer + same subject + same body -> answer once (M007 = M015).
// Same question from DIFFERENT retailers (M003 / M020) is not a duplicate: both need a reply.
const seen = new Map<string, string>();
for (const r of results) {
  const key = [r.email.from_retailer, r.email.subject, r.email.body].map((s) => s.trim().toLowerCase()).join("\u0000");
  const first = seen.get(key);
  if (first) {
    r.duplicateOf = first;
    r.flags.unshift({ level: "yellow", reason: `Duplicate of ${first} (same retailer, same text). Reply once.` });
    if (r.status === "green") r.status = "yellow";
  } else {
    seen.set(key, r.email.id);
  }
}

fs.mkdirSync(config.paths.results, { recursive: true });
fs.writeFileSync(path.join(config.paths.results, "results.json"), JSON.stringify(results, null, 2));
const md = [
  "| id | status | intents | product (rows left) | reason |",
  "|---|---|---|---|---|",
  ...results.map((r) =>
    `| ${r.email.id} | ${ICON[r.status]} | ${r.extraction?.intents.join(", ") ?? "-"} | ${r.resolution.matches.map((m) => `${m.name} (${m.variants.length})`).join(", ") || "-"} | ${r.flags[0]?.reason ?? ""} |`),
].join("\n");
fs.writeFileSync(path.join(config.paths.results, "results.md"), md + "\n");
console.log(`Wrote ${results.length} results`);
