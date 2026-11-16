// Plain JS, no build step: hash routing between Inbox / Email detail / Try / Data issues.
// Full UI comes in step 5; this is the skeleton.
const app = document.getElementById("app");
const ICON = { green: "🟢", yellow: "🟡", red: "🔴" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function inbox() {
  const results = await getJson("/api/results");
  if (!results.length) return (app.innerHTML = `<p class="muted">No results yet. Run <code>npm run batch</code> in server/.</p>`);
  app.innerHTML = `<table><tr><th></th><th>Email</th><th>From</th><th>Reason</th></tr>${results
    .map((r) => `<tr><td>${ICON[r.status]}</td><td>${esc(r.email.id)} · ${esc(r.email.subject)}</td><td>${esc(r.email.from_retailer)}</td><td>${esc(r.flags[0]?.reason)}</td></tr>`)
    .join("")}</table>`;
}

function tryPage() { app.innerHTML = `<p class="muted">Try your own email: coming in step 5.</p>`; }
function issues() { app.innerHTML = `<p class="muted">Data issues: coming in step 5.</p>`; }

async function route() {
  const page = location.hash.slice(1) || "inbox";
  try { await ({ inbox, try: tryPage, issues }[page] ?? inbox)(); }
  catch (e) { app.innerHTML = `<p>Something went wrong: ${esc(e.message)}</p>`; }
}
window.addEventListener("hashchange", route);
route();
