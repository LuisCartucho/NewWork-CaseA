// Step 3 (plain code, no AI): match product name + variant hints against products.csv.
// Why not AI: picking the wrong SKU is the costliest error. Code either narrows to an exact
// SKU or keeps every row that still fits. It never picks silently.
//
// Works WITHOUT the LLM (extraction === null): it reads the subject + redacted body directly.
// With an extraction, the LLM's productName / variantHints are added to the text it searches.
//
// How variants are narrowed: every variant label is split into attributes ("82x82, Costa Black"
// -> "82x82", "Costa Black"; markets "EU/AU/UK" -> EU, AU, UK). Each row scores one point per
// attribute the email mentions, and only the top-scoring rows are kept. Scoring instead of
// filtering means "other colours than dark green and light grey" keeps both colours instead of
// wrongly narrowing to the first one mentioned.
import type { Extraction, Product, ProductMatch, Resolution } from "../types.js";

/** Extra ways retailers name products, beyond the full name and the name without "Lamp". */
const ALIASES: Record<string, string[]> = {
  "Coupe Stool / Bar Stool": ["Coupe Bar Stool", "Coupe Stool", "Coupe Bar"],
  "Pi-No-Pi-No Vase": ["Pi-No-Pi-No"],
  "Tana Wall Shelf": ["Tana Shelf"],
  "May Lounge Armchair": ["May Lounge Chair", "May Armchair"],
  "Kizu Table Lamp Large": ["Kizu Large"],
  "Kizu Table Lamp Small": ["Kizu Small"],
  "Karl-Johan Table Lamp": ["Karl-Johan Lamp"],
};

/** Family words that are also ordinary English words, so they never match on their own. */
const AMBIGUOUS_FAMILY_WORDS = new Set(["May"]);

/** Words retailers use that don't appear in the variant label. */
const SYNONYMS: { phrase: string; label: string; rowHas: (p: Product) => boolean }[] = [
  { phrase: "lacquered", label: "lacquered (FSC MDF)", rowHas: (p) => /MDF/.test(p.material) },
  { phrase: "travertine", label: "Travertine", rowHas: (p) => /travertine/i.test(p.variant) },
  { phrase: "complete set", label: "Com. Set", rowHas: (p) => /Com\. Set/.test(p.variant) },
  { phrase: "own fabric", label: "COM", rowHas: (p) => p.variant === "COM" },
  { phrase: "own material", label: "COM", rowHas: (p) => p.variant === "COM" },
];

const MARKET = /^[A-Z]{2}(?:\/[A-Z]{2})*$/; // "EU", "EU/AU/UK", "US/JP"

interface Attribute {
  label: string;
  rowHas: (p: Product) => boolean;
  mentionedIn: (text: Text) => boolean;
}
interface Text { raw: string; norm: string }

export function resolve(input: {
  extraction: Extraction | null;
  subject: string;
  redactedBody: string;
  products: Product[];
}): Resolution {
  const { extraction, products } = input;
  const raw = [input.subject, input.redactedBody, extraction?.productName, extraction?.family]
    .filter(Boolean).join("\n");
  const text: Text = { raw, norm: normalise(raw) };

  const byName = groupBy(products, (p) => p.name);
  const matches: ProductMatch[] = [];

  // 1. Products named directly (longest alias wins, so "Kizu Table Lamp Large" beats "Kizu").
  for (const [name, rows] of byName) {
    const alias = aliasesFor(name).find((a) => containsPhrase(text.norm, normalise(a)));
    if (alias) matches.push({ name, matchedBy: alias, variants: rows, hints: [] });
  }

  // 2. Families named without a specific product ("Atlas family", "Kizu Table Lamp" w/o size).
  const families: string[] = [];
  for (const family of new Set([...byName.keys()].map(familyOf))) {
    if (AMBIGUOUS_FAMILY_WORDS.has(family) && !containsPhrase(text.norm, normalise(`${family} family`))) continue;
    if (!new RegExp(`(?<![\\p{L}-])${escape(family)}(?![\\p{L}-])`, "u").test(text.raw)) continue;
    if (matches.some((m) => familyOf(m.name) === family)) continue; // a specific product was named
    families.push(family);
    for (const [name, rows] of byName) {
      if (familyOf(name) === family) matches.push({ name, matchedBy: family, variants: rows, hints: [] });
    }
  }

  // 3. Narrow each product's rows by the variant attributes the email mentions.
  //    The product's own name is removed first, so "Kizu Table Lamp Large" doesn't count as
  //    the variant attribute "Large" (which only the odd Kunis Breccia EU row carries).
  const unmatchedHints = new Set(extraction?.variantHints ?? []);
  for (const m of matches) {
    const attrs = attributesFor(m.variants);
    const own: Text = {
      raw: [text.raw, ...(extraction?.variantHints ?? [])].join("\n").split(m.name).join(" "),
      norm: "",
    };
    own.norm = normalise(own.raw).split(normalise(m.name.replace(/ Lamp$/, ""))).join(" ");
    const mentioned = attrs.filter((a) => a.mentionedIn(own));
    for (const hint of extraction?.variantHints ?? []) {
      const h: Text = { raw: hint, norm: normalise(hint) };
      if (attrs.some((a) => a.mentionedIn(h))) unmatchedHints.delete(hint);
    }
    if (!mentioned.length) continue;
    const score = (p: Product) => mentioned.filter((a) => a.rowHas(p)).length;
    const best = Math.max(...m.variants.map(score));
    if (best === 0) continue;
    m.variants = m.variants.filter((p) => score(p) === best);
    m.hints = mentioned.filter((a) => m.variants.some(a.rowHas)).map((a) => a.label);
  }

  return {
    matches,
    families,
    candidates: matches.flatMap((m) => byName.get(m.name)!),
    chosen: matches.flatMap((m) => m.variants),
    ambiguous: matches.some((m) => m.variants.length > 1),
    unmatchedHints: [...unmatchedHints],
  };
}

function attributesFor(rows: Product[]): Attribute[] {
  const attrs = new Map<string, Attribute>();
  const add = (a: Attribute) => { if (!attrs.has(a.label)) attrs.set(a.label, a); };

  for (const piece of new Set(rows.flatMap(variantPieces))) {
    if (MARKET.test(piece)) {
      for (const code of piece.split("/")) {
        add({
          label: code,
          rowHas: (p) => variantPieces(p).some((x) => MARKET.test(x) && x.split("/").includes(code)),
          mentionedIn: (t) => new RegExp(`\\b${code}\\b`).test(t.raw), // case-sensitive: "US", not "us"
        });
      }
    } else if (/^[A-F]$/.test(piece)) {
      // Fabric price category: only "category C" / "cat. C" counts, never a lone letter.
      add({
        label: `category ${piece}`,
        rowHas: (p) => p.variant === piece,
        mentionedIn: (t) => new RegExp(`\\bcat(?:egory|\\.)?\\s*${piece.toLowerCase()}\\b`).test(t.norm),
      });
    } else if (piece === "COM") {
      add({ label: "COM", rowHas: (p) => p.variant === "COM", mentionedIn: (t) => /\bCOM\b/.test(t.raw) });
    } else {
      const n = normalise(piece);
      add({ label: piece, rowHas: (p) => variantPieces(p).some((x) => normalise(x) === n), mentionedIn: (t) => containsPhrase(t.norm, n) });
    }
  }
  for (const s of SYNONYMS) {
    if (rows.some(s.rowHas)) add({ label: s.label, rowHas: s.rowHas, mentionedIn: (t) => containsPhrase(t.norm, s.phrase) });
  }
  return [...attrs.values()];
}

/** "Com. Set, Grey/Fuchsia/Opal White+Lid" -> ["Com. Set", "Grey", "Fuchsia", "Opal White", "Lid"];
 *  "Smoked Oak w. White Opal Glass, EU" -> ["Smoked Oak", "White Opal Glass", "EU"]. Markets stay whole. */
function variantPieces(p: Product): string[] {
  return p.variant
    .split(/,\s*|\s+w\.\s+/)
    .flatMap((x) => (MARKET.test(x.trim()) ? [x.trim()] : x.split(/[/+]/)))
    .map((x) => x.trim())
    .filter(Boolean);
}

function aliasesFor(name: string): string[] {
  const list = [name, name.replace(/ Lamp$/, ""), ...(ALIASES[name] ?? [])];
  return [...new Set(list)].sort((a, b) => b.length - a.length);
}

/** First word of the product name. The CSV `family` column is unreliable ("New Works", "Rand Tables", empty). */
function familyOf(name: string): string {
  return name.split(" ")[0];
}

/** Lowercase and unify spellings: "82 x 82" -> "82x82", "Ø 90" -> "ø90", anodized -> anodised. */
export function normalise(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/(\d)\s*[x×]\s*(\d)/g, "$1x$2")
    .replace(/ø\s+(\d)/g, "ø$1")
    .replace(/anodized/g, "anodised")
    .replace(/aluminum/g, "aluminium")
    .replace(/\bgray\b/g, "grey")
    .replace(/\s+/g, " ");
}

/** Whole-phrase match: "65" doesn't match "Ø65" or "650", "oak" doesn't match "soak". */
function containsPhrase(haystack: string, phrase: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase)}(?![\\p{L}\\p{N}])`, "u").test(haystack);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}
