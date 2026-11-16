// JSON API used by the client.
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import type { Data } from "../data/loadData.js";
import { runPipeline } from "../pipeline/index.js";

export function apiRouter(data: Data) {
  const r = Router();
  const resultsFile = path.join(config.paths.results, "results.json");

  // Inbox reads precomputed results, so the demo works even if the LLM is down.
  r.get("/results", (_req, res) => {
    if (!fs.existsSync(resultsFile)) return res.json([]);
    res.type("json").send(fs.readFileSync(resultsFile, "utf8"));
  });

  // "Try your own email": the only live LLM call.
  r.post("/try", async (req, res) => {
    const body = String(req.body?.body ?? "").slice(0, 5000);
    const subject = String(req.body?.subject ?? "").slice(0, 300);
    if (!body.trim()) return res.status(400).json({ error: "Empty email" });
    const email = { id: "LIVE", date: new Date().toISOString().slice(0, 10), from_retailer: "(live test)", subject, body };
    res.json(await runPipeline(email, data));
  });

  // Data issues page: populated in step 2 from the lookup's conflict detection.
  r.get("/data-issues", (_req, res) => res.json([]));

  return r;
}
