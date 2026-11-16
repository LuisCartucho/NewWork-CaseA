// Express server: basic auth on everything except /health, JSON API under /api,
// and the static client. One process, one Render service.
import express from "express";
import { config } from "./config.js";
import { loadData } from "./data/loadData.js";
import { apiRouter } from "./routes/api.js";

const data = loadData();
const app = express();
app.use(express.json({ limit: "50kb" }));

// Health check for Render: no auth, no data.
app.get("/health", (_req, res) => res.json({ ok: true }));

// HTTP basic auth: it's real product data. If no password is configured, refuse to serve.
app.use((req, res, next) => {
  if (!config.auth.user || !config.auth.pass) return res.status(500).send("Basic auth not configured");
  const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
  const [user, pass] = Buffer.from(encoded ?? "", "base64").toString().split(":");
  if (scheme === "Basic" && user === config.auth.user && pass === config.auth.pass) return next();
  res.set("WWW-Authenticate", 'Basic realm="New Works KB"').status(401).send("Authentication required");
});

app.use("/api", apiRouter(data));
app.use(express.static(config.paths.client));

app.listen(config.port, () => {
  console.log(`Loaded ${data.products.length} products, ${data.emails.length} emails, ${data.factSheets.length} fact sheets`);
  console.log(`http://localhost:${config.port}`);
});
