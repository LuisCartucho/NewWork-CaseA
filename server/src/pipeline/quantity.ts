// Plain code: how many units the retailer mentions ("four Covent Club Chairs", "asking for two").
// Only quantities above one matter: they can change a lead time (4 made-to-order chairs) or a price.
const WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, twenty: 20, "a pair of": 2, "a dozen": 12,
};
const NUM = `(\\d{1,4}|${Object.keys(WORDS).join("|")})`;
const UNIT = `(?:[A-Z][\\w-]*\\s+){0,4}(?:chairs?|armchairs?|tables?|stools?|lamps?|pendants?|rugs?|shelf|shelves|pitchers?|vases?|sets?|units?|pieces?|pcs)\\b`;

const PATTERNS = [
  new RegExp(`\\b${NUM}\\s+${UNIT}`, "i"), //                    "four Covent Club Chairs", "4 units"
  new RegExp(`\\b(?:asking for|order|need|want|quantity:?|qty:?)\\s+${NUM}\\b`, "i"), // "asking for two"
];

export function quantityIn(text: string): number | undefined {
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const raw = m[1].toLowerCase();
    const n = WORDS[raw] ?? Number(raw);
    // Ignore sizes and years ("200 x 300", "2026"): only plausible order quantities.
    if (Number.isFinite(n) && n > 1 && n < 1000) return n;
  }
  return undefined;
}
