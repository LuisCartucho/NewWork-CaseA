// Plain JS, no build step. Hash routing:
//   #inbox · #email/M001 · #try · #issues
// Every piece of data is escaped with esc() before it goes into innerHTML.
const app = document.getElementById("app");

// Status in action words, never colour names. Order = the order sections appear in.
const STATUS = {
  red: { label: "Needs a person", tag: "Person", heading: "What needs a person", icon: "!" },
  yellow: { label: "Check before sending", tag: "Check", heading: "What to check", icon: "?" },
  green: { label: "Ready to send", tag: "Ready", heading: "Why it's ready", icon: "✓" },
};
const STATUS_ORDER = ["red", "yellow", "green"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

// Results are loaded once per page load and reused by Inbox and Email detail.
let resultsCache = null;
const loadResults = async () => (resultsCache ??= await getJson("/api/results"));

// ---------- shared pieces ----------

/** The one status component (inbox row, detail header, try page): icon + words + colour. */
const statusBadge = (status, size = "full") =>
  `<span class="status status-${status}"><span class="status-icon" aria-hidden="true">${STATUS[status].icon}</span>${esc(size === "tag" ? STATUS[status].tag : STATUS[status].label)}</span>`;

/** Header tags on the detail page. The AI provider is shown under the draft, not here. */
const badges = (r) => [
  r.identicalTo?.length ? `<span class="tag tag-strong">Identical to ${esc(r.identicalTo.join(", "))}</span>` : "",
  r.sameQuestionAs?.length ? `<span class="tag">Same question as ${esc(r.sameQuestionAs.join(", "))}</span>` : "",
  r.redaction?.containsPersonalData ? `<span class="tag tag-warn">Personal data removed</span>` : "",
].join("");

/** Redacted body: [PHONE]-style tokens shown as small grey "phone number removed" tags. */
const REDACTED = {
  NAME: "name removed", ADDRESS: "address removed", "POSTCODE CITY": "postcode and city removed",
  PHONE: "phone number removed", EMAIL: "email address removed", "PERSONAL ID": "personal ID removed",
};
const emailBody = (text) => esc(text).replace(/\[(NAME|ADDRESS|POSTCODE CITY|PHONE|EMAIL|PERSONAL ID)\]/g,
  (_, k) => `<span class="redacted">${REDACTED[k]}</span>`);

/** Product name without the "Product: " prefix used in fact labels. */
const factLabel = (label) => label.replace(/^[^:]+:\s*/, "");

/** "products.csv SKU 42710, 42711; Atlas … Fact Sheet.pdf p.2" -> clickable source pills. */
function sourcePills(f) {
  return f.source.split("; ").map((part) => {
    const csv = part.match(/^products\.csv SKU (.+)$/);
    const sheet = part.match(/^(.+\.pdf) p\.(\d+)$/);
    if (csv) {
      const skus = csv[1].split(", ");
      const shown = skus.length > 2 ? `${skus[0]} +${skus.length - 1}` : skus.join(", ");
      return `<button type="button" class="src" data-src="csv" data-skus="${esc(skus.join(","))}" aria-haspopup="dialog">products.csv · ${esc(shown)}</button>`;
    }
    if (sheet) {
      return `<button type="button" class="src" data-src="sheet" data-file="${esc(sheet[1])}" data-page="${sheet[2]}" data-label="${esc(f.label)}" aria-haspopup="dialog">Fact sheet · p.${sheet[2]}</button>`;
    }
    return `<span class="src src-plain">${esc(part)}</span>`;
  }).join("");
}

/** One line per variant: "42220 · Covent Club Chair · COM". */
function productCard(r) {
  if (!r.resolution.matches.length) return `<p class="muted">No product from our range recognised.</p>`;
  return r.resolution.matches.map((m) => {
    const line = (p) => `<li><code>${esc(p.sku)}</code> · ${esc(m.name)}${p.variant ? ` · ${esc(p.variant)}` : ""}${
      p.status !== "active" ? ` <span class="tag tag-warn">${esc(p.status)}</span>` : ""}</li>`;
    return `
      <div class="product">
        <ul class="skus">${m.variants.map(line).join("")}</ul>
        <span class="tag ${m.variants.length === 1 ? "tag-ok" : "tag-warn"}">${m.variants.length === 1 ? "Exact SKU" : `${m.variants.length} variants possible: not specified`}</span>
      </div>`;
  }).join("");
}

/** "Before sending": one item per flag action. Green with nothing open: read once and send. */
function checklist(r) {
  const items = [...new Set(r.flags.map((f) => f.action).filter(Boolean))];
  if (!items.length) items.push("Read the draft once and send");
  return items;
}

function detail(r) {
  const byProduct = new Map();
  for (const f of r.facts) {
    const product = f.label.split(":")[0];
    if (!byProduct.has(product)) byProduct.set(product, []);
    byProduct.get(product).push(f);
  }
  const checks = checklist(r);

  return `
  <article class="detail">
    <header class="detail-head">
      <div class="eyebrow">${esc(r.email.id)} · ${esc(r.email.from_retailer)} · ${esc(r.email.date)}</div>
      <h1>${esc(r.email.subject || "(no subject)")}</h1>
      <div class="row gap wrap">${statusBadge(r.status)} ${badges(r)}</div>
    </header>

    <section class="card flags flags-${r.status}" aria-label="${esc(STATUS[r.status].heading)}">
      <h2>${esc(STATUS[r.status].heading)}</h2>
      <ul>${r.flags.map((f) => `<li class="flag flag-${f.level}"><span class="status-icon" aria-hidden="true">${STATUS[f.level].icon}</span><span>${esc(f.reason)}</span></li>`).join("")}</ul>
    </section>

    <!-- Workflow order: email -> facts -> draft. Three columns on wide screens, stacked otherwise. -->
    <div class="detail-grid">
      <section class="card" aria-label="Email">
        <h2>Email</h2>
        <blockquote class="email">${emailBody(r.email.body)}</blockquote>
        ${r.redaction?.containsPersonalData ? `<p class="muted small">Removed before anything else saw this email: ${esc(r.redaction.redactedFields.join(", "))}.</p>` : ""}
      </section>

      <section class="card" aria-label="Facts found">
        <h2>Facts found</h2>
        ${productCard(r)}
        ${r.facts.length ? [...byProduct].map(([product, facts]) => `
          ${byProduct.size > 1 ? `<h3>${esc(product)}</h3>` : ""}
          <dl class="facts">${facts.map((f) => `
            <div class="fact${f.doubt ? " fact-doubt" : ""}">
              <dt>${esc(factLabel(f.label))}</dt>
              <dd>
                <div class="fact-value">${esc(f.value)}</div>
                ${f.doubt ? `<div class="fact-note">Not trusted: ${esc(f.doubt)}</div>` : ""}
                <div class="srcs">${sourcePills(f)}</div>
              </dd>
            </div>`).join("")}
          </dl>`).join("") : `<p class="muted">No facts found.</p>`}
        ${r.missing?.length ? `
          <h3>Not in our data</h3>
          <ul class="plain">${r.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
        ${r.conflicts.length ? `
          <h3>Sources disagree</h3>
          <ul class="plain small">${r.conflicts.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      </section>

      <section class="card" aria-label="Draft reply">
        <h2>Draft reply</h2>
        <textarea id="draft" class="draft" rows="6" aria-label="Draft reply">${esc(r.draft)}</textarea>
        <p class="ai-line">${r.aiUsed
          ? `Drafted by ${esc(r.ai?.draft ?? "AI")} · every number checked against our data`
          : "AI unavailable. Facts only, no draft: write the reply from the facts."}</p>
        <fieldset class="checklist">
          <legend>Before sending</legend>
          ${checks.map((c, i) => `<label><input type="checkbox" class="check" id="check-${i}"> <span>${esc(c)}</span></label>`).join("")}
        </fieldset>
        <div class="row gap wrap">
          <button class="btn" id="copy" disabled>Copy draft</button>
          <span class="small" id="copied" role="status"></span>
        </div>
      </section>
    </div>
    <div id="popover" class="popover" role="dialog" aria-modal="false" hidden></div>
  </article>`;
}

/** Draft box, checklist gate on Copy, and source popovers. */
function wireDetail(r) {
  const draft = document.getElementById("draft");
  const btn = document.getElementById("copy");
  const note = document.getElementById("copied");
  if (!draft || !btn) return;

  const grow = () => { draft.style.height = "auto"; draft.style.height = `${draft.scrollHeight + 2}px`; };
  draft.addEventListener("input", grow);
  grow();

  // The draft never looks send-ready while checks are open.
  const checks = [...document.querySelectorAll(".check")];
  const update = () => {
    const open = checks.filter((c) => !c.checked).length;
    btn.disabled = open > 0;
    note.textContent = open ? `${open} check${open === 1 ? "" : "s"} open: tick them to copy` : "";
  };
  checks.forEach((c) => c.addEventListener("change", update));
  update();

  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(draft.value);
      note.textContent = "Copied.";
    } catch {
      draft.select();
      note.textContent = "Press Ctrl+C to copy.";
    }
  };

  // Source pills: show the csv row or the fact sheet lines.
  const pop = document.getElementById("popover");
  const close = () => { pop.hidden = true; document.querySelector(".src[aria-expanded='true']")?.setAttribute("aria-expanded", "false"); };
  document.querySelectorAll(".src[data-src]").forEach((b) => (b.onclick = async (ev) => {
    ev.stopPropagation();
    const wasOpen = b.getAttribute("aria-expanded") === "true";
    close();
    if (wasOpen) return;
    b.setAttribute("aria-expanded", "true");
    pop.innerHTML = `<p class="muted small">Loading…</p>`;
    place(pop, b);
    pop.hidden = false;
    if (b.dataset.src === "csv") {
      const rows = b.dataset.skus.split(",").map((sku) => r.resolution.candidates.find((p) => p.sku === sku)).filter(Boolean);
      pop.innerHTML = `<div class="pop-title">products.csv</div>
        <div class="table-wrap"><table class="pop-table">
          <thead><tr><th>SKU</th><th>Variant</th><th>W × D × H cm</th><th>Weight kg</th><th>Material</th><th>Lead time</th><th>Status</th></tr></thead>
          <tbody>${rows.map((p) => `<tr><td><code>${esc(p.sku)}</code></td><td>${esc(p.variant)}</td><td>${esc([p.width_cm, p.depth_cm, p.height_cm].map((x) => x || "–").join(" × "))}</td><td>${esc(p.weight_kg || "–")}</td><td>${esc(p.material)}</td><td>${esc(p.lead_time_weeks ? `${p.lead_time_weeks} weeks` : "–")}</td><td>${esc(p.status)}</td></tr>`).join("")}</tbody>
        </table></div>`;
    } else {
      try {
        const q = new URLSearchParams({ file: b.dataset.file, page: b.dataset.page, label: b.dataset.label });
        const src = await getJson(`/api/source?${q}`);
        pop.innerHTML = `<div class="pop-title">${esc(src.file)}, page ${src.page}</div>
          <pre class="pop-lines">${src.lines.map(esc).join("\n")}</pre>
          <p class="muted small">Text extracted from the PDF. The value above was checked by hand against this page.</p>`;
      } catch (e) {
        pop.innerHTML = `<p class="small">Couldn't load the source: ${esc(e.message)}</p>`;
      }
    }
    place(pop, b);
  }));
  document.addEventListener("click", (e) => { if (!pop.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

/** Position the popover under its pill, inside the viewport. */
function place(pop, anchor) {
  const a = anchor.getBoundingClientRect();
  const width = Math.min(560, window.innerWidth - 32);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(16, Math.min(a.left + window.scrollX, window.scrollX + window.innerWidth - width - 16))}px`;
  pop.style.top = `${a.bottom + window.scrollY + 6}px`;
}

// ---------- pages ----------

const inboxState = { filter: "all", q: "" };

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

/** 1–2 tags: "Lead time · Covent", "COM fabric". */
function topicTags(r) {
  const topics = r.asked?.length
    ? r.asked.map((a) => TOPIC[a]).filter(Boolean)
    : (r.extraction?.intents ?? []).map((i) => INTENT_TOPIC[i]).filter(Boolean);
  const product = [...new Set(r.resolution.matches.map((m) => m.name.split(" ")[0]))].join(" + ");
  const first = topics[0] ? `${topics[0]}${product ? ` · ${product}` : ""}` : product;
  return [first, topics[1]].filter(Boolean);
}

/** For green rows: the answer itself, e.g. "Ø90 × 17 cm" or "250 × 95 × 74 cm · seat 40 cm". */
function answerPreview(r) {
  const v = (name) => r.facts.find((f) => factLabel(f.label).replace(/ \(.*$/, "") === name)?.value;
  const num = (s) => s?.match(/^[\d.\-]+/)?.[0];
  const [dia, w, d, h] = ["Diameter", "Width", "Depth", "Height"].map(v);
  const parts = [];
  if (dia && h) parts.push(`Ø${num(dia)} × ${num(h)} cm`);
  else if (w && d && h) parts.push(`${num(w)} × ${num(d)} × ${num(h)} cm`);
  if (v("Seat height")) parts.push(`seat ${v("Seat height")}`);
  if (v("Net weight")) parts.push(v("Net weight"));
  // Otherwise the facts that answer the question; general material text last.
  const rest = [...r.facts].sort((a, b) => /^Material/.test(factLabel(a.label)) - /^Material/.test(factLabel(b.label)));
  if (!parts.length) parts.push(...rest.slice(0, 2).map((f) => `${factLabel(f.label)}: ${f.value}`));
  return parts.join(" · ");
}

const daysWaiting = (date) => Math.max(0, Math.floor((Date.now() - Date.parse(`${date}T00:00:00`)) / 86_400_000));
const waitingLabel = (days) => (days === 0 ? "today" : `waiting ${days} day${days === 1 ? "" : "s"}`);

function inboxRow(r) {
  const days = daysWaiting(r.email.date);
  const tags = [
    ...topicTags(r).map((t) => `<span class="tag">${esc(t)}</span>`),
    r.identicalTo?.length ? `<span class="tag tag-strong">${r.identicalTo.length + 1} identical emails</span>` : "",
    r.sameQuestionAs?.length ? `<span class="tag">Same question as ${esc(r.sameQuestionAs.join(", "))}</span>` : "",
    r.redaction?.containsPersonalData ? `<span class="tag tag-warn">Personal data removed</span>` : "",
  ].join("");
  const line = r.status === "green" ? answerPreview(r) : (r.flags[0]?.short ?? r.flags[0]?.reason);
  return `
    <li>
      <a class="mail mail-${r.status}" href="#email/${encodeURIComponent(r.email.id)}">
        <span class="mail-status">${statusBadge(r.status, "tag")}</span>
        <span class="mail-main">
          <span class="mail-top">
            <span class="mail-from">${esc(r.email.from_retailer)}</span>
            <span class="mail-wait${days > 7 ? " overdue" : ""}" title="Received ${esc(r.email.date)}">${waitingLabel(days)}</span>
          </span>
          <span class="mail-subject"><span class="mail-id">${esc(r.email.id)}</span> ${esc(r.email.subject)}</span>
          <span class="mail-line${r.status === "green" ? " mail-answer" : ""}" title="${esc(r.flags[0]?.reason ?? "")}">${esc(line)}</span>
          <span class="mail-tags">${tags}</span>
        </span>
      </a>
    </li>`;
}

async function inbox() {
  const at = location.hash;
  const results = await loadResults();
  if (location.hash !== at) return; // the user moved on while this loaded: don't draw over the new page
  if (!results.length) {
    app.innerHTML = `<div class="empty"><h1>No results yet</h1><p>Run <code>npm run batch</code> in <code>server/</code>, then reload.</p></div>`;
    return;
  }
  // Counts are per email (adds up to the total); identical emails are shown as one row.
  const counts = { all: results.length, red: 0, yellow: 0, green: 0 };
  for (const r of results) counts[r.status]++;

  app.innerHTML = `
    <div class="page-head">
      <h1>Inbox</h1>
      <p class="trust">Drafts only. Every answer comes from products.csv and the fact sheets, with its source.
        Prices, orders and personal data always go to a person.</p>
    </div>
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Show">
        <button class="chip" data-filter="all" aria-pressed="${inboxState.filter === "all"}">All <span class="count">${counts.all}</span></button>
        ${STATUS_ORDER.map((k) => `
          <button class="chip chip-${k}" data-filter="${k}" aria-pressed="${inboxState.filter === k}">
            <span class="status-icon" aria-hidden="true">${STATUS[k].icon}</span>${esc(STATUS[k].label)} <span class="count">${counts[k]}</span>
          </button>`).join("")}
      </div>
      <input type="search" id="q" placeholder="Search subject, retailer, product…" value="${esc(inboxState.q)}" aria-label="Search">
    </div>
    <div id="list"></div>`;

  const render = () => {
    const q = inboxState.q.toLowerCase();
    const matches = (r) => !q || [r.email.id, r.email.subject, r.email.from_retailer, ...r.resolution.matches.map((m) => m.name)]
      .join(" ").toLowerCase().includes(q);
    const html = STATUS_ORDER
      .filter((k) => inboxState.filter === "all" || inboxState.filter === k)
      .map((k) => {
        const all = results.filter((r) => r.status === k && matches(r));
        // One row per identical group (the first email); oldest first.
        const rows = all.filter((r) => !r.duplicateOf).sort((a, b) => a.email.date.localeCompare(b.email.date) || a.email.id.localeCompare(b.email.id));
        if (!all.length) return "";
        return `
          <section class="inbox-section inbox-${k}" aria-label="${esc(STATUS[k].label)}">
            <h2>${statusBadge(k)} <span class="count">${all.length}</span></h2>
            <ul class="inbox">${rows.map(inboxRow).join("")}</ul>
          </section>`;
      }).join("");
    document.getElementById("list").innerHTML = html || `<p class="muted empty-row">No emails match.</p>`;
  };
  render();

  app.querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => {
    inboxState.filter = b.dataset.filter;
    app.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  }));
  document.getElementById("q").oninput = (e) => { inboxState.q = e.target.value; render(); };
}

async function emailPage(id) {
  const at = location.hash;
  const results = await loadResults();
  if (location.hash !== at) return; // the user moved on while this loaded: don't draw over the new page
  const r = results.find((x) => x.email.id === id);
  if (!r) { app.innerHTML = `<p>Email ${esc(id)} not found. <a href="#inbox">Back to inbox</a></p>`; return; }
  // Same order as the inbox section: same status, oldest first, identical emails shown once.
  const section = results
    .filter((x) => x.status === r.status && (!x.duplicateOf || x === r))
    .sort((a, b) => a.email.date.localeCompare(b.email.date) || a.email.id.localeCompare(b.email.id));
  const i = section.indexOf(r);
  const prev = section[i - 1], next = section[i + 1];
  app.innerHTML = `
    <nav class="row between crumbs" aria-label="Email navigation">
      <a href="#inbox">← Inbox</a>
      <span class="row gap small">
        <span class="muted">${esc(STATUS[r.status].label)} · ${i + 1} of ${section.length}</span>
        ${prev ? `<a href="#email/${encodeURIComponent(prev.email.id)}">‹ ${esc(prev.email.id)}</a>` : `<span class="muted">‹ previous</span>`}
        ${next ? `<a href="#email/${encodeURIComponent(next.email.id)}">${esc(next.email.id)} ›</a>` : `<span class="muted">next ›</span>`}
      </span>
    </nav>
    ${detail(r)}`;
  wireDetail(r);
}

const EXAMPLES = [
  { label: "Dimensions", subject: "Dimensions Atlas Coffee Table", body: "Hi,\nCould you confirm the exact dimensions of the Atlas Coffee Table 60x60 in fumed oak?\nThanks" },
  { label: "Ambiguous variant", subject: "Atlas Stool weight", body: "Hello,\nHow much does the Atlas Stool in espresso weigh, with and without packaging?\nBest regards" },
  { label: "Personal data", subject: "Delivery", body: "Hi,\nPlease deliver one Knot Rug 200x300 in off-white to our customer: Jens Hansen, Nørrebrogade 12, 2200 København, phone +45 30 12 34 56.\nThanks" },
];

const tryState = { subject: "", body: "" };

/** "Removed before AI: 1 phone number, 1 personal ID" from the [PHONE]-style tokens left in the text. */
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
  [12000, "The AI is slow. If it takes over 20 seconds you'll get the facts without a draft."],
];

function tryPage() {
  app.innerHTML = `
    <div class="page-head">
      <h1>Try your own email</h1>
      <p class="trust">Paste a retailer question. Personal data is removed first, and only the cleaned text goes to the AI.
        Nothing is stored by this tool.</p>
    </div>
    <form class="card tryform" id="tryform">
      <div class="examples">
        <span class="examples-label">Try an example:</span>
        ${EXAMPLES.map((e, i) => `<button type="button" class="chip" data-example="${i}">${esc(e.label)}</button>`).join("")}
      </div>
      <label><span>Subject <span class="muted">(optional)</span></span><input id="t-subject" maxlength="300" value="${esc(tryState.subject)}"></label>
      <label><span>Email text</span><textarea id="t-body" rows="8" maxlength="5000" required>${esc(tryState.body)}</textarea></label>
      <div class="row gap wrap">
        <button class="btn" type="submit" id="t-go">Draft a reply</button>
        <span class="small" id="t-status" role="status" aria-live="polite"></span>
      </div>
    </form>
    <div id="t-result"></div>`;

  const subject = document.getElementById("t-subject");
  const body = document.getElementById("t-body");
  app.querySelectorAll("[data-example]").forEach((b) => (b.onclick = () => {
    const e = EXAMPLES[b.dataset.example];
    subject.value = e.subject;
    body.value = e.body;
    body.focus();
  }));

  document.getElementById("tryform").onsubmit = async (ev) => {
    ev.preventDefault();
    tryState.subject = subject.value;
    tryState.body = body.value;
    const go = document.getElementById("t-go");
    const status = document.getElementById("t-status");
    const out = document.getElementById("t-result");
    go.disabled = true;
    out.innerHTML = "";
    const timers = TRY_STEPS.map(([ms, text]) => setTimeout(() => (status.textContent = text), ms));
    try {
      const r = await getJson("/api/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.value, body: body.value }),
      });
      out.innerHTML = `
        <p class="privacy-note${r.redaction?.containsPersonalData ? " privacy-found" : ""}">${esc(redactionSummary(r))}</p>
        ${r.aiTimedOut ? `<p class="notice">The AI took longer than 20 seconds, so this is the facts-only version. Try again in a minute for a drafted reply.</p>` : ""}
        ${detail(r)}`;
      wireDetail(r);
      status.textContent = "";
      out.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      status.textContent = `Something went wrong: ${e.message}`;
    } finally {
      timers.forEach(clearTimeout);
      go.disabled = false;
    }
  };
}

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

const emailLinks = (ids) => ids.map((id) => `<a href="#email/${encodeURIComponent(id)}">${esc(id)}</a>`).join(", ");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One row per SKU, for the product data owner's spreadsheet. */
function issuesCsv(groups) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Product", "SKU", "Variant", "Type", "Severity", "Issue", "Affects emails"]];
  for (const g of groups) {
    for (const s of g.skus) rows.push([g.product, s.sku, s.variant, KIND[g.kind], SEVERITY[g.severity], s.message, g.affects.join(" ")]);
  }
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

async function issues() {
  const at = location.hash;
  const report = await getJson("/api/data-issues");
  if (location.hash !== at) return; // the user moved on while this loaded
  const { totals, top, allAffecting, yellowNotFromData, groups } = report;
  const counts = {};
  for (const g of groups) counts[g.kind] = (counts[g.kind] ?? 0) + 1;

  app.innerHTML = `
    <div class="page-head">
      <h1>Data issues</h1>
      <div class="trust summary">
        <p><strong>${plural(totals.issues, "problem")} in ${plural(totals.products, "product")}</strong>, grouped into ${plural(totals.groups, "fix", "fixes")} below,
          most important first. Fixing them in the product data makes them right everywhere: this tool, the website and retailers' feeds.</p>
        <p>Fixing the top ${top.count} would turn <strong>${plural(top.fixesEmails.length, "email")}</strong> from yellow to green${top.fixesEmails.length ? ` (${emailLinks(top.fixesEmails)})` : ""}.
          Fixing all ${allAffecting.count} that affect emails would turn <strong>${allAffecting.fixesEmails.length}</strong> green${allAffecting.fixesEmails.length ? ` (${emailLinks(allAffecting.fixesEmails)})` : ""}.
          ${yellowNotFromData ? `The other ${plural(yellowNotFromData, "yellow email")} ${yellowNotFromData === 1 ? "is" : "are"} waiting on information that isn't in the data at all, such as lead times and seat heights.` : ""}</p>
      </div>
    </div>
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Filter by type">
        <button class="chip" data-kind="all" aria-pressed="${issuesState.kind === "all"}">All <span class="count">${groups.length}</span></button>
        ${Object.entries(KIND).filter(([k]) => counts[k]).map(([k, label]) => `
          <button class="chip" data-kind="${k}" aria-pressed="${issuesState.kind === k}">${esc(label)} <span class="count">${counts[k]}</span></button>`).join("")}
      </div>
      <button class="btn btn-ghost" id="export" type="button">Export as CSV</button>
    </div>
    <div class="card table-card"><div class="table-wrap"><table class="issues">
      <thead><tr><th>Issue</th><th>Type</th><th>Severity</th><th>Affects emails</th></tr></thead>
      <tbody id="issue-rows"></tbody>
    </table></div></div>`;

  const render = () => {
    const shown = groups.filter((g) => issuesState.kind === "all" || g.kind === issuesState.kind);
    document.getElementById("issue-rows").innerHTML = shown.map((g) => `
      <tr>
        <td>
          <div class="issue-title">${esc(g.title)}</div>
          <div class="issue-text">${esc(g.message)}</div>
          ${g.skus.length > 1 ? `<details class="issue-skus"><summary>${g.skus.length} SKUs</summary>
            <ul>${g.skus.map((s) => `<li><code>${esc(s.sku)}</code> ${esc(s.variant || "")}${new Set(g.skus.map((x) => x.message)).size > 1 ? `: ${esc(s.message)}` : ""}</li>`).join("")}</ul>
          </details>` : `<div class="muted small"><code>${esc(g.skus[0].sku)}</code></div>`}
        </td>
        <td class="small">${esc(KIND[g.kind])}</td>
        <td><span class="sev sev-${g.severity}">${esc(SEVERITY[g.severity])}</span></td>
        <td class="small">${g.affects.length ? emailLinks(g.affects) : `<span class="muted">none</span>`}</td>
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
  try {
    if (page === "email") await emailPage(decodeURIComponent(arg ?? ""));
    else if (page === "try") tryPage();
    else if (page === "issues") await issues();
    else await inbox();
  } catch (e) {
    app.innerHTML = `<div class="empty"><h1>Something went wrong</h1><p>${esc(e.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
route();
