# Expense Tracker

A personal expense tracker with no backend of its own — it reads and writes its data as JSON files in a Google Drive folder you pick, using only the `drive.file` OAuth scope (so it can only ever see files it created or that you explicitly selected, never the rest of your Drive).

**Live app:** https://alexgogas.github.io/expense-tracker/

## What it does

- Imports transactions from SAS EuroBonus (.xlsx), SAS Amex (.xlsx), and Nordea Personkonto/Sparkonto (.csv) exports, auto-categorizing each merchant via a small rules engine (aliases → your own corrections → learned history → keyword rules → manual review for anything left unmatched).
- A dashboard: spend by category with click-to-drill-down, a savings chart (income minus spend per card), a net worth chart with a mortgage/income projection model, budgets with progress bars, and a full transaction browser with search/filter/recategorize.
- Optional AI-generated spending insights, using your own Anthropic API key called directly from the browser — nothing passes through any server.

## Stack

A static site — [Preact](https://preactjs.com/) + [`@preact/signals`](https://preactjs.com/guide/v10/signals/) for state, [Chart.js](https://www.chartjs.org/) for charts, built with [Vite](https://vitejs.dev/). No backend, no database — Google Drive is the only persistence layer. Deployed to GitHub Pages via GitHub Actions on every push to `main` (see `.github/workflows/deploy-pages.yml`).

`categorization-engine.js`, at the repo root, is the one piece of logic shared outside the Vite project: a dependency-free file-parsing/categorization engine, also `require()`-able from plain Node for quick scripting or testing.

## Running it yourself

You'll need your own Google Cloud OAuth client (APIs & Services → Credentials → OAuth client ID → Web application), with your dev/deployment origin added as an authorized JavaScript origin, and the Google Picker API enabled. Put the client ID and API key in `web/src/state.js`.

```bash
cd web
npm install
npm run dev      # dev server
npm run build    # production build → web/dist
```

On first sign-in, pick (or create) a Drive folder — the app will create its own settings/data files inside it automatically.

## Repo layout

- `web/` — the app (see `web/src/` for the module-by-module breakdown).
- `categorization-engine.js` — the parsing/categorization engine described above.
- `CLAUDE.md` — a more detailed architecture writeup (storage model, categorization pipeline, per-card module map) for anyone (human or AI) working on the codebase.
