# New Works: Retailer Inbox Helper (Case A)

A tool for Sales Support that reads retailer emails, finds the answer in New Works' own product
data, drafts a reply, and marks each email **green / yellow / red** with a plain-language reason.

The guiding rule: **the AI writes, the code decides.** Facts, SKUs, prices and the status come
from plain code over the product data. The AI only reads the question and words the reply, and
every number it writes is checked against the data before anyone sees it.

## What it does with the 30 sample emails

| Status | Count | Meaning | Examples |
|---|---|---|---|
| 🟢 Green | 8 | Every fact found, sources agree: ready to send | Dimensions (M002–M004), Tembo seat height (M023), Hallingdal = category C (M029) |
| 🟡 Yellow | 13 | Usable draft, but check something first | Lead time "before Christmas", variant not specified, sources disagree, fact not in data |
| 🔴 Red | 9 | A person must handle it | Price lists, certificates, orders, personal data, discontinued products |

Some things it catches that are easy to get wrong:

- **M012 Karl-Johan weight**: products.csv says 10.2 kg, but the fact sheet says 1.9 kg *including
  packaging*. The net weight is withheld and the conflict is shown.
- **M010 Kizu Kunis Breccia EU**: picks the EU row (5.6 kg), not the AU/UK/US rows whose weight is
  really the packed weight, and notes that Kunis Breccia isn't on the fact sheet.
- **M028 Nebra "can it be dimmed?"**: the fact sheet has no dimmable field (the "Yes" on p.1 means
  "light source included"), so the answer is "we'll check", not "yes".
- **M027 private customer order**: name, address, phone and personal ID are removed **before** any
  other step, including the AI.
- **M007 = M015**: same retailer, same text, so it's marked as a duplicate. M003 / M020 (same
  question, different retailers) are not duplicates: both need a reply.

## How it works

Each email goes through seven steps. Only two use AI.

| # | Step | How | Why this way |
|---|---|---|---|
| 1 | **Redact** personal data | Regex rules | Sending the email to an AI to find personal data would already leak it. Rules are predictable and testable. |
| 2 | **Extract** what is asked | AI → JSON, validated with zod | Retailers phrase the same question many ways ("fits between two walls", "with and without packaging"). |
| 3 | **Resolve** product and variant | Plain code | A wrong SKU is the costliest error. Code finds an exact match or keeps every row that still fits; it never guesses. |
| 4 | **Look up** facts | Plain code | A table lookup. Each value carries its source (CSV SKU and/or fact sheet + page). If the CSV and fact sheet disagree, the value is withheld. |
| 5 | **Rules** green / yellow / red | Plain code | The status is the trust signal: it must be explainable and identical every run. |
| 6 | **Draft** the reply | AI, from the looked-up facts only | Turning a list of facts into a natural email is what AI is good at. |
| 7 | **Number check** | Plain code | Every number in the draft must exist in the facts. You can't ask the model to check itself. |

**The AI can only add, never remove.** Keyword rules always run (steps 2–4 work without AI);
the AI's extraction can add fields or variant hints but can't remove what the rules found.

**If the AI is down**, the app still works in *facts-only* mode: the draft is a plain list of
facts with sources, and the statuses are the same.

### Safety guarantees (each is covered by a test)

- **Prices are never quoted.** Prices are never looked up; any price question is red.
- **No invented numbers.** A draft with a number that isn't in the facts is flagged red: "do not send".
- **No silent guessing of variants.** If the retailer didn't say which variant and the answer
  differs, the draft gives each variant's value and the email is yellow.
- **Absence is never "no".** If the data doesn't answer something, the draft says "I'll check with
  the team" instead of denying it.
- **Personal data never leaves the server.** It's removed before the AI step, and only the
  redacted text is stored.

### AI providers

| Role | Provider | Model |
|---|---|---|
| Primary | Google Gemini (free tier) | `gemini-3.5-flash` |
| Fallback | Groq (free tier) | `openai/gpt-oss-120b` |

Both are called through the same OpenAI-compatible API (`server/src/llm/llm.ts`): 12 s timeout,
then the next provider; a provider that hits its quota or times out is skipped for 2 minutes.
Free tiers are rate-limited, so `npm run batch` paces itself and retries busy emails.

## Data issues

Comparing `products.csv` with the 19 fact sheets SKU by SKU finds **38 issues**, shown on the
*Data issues* page. For example: packed weight stored as net weight (Karl-Johan, Kizu Kunis Breccia,
Pi-No-Pi-No), heights that differ or are missing (Karl-Johan), and a variant missing from its fact
sheet (Kizu Kunis Breccia). The full hand-checked write-up is in
[`docs/data_issues.md`](docs/data_issues.md). Fixing these in the product data turns more answers green.

## Tech stack

- **Backend:** Node.js + TypeScript (strict) + Express. `csv-parse` for the CSVs, `zod` to
  validate the hand-written fact file and the AI's JSON. No database: ~170 read-only rows are
  loaded into memory at startup.
- **Frontend:** plain HTML, CSS and JavaScript. No framework, no build step; served by the backend,
  so it's one app on one URL.
- **Tests:** Node's built-in test runner via `tsx`. Tests run **offline** (`LLM_DISABLED=1`), so
  they're fast and deterministic.
- **Fact sheets:** the PDFs contain real text, extracted with `pdftotext`
  (`server/scripts/extract_fact_sheets.sh`), then the facts were checked by hand into
  `fact_sheet_facts.json` with page numbers. No AI reads the PDFs at runtime (see "traps" in
  `docs/data_issues.md` for why).

## Structure

```
NewWork-CaseA/
├── client/                    Static web UI, served by the server
│   ├── index.html
│   ├── app.js                 Inbox · Email detail · Try your own email · Data issues
│   └── styles.css             Light and dark mode, works on phones
├── server/                    Node.js + TypeScript + Express
│   ├── data/                  Read-only inputs
│   │   ├── products.csv
│   │   ├── retailer_emails.csv
│   │   ├── fact_sheets/            original PDFs
│   │   ├── fact_sheets_text/       pdftotext output (reference)
│   │   └── fact_sheet_facts.json   hand-checked facts with page numbers
│   ├── results/               Output of `npm run batch` (read by the Inbox)
│   ├── scripts/               extract_fact_sheets.sh
│   └── src/
│       ├── index.ts           Express app: basic auth, /health, /api, static client
│       ├── batch.ts           Runs all 30 emails, marks duplicates, writes results/
│       ├── config.ts          Env vars and paths
│       ├── types.ts           Shared types
│       ├── data/loadData.ts   CSV + fact loader (validated at startup)
│       ├── llm/llm.ts         Gemini → Groq → null (facts only)
│       ├── routes/api.ts      HTTP API (see below)
│       └── pipeline/
│           ├── index.ts       Runs the 7 steps in order
│           ├── redact.ts      1. personal data out          (code)
│           ├── extract.ts     2. what is being asked        (AI)
│           ├── resolve.ts     3. which product / variant    (code)
│           ├── lookup.ts      4. facts + sources            (code)
│           ├── asked.ts          which facts were asked (keywords + AI)
│           ├── conflicts.ts      CSV vs fact sheet per SKU (also the Data issues page)
│           ├── rules.ts       5. green / yellow / red       (code)
│           ├── draft.ts       6. reply text                 (AI)
│           ├── numberCheck.ts 7. no unknown numbers         (code)
│           └── *.test.ts      Tests next to the code they test
├── docs/data_issues.md        Hand-checked comparison of products.csv and the fact sheets
├── Dockerfile                 Two-stage image: compile TypeScript, then slim runtime (non-root)
├── .dockerignore              Keeps .env, node_modules, PDFs and tests out of the image
├── fly.toml                   Fly.io app config (region, health check, auto-stop)
└── package.json               Root convenience scripts (npm run dev / batch from the repo root)
```

### API

All routes except `/health` require HTTP basic auth.

| Route | What it does |
|---|---|
| `GET /health` | Health check for the host (no auth, no data) |
| `GET /api/results` | Precomputed results for the 30 emails (Inbox) |
| `POST /api/try` | Runs the pipeline live on `{ subject, body }` (Try your own email) |
| `GET /api/data-issues` | Every CSV vs fact sheet conflict, computed at startup |

## Run locally

Requires Node.js 22+ (tested on 24).

```
cd server
cp .env.example .env      # set BASIC_AUTH_USER / BASIC_AUTH_PASS; LLM keys optional
npm install
npm test                  # 29 tests, offline
npm run batch             # process the 30 emails (a few minutes with AI: free tiers are paced)
npm run dev               # http://localhost:3000, reloads on save
```

`.env` settings:

| Variable | Required | Notes |
|---|---|---|
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASS` | Yes | The server refuses to serve data without them |
| `GEMINI_API_KEY` | No | From Google AI Studio |
| `GROQ_API_KEY` | No | From console.groq.com (Groq, not xAI's Grok) |
| `GEMINI_MODEL`, `GROQ_MODEL` | No | Defaults above |
| `PORT` | No | Default 3000 |

Without any AI key the app runs in facts-only mode. `.env` is git-ignored; never commit keys.

## Deploy (Fly.io)

Live at **https://newworks-inbox-helper.fly.dev** (basic auth). One small machine in Stockholm
(`arn`) that stops when idle and starts on the next request, so the first page load after a
quiet period takes a few seconds.

The server does not run the batch: the Inbox reads the committed `server/results/results.json`.
To update what the Inbox shows, run `npm run batch` locally, commit `server/results/`, then deploy.

```
fly deploy --ha=false                      # build on Fly's servers and roll out (one machine)
fly secrets set BASIC_AUTH_PASS=...        # change a secret (restarts the app)
fly secrets list                           # names only; values are never shown
fly logs                                   # live server logs, including [llm] fallbacks
```

Secrets on Fly: `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`GEMINI_MODEL`, `GROQ_MODEL`. They live only in Fly, never in `fly.toml` or the image.
The deployed app uses its own strong password, separate from your local `.env`.

`--ha=false` keeps a single machine; by default Fly starts two for redundancy, which a demo
doesn't need. The health check (`/health`) needs no login and returns no data.

## Known limitations

- Keyword rules cover the phrasings in the 30 emails and common variants; unusual wording relies
  on the AI extraction step.
- Only numbers are compared between the CSV and fact sheets; text differences (e.g. Nebra's shade
  material, ABS vs PES) are documented in `docs/data_issues.md` but not detected automatically.
- In an email about two products, size and colour words are applied to both.
- AI drafts can differ slightly between runs; the Inbox shows precomputed results, and the number
  check runs on every draft.
