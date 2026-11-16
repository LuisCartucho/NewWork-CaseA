// Plain JS, no build step. Hash routing:
//   #inbox · #email/M001 · #try · #issues
// Every piece of data is escaped with esc() before it goes into innerHTML.
const app = document.getElementById("app");

const STATUS = {
  red: { label: "Needs a person", short: "Red" },
  yellow: { label: "Check before sending", short: "Yellow" },
  green: { label: "Ready to send", short: "Green" },
};

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

const pill = (status) => `<span class="pill pill-${status}"><span class="dot" aria-hidden="true"></span>${esc(STATUS[status].label)}</span>`;

const badges = (r) => [
  r.duplicateOf ? `<span class="badge">Duplicate of ${esc(r.duplicateOf)}</span>` : "",
  r.redaction?.containsPersonalData ? `<span class="badge badge-warn">Personal data removed</span>` : "",
  r.aiUsed ? `<span class="badge badge-muted">AI: ${esc(r.ai?.draft ?? "yes")}</span>` : `<span class="badge badge-muted">Facts only</span>`,
].join("");

/** Redacted body with [PHONE]-style tokens highlighted. */
const emailBody = (text) => esc(text).replace(/\[(NAME|ADDRESS|POSTCODE CITY|PHONE|EMAIL|PERSONAL ID)\]/g, '<mark class="redacted">[$1]</mark>');

/** Product name without the "Product: " prefix used in fact labels. */
const factLabel = (label) => label.replace(/^[^:]+:\s*/, "");

function detail(r) {
  const byProduct = new Map();
  for (const f of r.facts) {
    const product = f.label.split(":")[0];
    if (!byProduct.has(product)) byProduct.set(product, []);
    byProduct.get(product).push(f);
  }

  return `
  <article class="detail">
    <header class="detail-head">
      <div>
        <div class="eyebrow">${esc(r.email.id)} · ${esc(r.email.from_retailer)} · ${esc(r.email.date)}</div>
        <h1>${esc(r.email.subject || "(no subject)")}</h1>
        <div class="row gap">${pill(r.status)} ${badges(r)}</div>
      </div>
    </header>

    <section class="card flags flags-${r.status}" aria-label="Why this status">
      <h2>Why ${esc(STATUS[r.status].short.toLowerCase())}</h2>
      <ul>${r.flags.map((f) => `<li class="flag flag-${f.level}"><span class="dot" aria-hidden="true"></span><span>${esc(f.reason)}</span></li>`).join("")}</ul>
    </section>

    <!-- Left: the conversation (email, then reply). Right: what it's based on. -->
    <div class="grid">
      <div class="col">
        <section class="card">
          <h2>Email <span class="muted small">(personal data removed)</span></h2>
          <pre class="email">${emailBody(r.email.body)}</pre>
        </section>

        <section class="card">
          <h2>Draft reply</h2>
          <p class="muted small">${r.aiUsed
            ? `Written by ${esc(r.ai?.draft ?? "AI")} from the facts on this page only. Every number in it was checked against our data.${r.ai?.extract ? "" : " (Question understood by keyword rules: the AI extraction step was unavailable.)"}`
            : "AI was not available: this is a plain list of the facts we found. Edit before sending."}</p>
          <textarea id="draft" class="draft" rows="12" aria-label="Draft reply">${esc(r.draft)}</textarea>
          <div class="row gap">
            <button class="btn" id="copy">Copy draft</button>
            <span class="muted small" id="copied" role="status"></span>
          </div>
        </section>
      </div>

      <div class="col">
        <section class="card">
          <h2>Product</h2>
          ${r.resolution.matches.length ? r.resolution.matches.map((m) => `
            <div class="product">
              <div class="row between">
                <strong>${esc(m.name)}</strong>
                <span class="${m.variants.length === 1 ? "ok" : "warn"} small">${m.variants.length === 1 ? "Exact SKU" : `${m.variants.length} variants possible`}</span>
              </div>
              ${m.hints.length ? `<div class="muted small">Matched on: ${m.hints.map(esc).join(", ")}</div>` : ""}
              <ul class="skus">${m.variants.map((p) => `<li><code>${esc(p.sku)}</code> ${esc(p.variant || "(no variant)")}${p.status !== "active" ? ` <span class="badge badge-warn">${esc(p.status)}</span>` : ""}</li>`).join("")}</ul>
            </div>`).join("") : `<p class="muted">No product from our range recognised.</p>`}
        </section>

        <section class="card">
          <h2>Facts found</h2>
          ${r.facts.length ? [...byProduct].map(([product, facts]) => `
            ${byProduct.size > 1 ? `<h3>${esc(product)}</h3>` : ""}
            <dl class="facts">${facts.map((f) => `
              <div class="fact">
                <dt>${esc(factLabel(f.label))}</dt>
                <dd>${esc(f.value)}<div class="source">${esc(f.source)}</div></dd>
              </div>`).join("")}
            </dl>`).join("") : `<p class="muted">No facts found.</p>`}
          ${r.missing?.length ? `
            <h3>Not in our data</h3>
            <ul class="plain">${r.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
        </section>

        ${r.conflicts.length ? `
        <section class="card">
          <h2>Sources disagree</h2>
          <ul class="plain small">${r.conflicts.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
        </section>` : ""}
      </div>
    </div>
  </article>`;
}

function wireDraft() {
  const btn = document.getElementById("copy");
  if (!btn) return;
  btn.onclick = async () => {
    const text = document.getElementById("draft").value;
    const note = document.getElementById("copied");
    try {
      await navigator.clipboard.writeText(text);
      note.textContent = "Copied.";
    } catch {
      document.getElementById("draft").select();
      note.textContent = "Press Ctrl+C to copy.";
    }
    setTimeout(() => (note.textContent = ""), 2500);
  };
}

// ---------- pages ----------

const inboxState = { filter: "all", q: "" };

async function inbox() {
  const results = await loadResults();
  if (!results.length) {
    app.innerHTML = `<div class="empty"><h1>No results yet</h1><p>Run <code>npm run batch</code> in <code>server/</code>, then reload.</p></div>`;
    return;
  }
  const counts = { all: results.length, red: 0, yellow: 0, green: 0 };
  for (const r of results) counts[r.status]++;

  app.innerHTML = `
    <div class="page-head">
      <h1>Inbox</h1>
      <p class="muted">${results.length} retailer emails. Red needs a person, yellow needs a check, green is ready to send.</p>
    </div>
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Filter by status">
        ${["all", "red", "yellow", "green"].map((k) => `
          <button class="chip ${k !== "all" ? `chip-${k}` : ""}" data-filter="${k}" aria-pressed="${inboxState.filter === k}">
            ${k === "all" ? "All" : esc(STATUS[k].short)} <span class="count">${counts[k]}</span>
          </button>`).join("")}
      </div>
      <input type="search" id="q" placeholder="Search subject, retailer, product…" value="${esc(inboxState.q)}" aria-label="Search">
    </div>
    <ul class="inbox" id="list"></ul>`;

  const render = () => {
    const q = inboxState.q.toLowerCase();
    const rows = results.filter((r) =>
      (inboxState.filter === "all" || r.status === inboxState.filter) &&
      (!q || [r.email.id, r.email.subject, r.email.from_retailer, ...r.resolution.matches.map((m) => m.name)].join(" ").toLowerCase().includes(q)));
    document.getElementById("list").innerHTML = rows.length ? rows.map((r) => `
      <li>
        <a class="mail mail-${r.status}" href="#email/${encodeURIComponent(r.email.id)}">
          <span class="dot" aria-label="${esc(STATUS[r.status].label)}"></span>
          <span class="mail-main">
            <span class="mail-top">
              <span class="mail-from">${esc(r.email.from_retailer)}</span>
              <span class="muted small">${esc(r.email.id)} · ${esc(r.email.date)}</span>
            </span>
            <span class="mail-subject">${esc(r.email.subject)}</span>
            <span class="mail-reason">${esc(r.flags[0]?.reason)}</span>
          </span>
          <span class="mail-badges">${badges(r)}</span>
        </a>
      </li>`).join("") : `<li class="muted empty-row">No emails match.</li>`;
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
  const results = await loadResults();
  const r = results.find((x) => x.email.id === id);
  if (!r) { app.innerHTML = `<p>Email ${esc(id)} not found. <a href="#inbox">Back to inbox</a></p>`; return; }
  const i = results.indexOf(r);
  const prev = results[i - 1], next = results[i + 1];
  app.innerHTML = `
    <nav class="row between crumbs">
      <a href="#inbox">← Inbox</a>
      <span class="row gap small">
        ${prev ? `<a href="#email/${encodeURIComponent(prev.email.id)}">‹ ${esc(prev.email.id)}</a>` : ""}
        ${next ? `<a href="#email/${encodeURIComponent(next.email.id)}">${esc(next.email.id)} ›</a>` : ""}
      </span>
    </nav>
    ${detail(r)}`;
  wireDraft();
}

const EXAMPLES = [
  { label: "Dimensions", subject: "Dimensions Atlas Coffee Table", body: "Hi,\nCould you confirm the exact dimensions of the Atlas Coffee Table 60x60 in fumed oak?\nThanks" },
  { label: "Ambiguous variant", subject: "Atlas Stool weight", body: "Hello,\nHow much does the Atlas Stool in espresso weigh, with and without packaging?\nBest regards" },
  { label: "Personal data", subject: "Delivery", body: "Hi,\nPlease deliver one Knot Rug 200x300 in off-white to our customer: Jens Hansen, Nørrebrogade 12, 2200 København, phone +45 30 12 34 56.\nThanks" },
];

const tryState = { subject: "", body: "" };

function tryPage() {
  app.innerHTML = `
    <div class="page-head">
      <h1>Try your own email</h1>
      <p class="muted">Paste a retailer question. Personal data is removed before anything else happens, and nothing is stored.</p>
    </div>
    <form class="card tryform" id="tryform">
      <div class="row gap wrap small">
        <span class="muted">Examples:</span>
        ${EXAMPLES.map((e, i) => `<button type="button" class="btn btn-ghost" data-example="${i}">${esc(e.label)}</button>`).join("")}
      </div>
      <label>Subject <input id="t-subject" maxlength="300" value="${esc(tryState.subject)}"></label>
      <label>Email <textarea id="t-body" rows="8" maxlength="5000" required>${esc(tryState.body)}</textarea></label>
      <div class="row gap">
        <button class="btn" type="submit" id="t-go">Process email</button>
        <span class="muted small" id="t-status" role="status"></span>
      </div>
    </form>
    <div id="t-result"></div>`;

  const subject = document.getElementById("t-subject");
  const body = document.getElementById("t-body");
  app.querySelectorAll("[data-example]").forEach((b) => (b.onclick = () => {
    const e = EXAMPLES[b.dataset.example];
    subject.value = e.subject;
    body.value = e.body;
  }));

  document.getElementById("tryform").onsubmit = async (ev) => {
    ev.preventDefault();
    tryState.subject = subject.value;
    tryState.body = body.value;
    const go = document.getElementById("t-go");
    const status = document.getElementById("t-status");
    go.disabled = true;
    status.textContent = "Processing…";
    try {
      const r = await getJson("/api/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.value, body: body.value }),
      });
      document.getElementById("t-result").innerHTML = detail(r);
      wireDraft();
      status.textContent = "";
    } catch (e) {
      status.textContent = `Failed: ${e.message}`;
    } finally {
      go.disabled = false;
    }
  };
}

const KIND = {
  mismatch: { label: "Values disagree", note: "Both files have a value and they differ." },
  net_ge_packed: { label: "Packed weight in net weight field", note: "products.csv weight is not less than the fact sheet's weight incl. packaging." },
  not_on_sheet: { label: "Variant missing from fact sheet", note: "The variant's colour isn't listed on the product's fact sheet." },
  csv_blank: { label: "Empty in products.csv", note: "Low risk: the tool uses the fact sheet value." },
};
const issuesState = { kind: "all" };

async function issues() {
  const list = await getJson("/api/data-issues");
  const counts = { all: list.length };
  for (const i of list) counts[i.kind] = (counts[i.kind] ?? 0) + 1;

  app.innerHTML = `
    <div class="page-head">
      <h1>Data issues</h1>
      <p class="muted">${list.length} places where products.csv and the fact sheets disagree, found automatically SKU by SKU. Fixing them in the product data makes more answers green.</p>
    </div>
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Filter by type">
        <button class="chip" data-kind="all" aria-pressed="${issuesState.kind === "all"}">All <span class="count">${counts.all}</span></button>
        ${Object.entries(KIND).filter(([k]) => counts[k]).map(([k, v]) => `
          <button class="chip" data-kind="${k}" aria-pressed="${issuesState.kind === k}">${esc(v.label)} <span class="count">${counts[k]}</span></button>`).join("")}
      </div>
    </div>
    <div id="issues"></div>`;

  const render = () => {
    const kinds = Object.keys(KIND).filter((k) => counts[k] && (issuesState.kind === "all" || issuesState.kind === k));
    document.getElementById("issues").innerHTML = kinds.map((k) => `
      <section class="card">
        <h2>${esc(KIND[k].label)} <span class="count">${counts[k]}</span></h2>
        <p class="muted small">${esc(KIND[k].note)}</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Issue</th></tr></thead>
            <tbody>${list.filter((i) => i.kind === k).map((i) => `
              <tr><td>${esc(i.product)}</td><td><code>${esc(i.sku)}</code></td><td>${esc(i.message.replace(/^[^:]+:\s*/, ""))}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>`).join("") || `<p class="muted">No data issues found.</p>`;
  };
  render();
  app.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => {
    issuesState.kind = b.dataset.kind;
    app.querySelectorAll("[data-kind]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  }));
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
