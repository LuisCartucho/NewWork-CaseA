# New Works: Retailer Inbox Helper (Case A)

Drafts answers to retailer product questions from New Works' own product data, and flags
everything a person must check. Prices, products, accounts and bank details are never guessed.

## Structure

```
newworks-kb/
├── client/                  Static web UI (plain HTML/JS, no build step), served by the server
│   ├── index.html
│   ├── app.js               Inbox · Email detail · Try your own email · Data issues
│   └── styles.css
├── server/                  Node.js + TypeScript + Express
│   ├── data/                Read-only inputs, loaded into memory at startup (no database)
│   │   ├── products.csv
│   │   ├── retailer_emails.csv
│   │   ├── fact_sheets/          original PDFs
│   │   ├── fact_sheets_text/     pdftotext output (reference)
│   │   └── fact_sheet_facts.json hand-checked facts with page numbers (used by lookup)
│   ├── results/             Output of `npm run batch` (results.json, results.md)
│   ├── scripts/             extract_fact_sheets.sh
│   └── src/
│       ├── index.ts         Express app: basic auth, /health, /api, static client
│       ├── batch.ts         Runs all 30 emails, writes results/
│       ├── config.ts        Env vars and paths
│       ├── types.ts         Shared types
│       ├── data/loadData.ts CSV + facts loader
│       ├── llm/llm.ts       OpenAI-compatible wrapper: Gemini, then Groq, else null
│       ├── routes/api.ts    GET /api/results · POST /api/try · GET /api/data-issues
│       └── pipeline/
│           ├── index.ts     Runs the steps in order
│           ├── redact.ts    1. personal data out       (plain code)
│           ├── extract.ts   2. what is being asked     (LLM, zod-validated)
│           ├── resolve.ts   3. which product/variant   (plain code)
│           ├── lookup.ts    4. facts + sources + conflicts (plain code)
│           ├── asked.ts        which facts were asked (keywords + LLM)
│           ├── conflicts.ts    products.csv vs fact sheet, per SKU (also the Data issues page)
│           ├── rules.ts     5. green/yellow/red        (plain code)
│           ├── draft.ts     6. reply text              (LLM, facts only)
│           └── numberCheck.ts 7. no unknown numbers    (plain code)
├── docs/                    Case write-ups (data issues, analysis, note, build vs buy)
├── package.json             Root scripts (used by Render)
└── render.yaml              Render deployment
```

## Run locally

```
cd server
cp .env.example .env      # set BASIC_AUTH_USER / BASIC_AUTH_PASS, optionally LLM keys
npm install
npm test                  # redaction rules + data file checks
npm run batch             # precompute the 30 emails
npm run dev               # http://localhost:3000
```

## Deploy (Render)

Render does not run the batch: the Inbox reads the committed `server/results/results.json`.
Run `npm run batch` locally and commit `server/results/` before deploying.

Push to a private GitHub repo → Render → New → Blueprint → pick the repo (uses `render.yaml`).
Set `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`, `GEMINI_API_KEY`, `GROQ_API_KEY` in the dashboard.
