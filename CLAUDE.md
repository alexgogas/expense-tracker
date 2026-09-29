# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal expense tracker that reads and writes its data as JSON files in a user's Google Drive folder. The app is a Vite + Preact project in `web/`. One file lives at the repo root instead, unmoved and unmodified, because `web/` depends on it:

- `categorization-engine.js` — a standalone, dependency-free engine that parses bank/card export files and assigns categories to transactions. Copied into `web/`'s build by `vite-plugin-static-copy` and loaded there via a classic (non-module) `<script>` tag — deliberately never converted to an ES module, so it stays `require()`-able from Node. Also exports via `module.exports` (guarded by `typeof module !== 'undefined'`) for that Node/testing use.

This app was originally a single static `index.html` file with no build step; it was migrated to Vite + Preact incrementally, one card/feature at a time, over several sessions, then cut over to production. That original file, and the whole pre-cutover history, live only in a separate private archive repo — this repo started fresh from the migrated code so it carries no personal data in its history.

## Deployment

GitHub Pages builds and deploys `web/` via a GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) on every push to `main`: `npm ci && npm run build` inside `web/`, then `web/dist` is published. `web/vite.config.js` sets `base: './'` (relative asset URLs) since Pages serves this project from a subpath, not the domain root — and `web/index.html`'s `<script src="./categorization-engine.js">` is deliberately relative for the same reason (Vite doesn't rewrite non-module `<script src>` tags the way it rewrites bundled asset references).

## Running / developing

`cd web && npm install && npm run dev` for a dev server, `npm run build` to produce `web/dist`, `npm test` for the categorization-engine tests (`test/categorization-engine.test.js`, Node's built-in runner, no extra dependencies — fake data only). CI (`.github/workflows/ci.yml`) runs tests + build on every PR, and the deploy workflow runs them again before publishing. There's no lint command.

Because Drive API calls (the OAuth flow, `web/src/drive.js`) require a live Google account, folder, and the app's own `CLIENT_ID`/`API_KEY` (hardcoded near the top of `web/src/state.js`), most UI flows can only be manually verified end-to-end while signed in with Drive access. The categorization engine (`categorization-engine.js`) has no such dependency and can be exercised standalone via Node (`node -e "..."` or a scratch script using `require('./categorization-engine.js')`).

## Architecture

### Code layout (`web/src/`)

- `state.js` — every piece of shared state as a `@preact/signals` signal (`dataset`, `categoryTree`, `budgets`, `mortgageModel`, `rangeFilter`, `drillState`, etc.), plus plain constants (`CLIENT_ID`, `API_KEY`, `REQUIRED_FILES`, tax-rate constants). **Signals are mutated by replacing with a shallow copy, never in place** — `x.value = { ...x.value, key: v }` — since a signal only re-renders subscribers when its `.value` reference changes.
- `auth.js` / `drive.js` — Google OAuth/Picker flow and the raw Drive API calls (`listFilesInFolder`, `downloadFile`, `updateFileContent`, `createFileInFolder`).
- `persistence.js` — `loadAllData()` (reads the 4 required files + `account_balances.json` + `app_settings.json`, migrating an older per-setting-file layout automatically if `app_settings.json` doesn't exist yet) and `saveAllChanges()` (writes them all back). Calls `initOverviewState()` (from `overview.js`) once loading finishes, to default `rangeFilter` and reset `drillState` — the equivalent of the original app's one-time "just finished loading" reset.
- One `<thing>.js` per feature for business logic (pure functions + signal-mutating actions), rendered by one or more components:
  - Dashboard cards: `overview.js`/`OverviewCard.jsx` (Spend chart + drill-down + range filter + stat row, with `BudgetProgress.jsx` inside), `SavingsCard.jsx`, `networth.js`/`NetWorthCard.jsx` (chart + range only), `transactions.js`/`TransactionsCard.jsx` (the transaction browser + `recategorizeTransaction`).
  - Settings tabs (`SettingsView.jsx`): `categories.js`/`CategoriesSettings.jsx` (category tree edit/merge/delete + the shared `migrateCategoryReferences`, plus `rules.js`/`RulesEditor.jsx`), `budgets.js`/`BudgetSettings.jsx`, `ProjectionSettings.jsx` (Net Worth's mortgage/income/ISK assumptions, from `networth.js`), `BankReferencesSettings.jsx`, and a Drive tab.
  - `import.js`/`ImportPanel.jsx` (file parsing + staging + save) in the Import modal; `insights.js`/`InsightsPanel.jsx` (the Anthropic-API-backed chat) and `NotesPanel.jsx` in the side panel.
- `lib/months.js`, `lib/dataset.js`, `lib/charts.js`, `lib/ui.js` — pure helpers shared across cards (month-label arithmetic, dataset/range-filter queries, Chart.js color/legend/trend-line helpers) and UI-only signals (`busy`, `view`, `settingsTab`, `panel`, `importOpen`, toasts, status line).
- `components/Overlay.jsx` (`Modal`, `SidePanel`), `SortableTable.jsx`, `Stat.jsx`, `Spinner.jsx`, `Icons.jsx`, `Toasts.jsx` — small reusable UI pieces.
- `app.jsx` — top-level layout: sign-in gate; a sticky header whose toolbar opens Import (modal), Notes and AI Insights (side panel) and Settings; then either the dashboard (Overview, Savings, Net Worth, Transactions) or the Settings view. A loading panel replaces both while `busy.kind === 'load'`.

Chart.js chart components (`OverviewCard`, `SavingsCard`, `NetWorthCard`) each keep their own Chart.js instance in a local `useRef` — never shared state — and sync it via `useSignalEffect` (not `useEffect`; `useEffect` only auto-tracks signals read directly in its own callback, not ones read deep inside a helper function it calls, which is how every chart's data-builder function works). A component that needs another chart's computed data (AI Insights, reading Net Worth/Savings figures) calls that chart's exported pure data-builder function directly rather than reaching into a shared Chart.js instance.

### Storage model

There is no backend. All persistent state lives as JSON files inside a single Google Drive folder the user selects via the Google Picker (`openFolderPicker` / `onFolderPicked` in `auth.js`). The app only ever requests the `drive.file` scope, so it can only see files it created or the user explicitly picked — not the user's whole Drive. The folder must contain exactly these four files (checked in `loadAllData`):

- `canonical_dataset.json` — the full array of transaction records (`{ id, month, merchant, amount, category, txn_date, card }`).
- `canonical_aliases.json` — raw merchant name → canonical merchant name map, used to collapse variant spellings before categorization.
- `canonical_overrides.json` — canonical merchant name → category, for user-corrected/forced categorization. Always takes priority over everything else.
- `merchant_category_lookup.json` — canonical merchant name → category, learned from prior categorization history (lower priority than overrides, higher than keyword rules).

Two more files are app-created (auto-created on first load if missing, no user setup needed):

- `account_balances.json` — `{ month: { accountName: balance } }`, the Net Worth card's manual/CSV-derived account balance history. Kept separate from `app_settings.json` below since `saveImport` (in `import.js`) writes it directly and immediately on a Sparkonto import (independent of the "Save to Drive" staging flow the rest of the settings use).
- `app_settings.json` — every other piece of app configuration bundled into one document (`categoryTree`, `budgets`, `budgetPeriods`, `iskYtdPct`, `notes`, `mortgageModel`, `sparkontoReferences`, `incomeModel`, `categorizationRules`, `categoryRoles` — see `buildAppSettings()` in `persistence.js`), consolidated from what used to be 7 separate small files. `loadAllData` migrates a pre-consolidation folder automatically (reads whichever old files are present, once) the first time it doesn't find `app_settings.json`.

The Drive folder ID is cached in `localStorage` (`FOLDER_STORAGE_KEY`) so re-signing-in doesn't require re-picking the folder, unless Drive reports the folder is no longer accessible (404), in which case the app clears the cached ID and prompts the user to reconnect.

Saving (`saveImport` in `import.js`) is a full read-modify-write: the in-memory `dataset`/`overrides` signals are updated, then the *entire* `canonical_dataset.json` and `canonical_overrides.json` contents are re-uploaded via `updateFileContent` (PATCH with `uploadType=media`). There's no partial update or diffing.

The original app also ran four one-time data-cleanup migrations on every load (old mortgage subcategories, placeholder loan entries, housing-fee merchant duplicates, an early fixed-term-deposit redemption). They were deliberately **retired, not ported**: they only rewrote older-format data, the original app had already applied them to the real data, and they matched on personal specifics that don't belong in this public repo. Their code is in the private archive repo if it's ever needed.

### Categorization pipeline (`categorization-engine.js`)

`categorizeMerchant(rawMerchant, aliases, overrides, learnedLookup, compiledRules)` resolves a category in strict priority order:

1. Alias resolution: raw merchant name → canonical name (`aliases` map), no-op if not found.
2. `overrides[canonical]` — explicit user override, always wins.
3. `learnedLookup[canonical]` — category learned from existing categorized history.
4. Categorization rules — the user's ordered `categorizationRules` (`[{ pattern, category }]`, case-insensitive regex source strings, stored in `app_settings.json`, edited in Settings → Categories & rules); first match wins. `DEFAULT_CATEGORIZATION_RULES` is only the starter set used until settings contain rules.
5. Fallback: `UNCATEGORIZED` (`"Other > Uncategorized"`), which also flags the row as needing manual review.

**No category names are hardcoded in logic, except two built-ins**: `EXCLUDED` (`"Excluded"`, left out of every total) and `UNCATEGORIZED`. Those (and the `Other` top level) can't be renamed/merged/deleted in the UI and are re-added to the tree on load if missing. Categories the parsers or charts need by *meaning* go through `categoryRoles` in `app_settings.json` (`housing`, `housingFee`, `mortgageCost`; defaults in `DEFAULT_CATEGORY_ROLES`) — e.g. the Net Worth mortgage line reads `categoryRoles.mortgageCost`. `migrateCategoryReferences` (`web/src/categories.js`) rewrites transactions, overrides, learned lookup, budgets, rules and roles together on every rename/merge, and deletes are refused while rules or roles still point at a category. Never add a literal category name to logic — add a role instead.

Categories are two-level (`"Top > Sub"`). The live tree is `categoryTree` in `app_settings.json`; `CATEGORY_TREE` in the engine is only the starter template for a brand-new folder.

`processImport(rawRows, format, aliases, overrides, learnedLookup, references, { rules, roles })` — `rules`/`roles` default to the built-in defaults, so plain-Node calls keep working. Each supported import format has its own row parser (`parseEuroBonusRows`, `parseAmexRows`, `parsePersonkontoRows`, `parseSparkontoRows`) that normalizes raw spreadsheet/CSV rows into a common shape (`{ txn_date, merchant, amount, card }`) before categorization. The Nordea parsers force structural rows (salary, transfers, card-bill payments, internal pot moves) to `EXCLUDED` and role rows (housing fee, loan rollover) to their role's category via `_forcedCategory` — these still lose to an explicit override, but bypass learned-lookup/rule matching. `parseSparkontoRows(rows, references)` and `parsePersonkontoRows(rows, references)` take a second argument — real bank reference numbers (ISK transfer, external savings, Personkonto-link, and the housing association's Bankgiro number `housingFeeBankgiro`) that live only in the user's private `sparkontoReferences` (part of `app_settings.json`, edited in Settings → Bank references), never hardcoded in this public source file — no personal identifiers (reference numbers, names, addresses, real figures) belong in this repo at all; an empty/unset reference deliberately never matches (`''.includes('')` is `true` for every string, so each check is guarded on the reference being non-empty first). `processImport` ties parsing and categorization together and splits results into `results` (all rows) and `unmatched` (rows that hit the `"Other > Uncategorized"` fallback and need a manual category pick in the UI).

### File import flow (`import.js` / `ImportPanel.jsx`, in the Import modal)

1. User picks a format (`format-pill` buttons set the `selectedFormat` signal: `eurobonus` .xlsx, `amex` .xlsx, `personkonto` .csv, or `sparkonto` .csv) and drops/selects a file.
2. `handleFile` routes to `parseXlsx` (via the `xlsx` npm package, reading specific named sheets and fixed header rows/ranges per format) or `parsePersonkontoCSV` (manual `;`-delimited parsing with BOM stripping) to get raw rows.
3. `processImport` (from the categorization engine) parses + categorizes, returning `{ results, unmatched }`; deduped against the existing dataset and staged onto the `pendingImport` signal — *not* saved yet.
4. `ImportPanel` shows unmatched rows with a category `<select>` per row (tracked as local component state) so the user can resolve them before saving.
5. `saveImport(choices)` applies the manually-picked categories, assigns new sequential `id`s (`max existing id + 1`), appends to `dataset`, and writes both `canonical_dataset.json` and `canonical_overrides.json` back to Drive.

### Dashboard / charts

- **Spend chart** (`OverviewCard.jsx`, `buildSpendChartData`/`buildSpendChartOptions`): a stacked bar chart with click-driven drill-down, tracked in the `drillState` signal (`{ level: 'top' | 'sub' | 'merchant', category }`). Clicking a top-level category bar drills into its subcategories (if `categoryTree` defines `subs` for it) or its top merchants (if not); only one level of drill-down is supported before returning via the breadcrumb "Back" button. At the merchant level, a summary table (merchant, transaction count, total) renders below the chart; at the subcategory level, hovering a bar shows the top 3 merchants for that subcategory/bucket in the tooltip.
- **Savings chart** (`SavingsCard.jsx`): stacked bars of spend per card plus a line for `salary − total spend` per month, keyed off transactions where `merchant === 'Lön (salary)'`.
- **Net Worth chart** (`NetWorthCard.jsx` / `networth.js`): Sparkonto balance + ISK/external-savings/fixed-term-deposit "pot" bars, plus multiple projection scenarios (salary-then-benefits, a live mortgage-rate/amortization simulation, a recent-trend extrapolation) driven by the `mortgageModel`/`incomeModel`/`iskYtdPct` signals.
- **Transactions browser** (`TransactionsCard.jsx` / `transactions.js`): a category/card filter plus a merchant search box, sharing the same `rangeFilter` signal as the Spend and Savings charts. Rows render as collapsible category/subcategory groups (`SortableTable`), each showing transaction count, % of the filtered total, and subtotal, expandable to the underlying transaction rows. Editing a row's category (`recategorizeTransaction`) recategorizes every transaction with that same merchant, not just the edited row.

All money amounts are in SEK ("kr"); dates are `YYYY-MM-DD`; month labels are `Mon-YY` (e.g. `Aug-26`), produced by `monthLabel()` in `lib/months.js`.
