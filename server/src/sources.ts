// "Where does this fact come from?": the lines on the fact sheet page that a fact was read from.
// Uses the pdftotext output in data/fact_sheets_text (pages separated by form feeds). Plain code:
// it finds lines on that page containing words from the fact's label ("Height", "Weight").
// Only known fact sheet files can be read: the file name is looked up, never used as a path.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { FactSheet } from "./types.js";

/** Label word -> what to look for on the page (the PDFs say "mm", "Dimming", "Fabric Requirements"…). */
const KEYWORDS: [RegExp, RegExp][] = [
  [/seat height/i, /seat/i],
  [/incl\. packaging|packaging/i, /packag|incl/i],
  [/net weight|weight/i, /weight/i],
  [/diameter/i, /diameter|ø/i],
  [/width/i, /width/i],
  [/depth/i, /depth/i],
  [/height/i, /height/i],
  [/cord/i, /cord|cable/i],
  [/canopy/i, /canopy/i],
  [/dimmable/i, /dimm/i],
  [/certificat/i, /certif|\bCE\b|\bEN \d|ETL|FCC|UKCA|FSC|ISO/],
  [/lead time/i, /deliver|lead time|stock/i],
  [/com fabric/i, /fabric req|meter|metre/i],
  [/leather/i, /leather/i],
  [/price category of (.+)/i, /category/i],
  [/outdoor care/i, /rust|sea|corros/i],
  [/^use$/i, /indoor|outdoor/i],
  [/care/i, /stain|liquid/i],
  [/finish/i, /finish|unfilled|travert/i],
  [/material/i, /material|oak|steel|marble|fabric|glass|aluminium|textile/i],
  [/colours/i, /colou?r|marble|green|grey/i],
];

export interface SourceSnippet { file: string; page: number; lines: string[] }

export function createSourceLookup(factSheets: FactSheet[]) {
  const known = new Map(factSheets.map((s) => [s.file, s]));
  const pagesCache = new Map<string, string[]>();

  const pagesOf = (file: string): string[] | null => {
    if (!known.has(file)) return null;
    if (!pagesCache.has(file)) {
      const txt = path.join(config.paths.data, "fact_sheets_text", file.replace(/\.pdf$/i, ".txt"));
      pagesCache.set(file, fs.existsSync(txt) ? fs.readFileSync(txt, "latin1").split("\f") : []);
    }
    return pagesCache.get(file)!;
  };

  return function snippet(file: string, page: number, label: string): SourceSnippet | null {
    const pages = pagesOf(file);
    if (!pages || !Number.isInteger(page) || page < 1) return null;
    const lines = (pages[page - 1] ?? "").split("\n").map((l) => l.replace(/\s{3,}/g, "   ").trim()).filter(Boolean);
    const name = label.replace(/^[^:]+:\s*/, "").replace(/\s*\(.*\)$/, ""); // "Atlas…: Height (82x82)" -> "Height"
    const match = KEYWORDS.find(([re]) => re.test(name));
    const fabric = name.match(/price category of (.+)/i)?.[1]?.replace(/\s+\d+$/, "");
    const hit = (l: string) => (fabric ? l.toLowerCase().includes(fabric.toLowerCase()) || /category/i.test(l) : match?.[1].test(l));
    const found = lines.filter((l) => hit(l)).slice(0, 6);
    return { file, page, lines: found.length ? found : lines.slice(0, 6) };
  };
}
