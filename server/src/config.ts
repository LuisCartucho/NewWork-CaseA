import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/ (tsx) and dist/ (compiled): server root is one level up.
const serverRoot = path.resolve(here, "..");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  auth: {
    user: process.env.BASIC_AUTH_USER ?? "",
    pass: process.env.BASIC_AUTH_PASS ?? "",
  },
  llm: {
    gemini: { key: process.env.GEMINI_API_KEY ?? "", model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash" },
    groq: { key: process.env.GROQ_API_KEY ?? "", model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile" },
  },
  paths: {
    data: path.join(serverRoot, "data"),
    results: path.join(serverRoot, "results"),
    client: path.resolve(serverRoot, "..", "client"),
  },
};
