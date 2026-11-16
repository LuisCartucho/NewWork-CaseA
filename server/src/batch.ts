// npm run batch: run all 30 emails, write results/results.json + results/results.md.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { loadData } from "./data/loadData.js";
import { runPipeline } from "./pipeline/index.js";
import type { PipelineResult } from "./types.js";

const ICON = { green: "🟢", yellow: "🟡", red: "🔴" } as const;

const data = loadData();
const results: PipelineResult[] = [];
for (const email of data.emails) {
  results.push(await runPipeline(email, data));
  console.log(email.id, ICON[results.at(-1)!.status]);
}
// TODO step 4: duplicate grouping (same retailer + same body).

fs.mkdirSync(config.paths.results, { recursive: true });
fs.writeFileSync(path.join(config.paths.results, "results.json"), JSON.stringify(results, null, 2));
const md = [
  "| id | status | intents | product | reason |",
  "|---|---|---|---|---|",
  ...results.map((r) =>
    `| ${r.email.id} | ${ICON[r.status]} | ${r.extraction?.intents.join(", ") ?? "-"} | ${r.resolution.chosen[0]?.name ?? "-"} | ${r.flags[0]?.reason ?? ""} |`),
].join("\n");
fs.writeFileSync(path.join(config.paths.results, "results.md"), md + "\n");
console.log(`Wrote ${results.length} results`);
