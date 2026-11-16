// The Data issues page, for the product data owner: one row per product + issue (not per SKU),
// sorted by impact on retailer emails, with a plain-language summary.
//
// Impact comes from the email results: every flag records the data issues that cause it
// (Flag.issueKeys). An email turns green when ALL its open items are caused by fixed issues.
import { issueKey, type ConflictKind, type DataConflict, type Severity } from "./pipeline/conflicts.js";
import type { PipelineResult, Product } from "./types.js";

export interface IssueGroup {
  id: string;
  product: string;
  title: string; // "Kizu Table Lamp Large, Kunis Breccia: AU, UK, US (3 variants)"
  kind: ConflictKind;
  severity: Severity;
  message: string; // short plain-language issue text
  skus: { sku: string; variant: string; message: string }[];
  affects: string[]; // emails whose answer this issue changes (a flag is caused by it)
  askedIn: string[]; // emails that ask about these SKUs at all
  key: string; // issueKey: links to the flags this issue causes
}

export interface DataIssuesReport {
  totals: { issues: number; products: number; groups: number };
  top: { count: number; fixesEmails: string[] }; // fixing the top N groups would turn these emails green
  allAffecting: { count: number; fixesEmails: string[] }; // fixing every group that affects an email
  yellowNotFromData: number; // yellow emails that stay yellow: what's missing isn't a data error (lead times…)
  groups: IssueGroup[];
}

const SEVERITY_ORDER: Record<Severity, number> = { wrong: 0, inconsistent: 1, missing: 2, cosmetic: 3 };
const TOP = 4;

export function buildReport(issues: DataConflict[], products: Product[], results: PipelineResult[]): DataIssuesReport {
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const rowsOf = new Map<string, number>();
  for (const p of products) rowsOf.set(p.name, (rowsOf.get(p.name) ?? 0) + 1);

  // Which emails each issue key causes a flag in.
  const affectedBy = new Map<string, Set<string>>();
  for (const r of results) {
    for (const f of r.flags) {
      for (const k of f.issueKeys ?? []) affectedBy.set(k, (affectedBy.get(k) ?? new Set()).add(r.email.id));
    }
  }

  // One row per product + kind + field: the same issue on several variants is one fix,
  // even when the numbers differ (Karl-Johan oak 10.2 kg / marble 11.55 kg).
  const map = new Map<string, DataConflict[]>();
  for (const i of issues) {
    const k = [i.product, i.kind, i.field].join("|");
    map.set(k, [...(map.get(k) ?? []), i]);
  }

  const groups: IssueGroup[] = [...map.values()].map((list, n) => {
    const first = list[0];
    const variants = list.map((i) => bySku.get(i.sku)?.variant ?? "");
    return {
      id: `g${n}`,
      product: first.product,
      title: titleFor(first.product, variants, list.map((i) => i.sku), rowsOf.get(first.product) ?? list.length),
      kind: first.kind,
      severity: first.severity,
      // Different numbers per variant: show the first, the rest is in the SKU list.
      message: new Set(list.map((i) => i.message)).size > 1 ? `${first.message} (other variants differ: see SKUs)` : first.message,
      skus: list.map((i, j) => ({ sku: i.sku, variant: variants[j], message: i.message })),
      affects: [...(affectedBy.get(issueKey(first)) ?? [])].sort(),
      askedIn: [...new Set(list.flatMap((i) => i.emails ?? []))].sort(),
      key: issueKey(first),
    };
  });

  groups.sort((a, b) =>
    b.affects.length - a.affects.length
    || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || b.skus.length - a.skus.length
    || a.title.localeCompare(b.title));

  // Emails that turn green when these groups are fixed: every open item is caused by a fixed issue.
  const yellow = results.filter((r) => r.status === "yellow");
  const turnsGreen = (fixed: Set<string>) => yellow
    .filter((r) => {
      const open = r.flags.filter((f) => f.level !== "green");
      return open.length > 0 && open.every((f) => f.issueKeys?.length && f.issueKeys.every((k) => fixed.has(k)));
    })
    .map((r) => r.email.id);
  const affecting = groups.filter((g) => g.affects.length);
  const allFix = turnsGreen(new Set(affecting.map((g) => g.key)));

  return {
    totals: { issues: issues.length, products: new Set(issues.map((i) => i.product)).size, groups: groups.length },
    top: { count: Math.min(TOP, groups.length), fixesEmails: turnsGreen(new Set(groups.slice(0, TOP).map((g) => g.key))) },
    allAffecting: { count: affecting.length, fixesEmails: allFix },
    yellowNotFromData: yellow.length - allFix.length,
    groups,
  };
}

/** "Kizu Table Lamp Large, Kunis Breccia: AU, UK, US (3 variants)"; "Tembo Lounge Chair: all 6 variants". */
function titleFor(product: string, variants: string[], skus: string[], productRows: number): string {
  if (skus.length === 1) return variants[0] ? `${product}, ${variants[0]}` : product;
  if (skus.length === productRows) return `${product}: all ${skus.length} variants`;
  const pieces = variants.map((v) => v.split(/,\s*/).filter(Boolean));
  const common = pieces[0].filter((x) => pieces.every((p) => p.includes(x)));
  // Size words inside one odd label ("Kunis Breccia, Large, EU") aren't a difference worth showing.
  const rest = [...new Set(pieces.map((p) => p.filter((x) => !common.includes(x) && !/^(Large|Small)$/.test(x)).join(", ")))].filter(Boolean);
  const list = rest.join(", ");
  if (!list || list.length > 50) return `${product}${common.length ? `, ${common.join(", ")}` : ""}: ${skus.length} variants`;
  return `${product}${common.length ? `, ${common.join(", ")}` : ""}: ${list} (${skus.length} variants)`;
}
