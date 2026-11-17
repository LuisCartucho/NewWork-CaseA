// Plain JS, no build step. Hash routing:
//   #inbox · #email/M001 (both: the Inbox split view) · #try · #issues
// Every piece of data is escaped with esc() before it goes into innerHTML.
const app = document.getElementById("app");
const pop = document.getElementById("popover");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

// Loaded once per page load and reused by every view.
// The promise is shared so two callers at start-up get the same array (not two separate fetches).
let resultsCache = null, resultsPromise = null;
const loadResults = () => (resultsPromise ??= getJson("/api/results")
  .then((r) => (resultsCache = r), (e) => { resultsPromise = null; throw e; }));
let issuesCache = null, issuesPromise = null;
const loadIssues = () => (issuesPromise ??= getJson("/api/data-issues")
  .then((r) => (issuesCache = r), (e) => { issuesPromise = null; throw e; }));

// ---------- status ----------

const svg = (body) => `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  check: svg(`<path d="M3.5 8.5l3 3 6-7"/>`),
  alert: svg(`<circle cx="8" cy="8" r="6.25"/><path d="M8 4.75v3.5"/><circle cx="8" cy="11.1" r=".6" fill="currentColor"/>`),
  person: svg(`<circle cx="8" cy="5.25" r="2.6"/><path d="M2.75 13.75c.6-2.7 2.8-4.25 5.25-4.25s4.65 1.55 5.25 4.25"/>`),
};

// Pipeline statuses are green/yellow/red; the UI only ever says Ready / Check / Person.
const STATUS = {
  green: { tag: "Ready", label: "Ready to send", cls: "ready", icon: ICON.check },
  yellow: { tag: "Check", label: "Check before sending", cls: "check", icon: ICON.alert },
  red: { tag: "Person", label: "Needs a person", cls: "person", icon: ICON.person },
};
const STATUS_ORDER = ["red", "yellow", "green"];

/** Icon + word, never colour alone. */
const statusLabel = (status, long = false) =>
  `<span class="st st-${STATUS[status].cls}">${STATUS[status].icon}<span>${esc(long ? STATUS[status].label : STATUS[status].tag)}</span></span>`;

// ---------- handled (per browser) ----------

const HANDLED_KEY = "nw-inbox-handled";
const handled = new Set((() => {
  try { return JSON.parse(localStorage.getItem(HANDLED_KEY)) || []; } catch { return []; }
})());
const saveHandled = () => { try { localStorage.setItem(HANDLED_KEY, JSON.stringify([...handled])); } catch { /* private mode */ } };
const isHandled = (r) => handled.has(r.email.id);
/** Identical emails are one conversation and one reply, so they are handled together. */
function setHandled(r, on) {
  for (const id of [r.email.id, ...(r.identicalTo ?? [])]) on ? handled.add(id) : handled.delete(id);
  saveHandled();
  updateNavCounts();
}

/** One row per conversation (identical emails grouped, like Gmail): open ones first (Person, Check, Ready; oldest first), handled ones last. */
const rows = () => (resultsCache ?? []).filter((r) => !r.duplicateOf)
  .sort((a, b) => isHandled(a) - isHandled(b)
    || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    || a.email.date.localeCompare(b.email.date) || a.email.id.localeCompare(b.email.id));

function updateNavCounts() {
  const inboxEl = document.getElementById("nav-inbox-count");
  const issuesEl = document.getElementById("nav-issues-count");
  if (resultsCache) {
    const left = rows().filter((r) => !isHandled(r)).length;
    inboxEl.textContent = left;
    inboxEl.title = `${plural(left, "email")} left`;
  }
  if (issuesCache) {
    issuesEl.textContent = issuesCache.groups.length;
    issuesEl.title = plural(issuesCache.groups.length, "issue");
  }
}

// ---------- shared pieces ----------

/** Redacted body: [PHONE]-style tokens shown as small grey "phone number removed" marks. */
const REDACTED = {
  NAME: "name removed", ADDRESS: "address removed", "POSTCODE CITY": "postcode and city removed",
  PHONE: "phone number removed", EMAIL: "email address removed", "PERSONAL ID": "personal ID removed",
};
const emailBody = (text) => esc(text).replace(/\[(NAME|ADDRESS|POSTCODE CITY|PHONE|EMAIL|PERSONAL ID)\]/g,
  (_, k) => `<span class="redacted">${REDACTED[k]}</span>`);

/** "Kizu Table Lamp Large: Net weight" -> "Net weight". */
const factLabel = (label) => label.replace(/^[^:]+:\s*/, "");
const factProduct = (label) => label.split(":")[0];

/** Numbers, sizes and weights in tabular mono; prose (materials) stays in the body font. */
const isMeasure = (v) => /\d/.test(v)
  && !/\p{L}/u.test(v.replace(/\b(cm|mm|m|kg|g|W|V|lm|K|H|D|x|weeks?|wk)\b/g, ""));

// Data issue keys ("Kizu Table Lamp Large|weight_kg") -> the fact row they put in doubt.
const FIELD_ROW = {
  weight_kg: /^Net weight/, width_cm: /^Width/, depth_cm: /^Depth/, height_cm: /^Height/,
  lead_time_weeks: /^Lead time/, seat_height_cm: /^Seat height/, weight_incl_packaging_kg: /^Weight incl/,
};

/** Notes to show on specific fact rows: implausible sheet values and flagged data issues. */
function rowNotes(r, product, f) {
  const notes = [];
  if (f.doubt) notes.push(`Not trusted: ${f.doubt}`);
  for (const flag of r.flags) {
    for (const key of flag.issueKeys ?? []) {
      const [p, field] = key.split("|");
      if (p === product && FIELD_ROW[field]?.test(factLabel(f.label))) notes.push(factLabel(flag.short ?? flag.reason));
    }
  }
  return [...new Set(notes)];
}

/** One quiet "Sources:" line per product, each part clickable to see the csv row or sheet text. */
function sourcesLine(facts) {
  const skus = new Set();
  const sheets = new Map(); // "file|page" -> label to look up
  for (const f of facts) {
    for (const part of f.source.split("; ")) {
      const csv = part.match(/^products\.csv SKU (.+)$/);
      const sheet = part.match(/^(.+\.pdf) p\.(\d+)$/);
      if (csv) csv[1].split(", ").forEach((s) => skus.add(s));
      else if (sheet && !sheets.has(`${sheet[1]}|${sheet[2]}`)) sheets.set(`${sheet[1]}|${sheet[2]}`, f.label);
    }
  }
  const parts = [];
  if (skus.size) {
    const list = [...skus];
    const shown = list.length > 2 ? `${list[0]} +${list.length - 1}` : list.join(", ");
    parts.push(`<button type="button" class="src" data-src="csv" data-skus="${esc(list.join(","))}" aria-haspopup="dialog">products.csv · <span class="num">${esc(shown)}</span></button>`);
  }
  for (const [key, label] of sheets) {
    const [file, page] = key.split("|");
    parts.push(`<button type="button" class="src" data-src="sheet" data-file="${esc(file)}" data-page="${page}" data-label="${esc(label)}" aria-haspopup="dialog">Fact sheet · <span class="num">p.${page}</span></button>`);
  }
  return parts.length ? `<p class="sources">Sources: ${parts.join(`<span class="sep">·</span>`)}</p>` : "";
}

/** Verified catalog data: product, SKU, key-value table, one sources line. */
function catalogBlock(r) {
  const byProduct = new Map();
  for (const f of r.facts) {
    const p = factProduct(f.label);
    if (!byProduct.has(p)) byProduct.set(p, []);
    byProduct.get(p).push(f);
  }
  const names = [...new Set([...r.resolution.matches.map((m) => m.name), ...byProduct.keys()])];
  // Conflicts already spelled out in the notice above aren't repeated here.
  const conflicts = (r.conflicts ?? []).filter((c) => !r.flags.some((f) => f.reason.includes(c.replace(/^.*?:\s*/, ""))));

  const block = (name) => {
    const m = r.resolution.matches.find((x) => x.name === name);
    const facts = byProduct.get(name) ?? [];
    const v = m?.variants ?? [];
    const one = v.length === 1 ? v[0] : null;
    const status = (p) => (p.status !== "active" ? ` <span class="warn-text">· ${esc(p.status)}</span>` : "");
    return `
      <div class="product">
        <div class="product-head">
          <div>
            <div class="product-name">${esc(name)}</div>
            ${one ? `<div class="product-variant">${esc(one.variant || "Single variant")}${status(one)}</div>` : ""}
            ${v.length > 1 ? `<div class="product-variant warn-text">${v.length} variants possible · not specified</div>` : ""}
          </div>
          ${one ? `<div class="sku num">SKU ${esc(one.sku)}</div>` : ""}
        </div>
        ${v.length > 1 ? `<ul class="variant-list">${v.map((p) => `<li><span class="num">${esc(p.sku)}</span> · ${esc(p.variant || "–")}${status(p)}</li>`).join("")}</ul>` : ""}
        ${facts.length ? `
          <dl class="kv">${facts.map((f) => {
            const notes = rowNotes(r, name, f);
            return `
            <div class="kv-row${f.doubt ? " kv-doubt" : ""}">
              <dt>${esc(factLabel(f.label))}</dt>
              <dd>
                <span class="${isMeasure(f.value) ? "num" : ""} kv-value">${esc(f.value)}</span>
                ${notes.map((n) => `<span class="row-note">${ICON.alert}${esc(n)}</span>`).join("")}
              </dd>
            </div>`;
          }).join("")}
          </dl>
          ${sourcesLine(facts)}` : ""}
      </div>`;
  };

  return `
    <section class="catalog" aria-label="Verified catalog data">
      <h2 class="label">Verified catalog data</h2>
      ${names.length ? names.map(block).join("") : `<p class="muted">No product from our range recognised.</p>`}
      ${r.missing?.length ? `<p class="quiet-list"><span class="quiet-title">Not in our data:</span> ${r.missing.map(esc).join(" · ")}</p>` : ""}
      ${conflicts.length ? `
        <div class="quiet-list warn-text">
          <span class="quiet-title">Sources disagree</span>
          <ul>${conflicts.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
        </div>` : ""}
    </section>`;
}

/** Flat tinted notice for Check / Person; nothing at all for Ready. */
function notice(r) {
  if (r.status === "green") return "";
  const flags = [...r.flags].sort((a, b) => STATUS_ORDER.indexOf(a.level) - STATUS_ORDER.indexOf(b.level));
  return `
    <div class="notice notice-${STATUS[r.status].cls}" role="note">
      <p class="notice-title">${STATUS[r.status].icon}<span>${r.status === "red" ? "Needs a person" : "Check before sending"}</span></p>
      <ul>${flags.map((f) => `<li>${esc(f.reason)}</li>`).join("")}</ul>
    </div>`;
}

/** "Before sending": one item per flag action. Nothing open: read once and send. */
function checklist(r) {
  const items = [...new Set(r.flags.map((f) => f.action).filter(Boolean))];
  if (!items.length) items.push("Read the draft once and send");
  return items;
}

/** Who answers a Person email, from what the flags say. */
function recommendedOwner(r) {
  const text = r.flags.filter((f) => f.level === "red").map((f) => f.reason).join(" ").toLowerCase();
  const intents = r.extraction?.intents ?? [];
  if (/price/.test(text) || intents.includes("price_list")) return "sales";
  if (/certificat/.test(text) || intents.includes("certificate")) return "compliance";
  if (/order|discontinued|personal|customer details/.test(text) || intents.includes("order")) return "orders";
  return "team";
}
const OWNER = {
  sales: { name: "your Regional Sales Representative", line: "Pricing is handled by your sales representative, who will come back to you directly." },
  compliance: { name: "Technical Compliance", line: "I've passed this to our compliance team, who will send the documents or confirm what is available." },
  orders: { name: "Order Operations", line: "I've passed this to our order team, who will confirm the details with you directly." },
  team: { name: "the product team", line: "I'm checking this with our product team and will come back to you with a confirmed answer." },
};

/**
 * Person emails get a short holding reply instead of the AI draft: it acknowledges the
 * question and promises nothing that isn't verified. A person then answers it properly.
 */
function holdingReply(r) {
  const names = r.resolution.matches.map((m) => m.name);
  const about = names.length ? ` about the ${names.join(" and ")}` : "";
  return `Hi,\n\nThank you for your message${about}. ${OWNER[recommendedOwner(r)].line}\n\nBest regards,\nNew Works Sales Support`;
}

/** What goes in the reply box: the checked draft, or the holding reply for Person emails. */
function replyFor(r) {
  if (r.status === "red") {
    const owner = OWNER[recommendedOwner(r)].name;
    return {
      text: holdingReply(r),
      checks: [`Forward the email to ${owner}`],
      note: `Holding reply · ${owner.replace(/^(your|the) /, "")} answers the question itself`,
    };
  }
  return {
    text: r.draft ?? "",
    checks: checklist(r),
    note: r.aiUsed ? `Drafted by ${r.ai?.draft ?? "AI"} · every number checked against our data`
      : "AI unavailable. Facts only: write the reply from the catalog data.",
  };
}

const draftEdits = new Map(); // email id -> edited draft, kept while moving between emails

function draftBlock(r, { inbox }) {
  const reply = replyFor(r);
  const text = draftEdits.get(r.email.id) ?? reply.text;
  return `
    <section class="draft-block" aria-label="Draft reply">
      <div class="block-head">
        <h2 class="label">${r.status === "red" ? "Reply to retailer" : "Draft reply"}</h2>
        <button type="button" class="link" id="reset-draft" ${draftEdits.has(r.email.id) ? "" : "hidden"}>Reset draft</button>
      </div>
      <textarea id="draft" class="draft" rows="${r.status === "red" ? 8 : 11}" aria-label="Draft reply">${esc(text)}</textarea>
      <p class="fine">${esc(reply.note)}</p>
      <fieldset class="checklist">
        <legend class="label">Before sending</legend>
        ${reply.checks.map((c, i) => `<label><input type="checkbox" class="check" id="check-${i}"><span>${esc(c)}</span></label>`).join("")}
      </fieldset>
      <div class="actions">
        ${inbox ? `<button type="button" class="btn" id="copy-handled" disabled>Copy &amp; mark handled</button>` : ""}
        <button type="button" class="btn${inbox ? " btn-secondary" : ""}" id="copy-only" disabled>${inbox ? "Copy only" : "Copy draft"}</button>
        <span class="helper" id="copy-status" role="status"></span>
      </div>
    </section>`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Draft box: reset link, checklist gate on both copy buttons. */
function wireDraft(r, { onHandled } = {}) {
  const draft = document.getElementById("draft");
  if (!draft) return;
  const reset = document.getElementById("reset-draft");
  const status = document.getElementById("copy-status");
  const copyHandled = document.getElementById("copy-handled");
  const copyOnly = document.getElementById("copy-only");
  const original = replyFor(r).text;

  draft.addEventListener("input", () => {
    if (draft.value === original) draftEdits.delete(r.email.id);
    else draftEdits.set(r.email.id, draft.value);
    reset.hidden = draft.value === original;
  });
  reset.onclick = () => { draft.value = original; draftEdits.delete(r.email.id); reset.hidden = true; draft.focus(); };

  // The draft never looks send-ready while checks are open.
  const checks = [...document.querySelectorAll(".check")];
  const update = () => {
    const open = checks.filter((c) => !c.checked).length;
    [copyHandled, copyOnly].forEach((b) => b && (b.disabled = open > 0));
    status.textContent = open ? `Tick ${plural(open, "check")} to copy` : "";
  };
  checks.forEach((c) => c.addEventListener("change", update));
  update();

  const copy = async () => {
    if (await copyText(draft.value)) return true;
    draft.select();
    status.textContent = "Press Ctrl+C to copy.";
    return false;
  };
  copyOnly.onclick = async () => { if (await copy()) status.textContent = "Copied."; };
  if (copyHandled) copyHandled.onclick = async () => { if (await copy()) onHandled?.(); };
}

// ---------- source popover ----------

let popAnchor = null;
function closePop() {
  pop.hidden = true;
  popAnchor?.setAttribute("aria-expanded", "false");
  popAnchor = null;
}
/** Position the popover under its anchor, inside the viewport. */
function place(anchor) {
  const a = anchor.getBoundingClientRect();
  const width = Math.min(560, window.innerWidth - 32);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(16, Math.min(a.left + window.scrollX, window.scrollX + window.innerWidth - width - 16))}px`;
  pop.style.top = `${a.bottom + window.scrollY + 6}px`;
}
let popResult = null; // the result whose sources are on screen
async function openPop(b) {
  const r = popResult;
  b.setAttribute("aria-expanded", "true");
  popAnchor = b;
  pop.innerHTML = `<p class="muted">Loading…</p>`;
  place(b);
  pop.hidden = false;
  if (b.dataset.src === "csv") {
    const found = b.dataset.skus.split(",").map((sku) => r?.resolution.candidates.find((p) => p.sku === sku)).filter(Boolean);
    pop.innerHTML = `<div class="pop-title">products.csv</div>
      <div class="table-wrap"><table class="pop-table">
        <thead><tr><th>SKU</th><th>Variant</th><th>W × D × H cm</th><th>Weight kg</th><th>Material</th><th>Lead time</th><th>Status</th></tr></thead>
        <tbody>${found.map((p) => `<tr><td class="num">${esc(p.sku)}</td><td>${esc(p.variant)}</td><td class="num">${esc([p.width_cm, p.depth_cm, p.height_cm].map((x) => x || "–").join(" × "))}</td><td class="num">${esc(p.weight_kg || "–")}</td><td>${esc(p.material)}</td><td class="num">${esc(p.lead_time_weeks ? `${p.lead_time_weeks} wk` : "–")}</td><td>${esc(p.status)}</td></tr>`).join("")}</tbody>
      </table></div>`;
  } else {
    try {
      const q = new URLSearchParams({ file: b.dataset.file, page: b.dataset.page, label: b.dataset.label });
      const src = await getJson(`/api/source?${q}`);
      if (popAnchor !== b) return;
      pop.innerHTML = `<div class="pop-title">${esc(src.file)}, page ${src.page}</div>
        <pre class="pop-lines">${src.lines.map(esc).join("\n")}</pre>
        <p class="fine">Text extracted from the PDF. The values were checked by hand against this page.</p>`;
    } catch (e) {
      pop.innerHTML = `<p>Couldn't load the source: ${esc(e.message)}</p>`;
    }
  }
  place(b);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".src[data-src]");
  if (b) {
    const wasOpen = b === popAnchor;
    closePop();
    if (!wasOpen) openPop(b);
    return;
  }
  if (!pop.contains(e.target)) closePop();
});

// ---------- Inbox: master–detail ----------

const inboxState = { filter: "all", q: "", hideHandled: false, selected: null };

const TOPIC = {
  dimensions: "Dimensions", seat_height: "Seat height", weight: "Weight", lead_time: "Lead time",
  material: "Material", colours: "Colours", dimmable: "Dimmable", certificates: "Certificates",
  com_fabric: "COM fabric", fabric_category: "Fabric category", leather: "Leather", outdoor: "Outdoor use",
  care: "Care", sealing: "Sealing", availability: "Availability", price: "Price",
};
const INTENT_TOPIC = {
  dimensions: "Dimensions", weight: "Weight", lead_time: "Lead time", price_list: "Price",
  certificate: "Certificates", material_finish: "Material", availability: "Availability", order: "Order",
};
const topic = (r) => (r.asked?.length
  ? r.asked.map((a) => TOPIC[a]).filter(Boolean)
  : (r.extraction?.intents ?? []).map((i) => INTENT_TOPIC[i]).filter(Boolean))[0] ?? "General";

const daysWaiting = (date) => Math.max(0, Math.floor((Date.now() - Date.parse(`${date}T00:00:00`)) / 86_400_000));

const searchText = (r) => [
  r.email.id, ...(r.identicalTo ?? []), r.email.subject, r.email.from_retailer,
  ...r.resolution.matches.flatMap((m) => [m.name, ...m.variants.map((v) => v.sku)]),
].join(" ").toLowerCase();

/** Rows after filter and search; handled rows only when not hidden (or asked for). */
function visibleRows(includeHandled = !inboxState.hideHandled) {
  const q = inboxState.q.trim().toLowerCase();
  return rows().filter((r) => (inboxState.filter === "all" || r.status === inboxState.filter)
    && (includeHandled || !isHandled(r))
    && (!q || searchText(r).includes(q)));
}

const goTo = (id) => location.replace(`#email/${encodeURIComponent(id)}`);

function queueItem(r) {
  const done = isHandled(r);
  const days = daysWaiting(r.email.date);
  return `
    <li>
      <a class="q-item${done ? " is-done" : ""}" href="#email/${encodeURIComponent(r.email.id)}"
        data-id="${esc(r.email.id)}" ${r.email.id === inboxState.selected ? `aria-current="true"` : ""}>
        <span class="q-line1">
          <span class="q-from">${esc(r.email.from_retailer)}${r.identicalTo?.length ? ` <span class="q-count num" title="${r.identicalTo.length + 1} emails in this conversation">${r.identicalTo.length + 1}</span>` : ""}</span>
          <span class="num q-wait${!done && days >= 10 ? " is-late" : ""}" title="Received ${esc(r.email.date)}">${done ? "" : `${days}d`}</span>
        </span>
        <span class="q-subject">${esc(r.email.subject || "(no subject)")}</span>
        <span class="q-meta">${done ? `<span class="st st-done">${ICON.check}<span>Handled</span></span>` : statusLabel(r.status)}<span class="sep">·</span>${esc(topic(r))}<span class="sep">·</span><span class="num">${esc(r.email.id)}</span></span>
      </a>
    </li>`;
}

function renderRail() {
  const all = rows();
  const counts = { all: all.length, red: 0, yellow: 0, green: 0 };
  for (const r of all) counts[r.status]++;
  document.getElementById("seg").innerHTML = [["all", "All"], ...STATUS_ORDER.slice().reverse().map((k) => [k, STATUS[k].tag])]
    .map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${inboxState.filter === k}">${esc(label)} <span class="num seg-count">${counts[k]}</span></button>`)
    .join("");

  const left = all.filter((r) => !isHandled(r)).length;
  const anyHandled = all.some(isHandled);
  document.getElementById("rail-meta").innerHTML = `
    <span>${plural(left, "email")} remaining</span>
    ${anyHandled ? `<button type="button" class="link" id="hide-handled" aria-pressed="${inboxState.hideHandled}">${inboxState.hideHandled ? "Show handled" : "Hide handled"}</button>` : ""}`;

  const list = visibleRows();
  // Handled emails sit under their own divider at the bottom, so open work is never mixed with done work.
  const firstDone = list.findIndex(isHandled);
  const doneCount = list.filter(isHandled).length;
  document.getElementById("queue").innerHTML = list.length
    ? list.map((r, i) => (i === firstDone ? `<li class="q-divider">${ICON.check}Handled <span class="num">${doneCount}</span></li>` : "") + queueItem(r)).join("")
    : `<li class="q-empty">${left || inboxState.q || inboxState.filter !== "all" ? "No emails match." : "All done. Nothing left in the inbox."}</li>`;
  document.querySelector(".q-item[aria-current]")?.scrollIntoView({ block: "nearest" });
}

function paneHtml(r) {
  const list = visibleRows();
  const i = list.indexOf(r);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 ? list[i + 1] : null;
  const done = isHandled(r);
  const extras = [
    r.identicalTo?.length ? `${r.identicalTo.length + 1} identical emails · one reply covers both` : "",
    r.sameQuestionAs?.length ? `Same question as ${esc(r.sameQuestionAs.join(", "))}` : "",
    r.redaction?.containsPersonalData ? "Personal data removed" : "",
  ].filter(Boolean);
  return `
    <a class="back link" href="#inbox">← Back to inbox</a>
    <header class="pane-head">
      <div class="pane-title">
        <p class="meta"><span class="num">${esc(r.email.id)}</span><span class="sep">·</span>${esc(r.email.from_retailer)}<span class="sep">·</span><span class="num">${esc(r.email.date)}</span><span class="sep">·</span>${statusLabel(r.status)}</p>
        <h1>${esc(r.email.subject || "(no subject)")}</h1>
        ${extras.length ? `<p class="meta">${extras.join(`<span class="sep">·</span>`)}</p>` : ""}
      </div>
      <div class="pane-controls">
        <span class="num muted">${i >= 0 ? `${i + 1} of ${list.length}` : `– of ${list.length}`}</span>
        <button type="button" class="btn btn-quiet" data-go="${esc(prev?.email.id ?? "")}" ${prev ? "" : "disabled"} aria-label="Previous email">Prev</button>
        <button type="button" class="btn btn-quiet" data-go="${esc(next?.email.id ?? "")}" ${next ? "" : "disabled"} aria-label="Next email">Next</button>
        <button type="button" class="btn btn-secondary" id="toggle-handled" aria-pressed="${done}">${done ? `${ICON.check}Handled` : "Mark handled"}</button>
      </div>
    </header>
    ${done ? `<div class="notice notice-done" role="note"><p class="notice-title">${ICON.check}<span>Handled</span></p>
      <p>You've already dealt with this email. <button type="button" class="link" id="undo-handled">Move it back to the inbox</button></p></div>` : notice(r)}
    <div class="work">
      <div class="work-left">
        <section aria-label="Retailer message">
          ${thread(r)}
          ${r.redaction?.containsPersonalData ? `<p class="fine">Removed before anything else saw this email: ${esc(r.redaction.redactedFields.join(", "))}.</p>` : ""}
        </section>
        <hr>
        ${catalogBlock(r)}
      </div>
      <div class="work-right">
        ${draftBlock(r, { inbox: true })}
      </div>
    </div>`;
}

/** One message, or the whole conversation (oldest first) when identical emails were grouped. */
function thread(r) {
  const ids = [r.email.id, ...(r.identicalTo ?? [])];
  if (ids.length === 1) return `<h2 class="label">Retailer message</h2><div class="prose">${emailBody(r.email.body)}</div>`;
  const msgs = ids.map((id) => resultsCache.find((x) => x.email.id === id)?.email).filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return `<h2 class="label">Retailer messages <span class="muted">(${msgs.length})</span></h2>
    <div class="thread">${msgs.map((e) => `
      <article class="msg">
        <p class="msg-head"><strong>${esc(e.from_retailer)}</strong><span class="sep">·</span><span class="num">${esc(e.id)}</span><span class="sep">·</span><span class="num">${esc(e.date)}</span></p>
        <div class="prose">${emailBody(e.body)}</div>
      </article>`).join("")}
    </div>`;
}

/** The next open email below this one, else the first open one (read before it moves to "Handled"). */
function nextOpenAfter(r) {
  const list = visibleRows(true);
  const i = list.indexOf(r);
  return list.slice(i + 1).find((x) => x !== r && !isHandled(x)) ?? list.find((x) => x !== r && !isHandled(x));
}

function renderPane(r) {
  const pane = document.getElementById("pane");
  closePop();
  popResult = r;
  pane.innerHTML = paneHtml(r);
  pane.scrollTop = 0;
  // "Copy & mark handled": mark it, then straight on to the next open email.
  const onHandled = () => {
    const next = nextOpenAfter(r);
    setHandled(r, true);
    renderRail();
    if (next) goTo(next.email.id);
    else location.hash = "#inbox"; // nothing left: back to the list
  };
  wireDraft(r, { onHandled });
  pane.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => b.dataset.go && goTo(b.dataset.go)));
  const toggle = () => {
    setHandled(r, !isHandled(r));
    renderRail();
    renderPane(r);
  };
  document.getElementById("toggle-handled").onclick = toggle;
  const undo = document.getElementById("undo-handled");
  if (undo) undo.onclick = toggle;
}

function wireShell() {
  const q = document.getElementById("q");
  q.value = inboxState.q;
  q.oninput = () => { inboxState.q = q.value; renderRail(); };
  document.getElementById("pane").addEventListener("scroll", closePop, { passive: true }); // popover is page-positioned
  document.getElementById("split").addEventListener("click", (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { inboxState.filter = f.dataset.filter; renderRail(); return; }
    if (e.target.closest("#hide-handled")) { inboxState.hideHandled = !inboxState.hideHandled; renderRail(); }
  });
}

async function inboxView(id) {
  const at = location.hash;
  const results = await loadResults();
  if (location.hash !== at) return; // the user moved on while this loaded
  updateNavCounts();
  if (!results.length) {
    app.innerHTML = `<div class="empty"><h1>No results yet</h1><p>Run <code>npm run batch</code> in <code>server/</code>, then reload.</p></div>`;
    return;
  }
  let r = id ? results.find((x) => x.email.id === id) : null;
  if (id && !r) {
    app.innerHTML = `<div class="empty"><h1>Email ${esc(id)} not found</h1><p><a class="link" href="#inbox">Back to inbox</a></p></div>`;
    return;
  }
  // #inbox is just the list; an email opens beside it only once one is chosen.
  if (r?.duplicateOf) r = results.find((x) => x.email.id === r.duplicateOf) ?? r; // opens its conversation
  inboxState.selected = r?.email.id ?? null;

  if (!document.getElementById("split")) {
    app.innerHTML = `
      <div class="split" id="split">
        <aside class="rail" aria-label="Email queue">
          <div class="rail-head">
            <input type="search" id="q" placeholder="Search retailer, SKU, product…" aria-label="Search emails" autocomplete="off">
            <div class="seg" id="seg" role="group" aria-label="Filter by status"></div>
            <div class="rail-meta" id="rail-meta"></div>
          </div>
          <ul class="queue" id="queue"></ul>
        </aside>
        <section class="pane" id="pane" aria-label="Selected email"></section>
      </div>`;
    wireShell();
  }
  const split = document.getElementById("split");
  if (split.classList.contains("has-selection") !== Boolean(r)) window.scrollTo(0, 0); // list <-> split switch
  split.classList.toggle("has-selection", Boolean(r));
  renderRail();
  if (r) renderPane(r);
  else { closePop(); document.getElementById("pane").innerHTML = ""; }
}

// ArrowUp / ArrowDown move through the queue when not typing.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!pop.hidden) { closePop(); return; }
    // Esc closes the open email and goes back to the plain list.
    if (inboxState.selected && document.getElementById("split") && !e.target.closest?.("input, textarea, select")) location.hash = "#inbox";
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (!document.getElementById("split")) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const list = visibleRows();
  if (!list.length) return;
  e.preventDefault();
  const i = list.findIndex((r) => r.email.id === inboxState.selected);
  const next = e.key === "ArrowDown" ? list[Math.min(list.length - 1, i + 1)] : list[Math.max(0, i - 1)];
  if (next && next.email.id !== inboxState.selected) goTo(next.email.id);
});

// ---------- Draft from Email ----------

const EXAMPLES = [
  { label: "Dimensions", subject: "Dimensions Atlas Coffee Table", body: "Hi,\nCould you confirm the exact dimensions of the Atlas Coffee Table 60x60 in fumed oak?\nThanks" },
  { label: "Ambiguous variant", subject: "Atlas Stool weight", body: "Hello,\nHow much does the Atlas Stool in espresso weigh, with and without packaging?\nBest regards" },
  { label: "Personal data", subject: "Delivery", body: "Hi,\nPlease deliver one Knot Rug 200x300 in off-white to our customer: Jens Hansen, Nørrebrogade 12, 2200 København, phone +45 30 12 34 56.\nThanks" },
];
const tryState = { subject: "", body: "" };

/** A rough early hint only; the server does the real removal. */
function piiHint(text) {
  const found = [];
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) found.push("email addresses");
  if (/\+?\d[\d\s-]{7,}\d/.test(text)) found.push("phone numbers");
  if (/\b\p{L}+(gade|vej|straat|weg|stra(ss|ß)e|street|road|allé|plads)\s+\d+/iu.test(text) || /\b\d{4,5}\s+\p{Lu}\p{L}+/u.test(text)) found.push("addresses");
  if (/\b(customer|client|kunde)\s*:?\s+\p{Lu}\p{L}+\s+\p{Lu}\p{L}+/u.test(text)) found.push("names");
  return found;
}

const REDACTED_WORDS = {
  NAME: ["name", "names"], ADDRESS: ["street address", "street addresses"],
  "POSTCODE CITY": ["postcode and city", "postcodes and cities"], PHONE: ["phone number", "phone numbers"],
  EMAIL: ["email address", "email addresses"], "PERSONAL ID": ["personal ID", "personal IDs"],
};
function redactionSummary(r) {
  const counts = {};
  for (const m of r.email.body.matchAll(/\[(NAME|ADDRESS|POSTCODE CITY|PHONE|EMAIL|PERSONAL ID)\]/g)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${REDACTED_WORDS[k][n === 1 ? 0 : 1]}`);
  return parts.length ? `Removed before AI: ${parts.join(", ")}` : "No personal data found";
}

// The pipeline runs in this order; the steps are shown while the server works (one request).
const TRY_STEPS = [
  [0, "Removing personal data…"],
  [600, "Looking up products…"],
  [1500, "Drafting the reply…"],
  [12000, "The AI is slow. After 20 seconds you'll get the facts without a draft."],
];

function tryPage() {
  // Two states: centred and roomy while writing; after a result the email moves left (compact)
  // and the triage, catalog data and draft take the right.
  app.innerHTML = `
    <div class="page try" id="try">
      <section class="try-input" aria-label="Email to draft from">
        <div class="try-head">
          <h1>Draft from email</h1>
          <button type="button" class="link try-clear" id="t-clear">New email</button>
        </div>
        <p class="lede">Paste a retailer question. Personal details are removed before anything goes to the AI, and nothing is stored.</p>
        <form id="tryform" class="form">
          <div class="examples">
            <span class="label">Examples</span>
            ${EXAMPLES.map((e, i) => `<button type="button" class="btn btn-quiet btn-sm" data-example="${i}">${esc(e.label)}</button>`).join("")}
          </div>
          <label class="field"><span class="label">Subject <span class="muted">(optional)</span></span>
            <input id="t-subject" maxlength="300" value="${esc(tryState.subject)}"></label>
          <label class="field"><span class="label">Email text</span>
            <textarea id="t-body" rows="12" maxlength="5000" required placeholder="Hi, could you confirm the dimensions of…">${esc(tryState.body)}</textarea></label>
          <p class="pii-hint" id="pii-hint" hidden></p>
          <div class="actions">
            <button class="btn" type="submit" id="t-go">Draft a reply</button>
            <span class="helper" id="t-status" role="status" aria-live="polite"></span>
          </div>
        </form>
        <section class="how" aria-label="How every email is checked">
          <h2 class="label">How every email is checked</h2>
          <dl>
            <div><dt>${statusLabel("green", true)}</dt><dd>Every requested dimension or spec matches products.csv and the fact sheet.</dd></div>
            <div><dt>${statusLabel("yellow", true)}</dt><dd>Partial match, missing detail, or catalog disagreement flagged for review.</dd></div>
            <div><dt>${statusLabel("red", true)}</dt><dd>Pricing, orders, certificates, or personal data detected.</dd></div>
          </dl>
        </section>
      </section>
      <section class="try-result" id="t-result" aria-label="Triage and draft" hidden></section>
    </div>`;

  const page = document.getElementById("try");
  const out = document.getElementById("t-result");
  document.getElementById("t-clear").onclick = () => {
    page.classList.remove("has-result");
    out.hidden = true;
    out.innerHTML = "";
    closePop();
    document.getElementById("t-subject").value = "";
    document.getElementById("t-body").value = "";
    tryState.subject = tryState.body = "";
    document.getElementById("pii-hint").hidden = true;
    document.getElementById("t-subject").focus();
  };

  const subject = document.getElementById("t-subject");
  const body = document.getElementById("t-body");
  const hint = document.getElementById("pii-hint");
  const showHint = () => {
    const found = piiHint(`${subject.value}\n${body.value}`);
    hint.hidden = !found.length;
    hint.innerHTML = found.length ? `${ICON.alert}<span>Looks like this contains personal details (${esc(found.join(", "))}). They're removed before the text is sent to the AI.</span>` : "";
  };
  subject.oninput = body.oninput = showHint;
  showHint();
  app.querySelectorAll("[data-example]").forEach((b) => (b.onclick = () => {
    const e = EXAMPLES[b.dataset.example];
    subject.value = e.subject;
    body.value = e.body;
    showHint();
    body.focus();
  }));

  document.getElementById("tryform").onsubmit = async (ev) => {
    ev.preventDefault();
    tryState.subject = subject.value;
    tryState.body = body.value;
    const go = document.getElementById("t-go");
    const status = document.getElementById("t-status");
    go.disabled = true;
    const timers = TRY_STEPS.map(([ms, text]) => setTimeout(() => (status.textContent = text), ms));
    try {
      const r = await getJson("/api/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.value, body: body.value }),
      });
      draftEdits.delete(r.email.id);
      closePop();
      popResult = r;
      out.innerHTML = `
        <p class="meta">${statusLabel(r.status, true)}<span class="fine block">${esc(redactionSummary(r))}</span></p>
        ${r.aiTimedOut ? `<div class="notice notice-check" role="note"><p>The AI took longer than 20 seconds, so this is the facts-only version. Try again in a minute for a drafted reply.</p></div>` : ""}
        ${notice(r)}
        ${catalogBlock(r)}
        <hr>
        ${draftBlock(r, { inbox: false })}`;
      out.hidden = false;
      page.classList.add("has-result");
      wireDraft(r);
      status.textContent = "";
      if (window.matchMedia("(max-width: 899px)").matches) out.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      status.textContent = `Something went wrong: ${e.message}`;
    } finally {
      timers.forEach(clearTimeout);
      go.disabled = false;
    }
  };
}

// ---------- Catalog Issues ----------

const KIND = {
  mismatch: "Values disagree",
  packed_as_net: "Packed weight stored as net weight",
  weight_wrong: "Weight looks wrong",
  implausible: "Looks implausible",
  csv_inconsistent: "Inconsistent inside products.csv",
  not_on_sheet: "Variant missing from fact sheet",
  missing: "Missing values",
};
const SEVERITY = { wrong: "Wrong value", inconsistent: "Inconsistent", missing: "Missing", cosmetic: "Cosmetic" };
const issuesState = { kind: "all" };

const emailLinks = (ids) => ids.map((id) => `<a class="link num" href="#email/${encodeURIComponent(id)}">${esc(id)}</a>`).join(", ");

/** One row per SKU, for the product data owner's spreadsheet. */
function issuesCsv(groups) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const out = [["Product", "SKU", "Variant", "Type", "Severity", "Issue", "Affects emails"]];
  for (const g of groups) {
    for (const s of g.skus) out.push([g.product, s.sku, s.variant, KIND[g.kind], SEVERITY[g.severity], s.message, g.affects.join(" ")]);
  }
  return out.map((r) => r.map(cell).join(",")).join("\r\n");
}

async function issues() {
  const at = location.hash;
  const report = await loadIssues();
  if (location.hash !== at) return; // the user moved on while this loaded
  updateNavCounts();
  const { totals, top, allAffecting, yellowNotFromData, groups } = report;
  const counts = {};
  for (const g of groups) counts[g.kind] = (counts[g.kind] ?? 0) + 1;

  app.innerHTML = `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Catalog issues</h1>
          <p class="lede">
            ${plural(totals.issues, "problem")} in ${plural(totals.products, "product")}, grouped into ${plural(totals.groups, "fix", "fixes")}, most important first.
            Fixing the top ${top.count} would turn ${plural(top.fixesEmails.length, "email")} from Check to Ready${top.fixesEmails.length ? ` (${emailLinks(top.fixesEmails)})` : ""};
            fixing all ${allAffecting.count} that affect emails would turn ${allAffecting.fixesEmails.length} Ready${allAffecting.fixesEmails.length ? ` (${emailLinks(allAffecting.fixesEmails)})` : ""}.
            ${yellowNotFromData ? `The other ${plural(yellowNotFromData, "Check email")} ${yellowNotFromData === 1 ? "is" : "are"} waiting on information that isn't in the data at all, such as lead times and seat heights.` : ""}
            Fixes made in the product data carry through to this tool, the website and retailers' feeds.
          </p>
        </div>
        <button class="btn btn-secondary" id="export" type="button">Export CSV</button>
      </header>
      <div class="seg seg-wrap" role="group" aria-label="Filter by type">
        <button type="button" data-kind="all" aria-pressed="${issuesState.kind === "all"}">All <span class="num seg-count">${groups.length}</span></button>
        ${Object.entries(KIND).filter(([k]) => counts[k]).map(([k, label]) => `
          <button type="button" data-kind="${k}" aria-pressed="${issuesState.kind === k}">${esc(label)} <span class="num seg-count">${counts[k]}</span></button>`).join("")}
      </div>
      <div class="table-wrap issues-card"><table class="issues">
        <thead><tr><th>Product &amp; issue</th><th>Type</th><th>Severity</th><th>Emails</th></tr></thead>
        <tbody id="issue-rows"></tbody>
      </table></div>
    </div>`;

  const render = () => {
    const shown = groups.filter((g) => issuesState.kind === "all" || g.kind === issuesState.kind);
    document.getElementById("issue-rows").innerHTML = shown.map((g) => `
      <tr>
        <td>
          <div class="issue-title">${esc(g.title)}</div>
          <div class="issue-text">${esc(g.message)}</div>
          ${g.skus.length > 1 ? `<details class="issue-skus"><summary><span class="num">${g.skus.length}</span> SKUs</summary>
            <ul>${g.skus.map((s) => `<li><span class="num">${esc(s.sku)}</span> ${esc(s.variant || "")}${new Set(g.skus.map((x) => x.message)).size > 1 ? `: ${esc(s.message)}` : ""}</li>`).join("")}</ul>
          </details>` : `<div class="fine">SKU <span class="num">${esc(g.skus[0].sku)}</span></div>`}
        </td>
        <td class="cell-muted">${esc(KIND[g.kind])}</td>
        <td><span class="sev sev-${g.severity}">${g.severity === "wrong" || g.severity === "inconsistent" ? ICON.alert : ""}${esc(SEVERITY[g.severity])}</span></td>
        <td>${g.affects.length ? emailLinks(g.affects) : `<span class="muted">none</span>`}</td>
      </tr>`).join("") || `<tr><td colspan="4" class="muted">No issues of this type.</td></tr>`;
  };
  render();

  app.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => {
    issuesState.kind = b.dataset.kind;
    app.querySelectorAll("[data-kind]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  }));
  document.getElementById("export").onclick = () => {
    const blob = new Blob(["﻿" + issuesCsv(groups)], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "newworks-data-issues.csv" });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };
}

// ---------- router ----------

async function route() {
  const [page, arg] = (location.hash.slice(1) || "inbox").split("/");
  const nav = page === "email" ? "inbox" : page;
  document.querySelectorAll("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === nav ? "page" : "false"));
  const stayInInbox = (page === "email" || page === "inbox") && document.getElementById("split");
  if (!stayInInbox) closePop();
  try {
    if (page === "email") await inboxView(decodeURIComponent(arg ?? ""));
    else if (page === "try") tryPage();
    else if (page === "issues") await issues();
    else await inboxView(null);
  } catch (e) {
    app.innerHTML = `<div class="empty"><h1>Something went wrong</h1><p>${esc(e.message)}</p></div>`;
  }
  if (!stayInInbox) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
route();
// Tab counts, whichever page opens first.
loadResults().then(updateNavCounts, () => {});
loadIssues().then(updateNavCounts, () => {});
