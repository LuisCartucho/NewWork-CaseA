// Loads the CSVs and hand-checked fact sheet facts once at startup. No database:
// the data is small (~170 rows) and read-only, so memory is simplest.
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { config } from "../config.js";
import type { Email, Product, FactSheet } from "../types.js";

// fact_sheet_facts.json is hand-written, so validate its shape at startup: a typo fails loudly.
const FactSheetsSchema = z.array(z.object({
  file: z.string(),
  name: z.string(),
  facts: z.array(z.object({
    field: z.string(),
    value: z.string(),
    appliesTo: z.array(z.string()).optional(),
    page: z.number().int().positive(),
    doubt: z.string().optional(), // the sheet says it, but it looks wrong: never trusted as-is
  })),
}));

function readCsv<T>(file: string): T[] {
  const text = fs.readFileSync(path.join(config.paths.data, file), "utf8");
  return parse(text, { columns: true, skip_empty_lines: true, trim: true }) as T[];
}

export function loadData() {
  const products = readCsv<Product>("products.csv");
  const emails = readCsv<Email>("retailer_emails.csv");
  const factsFile = path.join(config.paths.data, "fact_sheet_facts.json");
  const factSheets: FactSheet[] = fs.existsSync(factsFile)
    ? FactSheetsSchema.parse(JSON.parse(fs.readFileSync(factsFile, "utf8")))
    : [];
  return { products, emails, factSheets };
}

export type Data = ReturnType<typeof loadData>;
