// JSON API used by the client.
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import type { Data } from "../data/loadData.js";
import { runPipeline } from "../pipeline/index.js";
import { findDataIssues } from "../pipeline/conflicts.js";
import { createSourceLookup } from "../sources.js";
import { buildReport } from "../dataIssuesReport.js";

export function apiRouter(data: Data) {
  const r = Router();
  const resultsFile = path.join(config.paths.results, "results.json");

  // Inbox reads precomputed results, so the demo works even if the LLM is down.
  r.get("/results", (_req, res) => {
    if (!fs.existsSync(resultsFile)) return res.json([]);
    res.type("json").send(fs.readFileSync(resultsFile, "utf8"));
  });

  // "Try your own email": the only live LLM call. Nothing is stored: the result is returned, not
  // written anywhere, and the log line has status, timing and provider only (never the email).
  // If the AI takes longer than TRY_BUDGET_MS, the facts-only result is returned instead.
  const TRY_BUDGET_MS = Number(process.env.TRY_BUDGET_MS ?? 20_000);
  r.post("/try", async (req, res) => {
    const body = String(req.body?.body ?? "").slice(0, 5000);
    const subject = String(req.body?.subject ?? "").slice(0, 300);
    if (!body.trim()) return res.status(400).json({ error: "Empty email" });
    const email = { id: "LIVE", date: new Date().toISOString().slice(0, 10), from_retailer: "(live test)", subject, body };
    // Express 4 does not catch async errors: without this the request would hang.
    const started = Date.now();
    try {
      const withAi = runPipeline(email, data);
      const timeout = new Promise<null>((done) => setTimeout(() => done(null), TRY_BUDGET_MS));
      let result = await Promise.race([withAi, timeout]);
      if (!result) {
        withAi.catch(() => {}); // still running; its result is discarded
        result = { ...(await runPipeline(email, data, { ai: false })), aiTimedOut: true };
      }
      console.log(`[try] ${result.status} in ${Date.now() - started} ms · extract=${result.ai.extract ?? "-"} draft=${result.ai.draft ?? "-"}${result.aiTimedOut ? " · AI timed out" : ""}`);
      res.json(result);
    } catch (err) {
      console.error(`[try] failed after ${Date.now() - started} ms: ${(err as Error).name}`);
      res.status(500).json({ error: "Processing failed. Please try again." });
    }
  });

  // Data issues page: grouped per product, sorted by impact on the email results.
  const dataIssues = findDataIssues(data.products, data.factSheets, data.emails);
  r.get("/data-issues", (_req, res) => {
    const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, "utf8")) : [];
    res.json(buildReport(dataIssues, data.products, results));
  });

  // Source pills on the detail page: the fact sheet lines a fact was read from.
  const snippet = createSourceLookup(data.factSheets);
  r.get("/source", (req, res) => {
    const found = snippet(String(req.query.file ?? ""), Number(req.query.page), String(req.query.label ?? ""));
    if (!found) return res.status(404).json({ error: "Unknown fact sheet or page" });
    res.json(found);
  });

  return r;
}
