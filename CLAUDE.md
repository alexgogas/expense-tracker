# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal expense tracker: a static, single-page app (no build step, no package manager, no tests) that reads and writes its data as JSON files in a user's Google Drive folder. There are two source files:

- `index.html` — the entire UI: styling, Google auth/Drive integration, dashboard charts, transaction browser, and file import flow, all in one `<script>` block.
- `categorization-engine.js` — a standalone, dependency-free engine that parses bank/card export files and assigns categories to transactions. Loaded by `index.html` via `<script src="categorization-engine.js">`, but also exports via `module.exports` (guarded by `typeof module !== 'undefined'`) so it can be required from Node for testing/reuse.

## Running / developing

There is no build, lint, or test command — open `index.html` directly in a browser (or serve the directory with any static file server) to run the app. Changes to either file take effect on reload.

Because Drive API calls (`driveFetch`, the OAuth flow) require a live Google account, folder, and the app's own `CLIENT_ID`/`API_KEY` (hardcoded near the top of the `<script>` block in `index.html`), most UI flows can only be manually verified end-to-end while signed in with Drive access. The categorization engine (`categorization-engine.js`) has no such dependency and can be exercised standalone via Node (`node -e "..."` or a scratch script using `require('./categorization-engine.js')`).

## Architecture

### Storage model

There is no backend. All persistent state lives as JSON files inside a single Google Drive folder the user selects via the Google Picker (`openFolderPicker` / `onFolderPicked`). The app only ever requests the `drive.file` scope, so it can only see files it created or the user explicitly picked — not the user's whole Drive. The folder must contain exactly these four files (checked in `loadAllData`):

- `canonical_dataset.json` — the full array of transaction records (`{ id, month, merchant, amount, category, txn_date, card }`).
- `canonical_aliases.json` — raw merchant name → canonical merchant name map, used to collapse variant spellings before categorization.
- `canonical_overrides.json` — canonical merchant name → category, for user-corrected/forced categorization. Always takes priority over everything else.
- `merchant_category_lookup.json` — canonical merchant name → category, learned from prior categorization history (lower priority than overrides, higher than keyword rules).

The Drive folder ID is cached in `localStorage` (`FOLDER_STORAGE_KEY`) so re-signing-in doesn't require re-picking the folder, unless Drive reports the folder is no longer accessible (404), in which case the app clears the cached ID and prompts the user to reconnect.

Saving (`saveImport`) is a full read-modify-write: the in-memory `dataset`/`overrides` are updated, then the *entire* `canonical_dataset.json` and `canonical_overrides.json` contents are re-uploaded via `updateFileContent` (PATCH with `uploadType=media`). There's no partial update or diffing.

### Categorization pipeline (`categorization-engine.js`)

`categorizeMerchant(rawMerchant, aliases, overrides, learnedLookup)` resolves a category in strict priority order:

1. Alias resolution: raw merchant name → canonical name (`aliases` map), no-op if not found.
2. `overrides[canonical]` — explicit user override, always wins.
3. `learnedLookup[canonical]` — category learned from existing categorized history.
4. `KEYWORD_RULES` — ordered list of regexes tested against the canonical name; first match wins.
5. Fallback: `"Other > Uncategorized"`, which also flags the row as needing manual review.

Categories are two-level (`"Top > Sub"`) and defined in `CATEGORY_TREE`; only some top-level categories have subcategories (see the `subs` field). `LEAF_CATEGORIES` is the flattened list of all valid leaf category strings, used to populate category `<select>` dropdowns in the UI.

Each supported import format has its own row parser (`parseEuroBonusRows`, `parseAmexRows`, `parsePersonkontoRows`) that normalizes raw spreadsheet/CSV rows into a common shape (`{ txn_date, merchant, amount, card }`) before categorization. The Nordea "Personkonto" parser additionally applies hardcoded rules to force certain rows to `Excluded` or a specific category (e.g. salary deposits, card bill payments, certain Swish transfers) via `_forcedCategory` — these still lose to an explicit override, but bypass keyword/learned-lookup matching. `processImport` ties parsing and categorization together and splits results into `results` (all rows) and `unmatched` (rows that hit the `"Other > Uncategorized"` fallback and need a manual category pick in the UI).

`generateLoanEntries(monthLabel)` generates fixed recurring mortgage/utility line items (interest, amortization, utilities — amounts hardcoded in `LOAN_MONTHLY`) for a given month. It's defined and exported but not currently called anywhere in `index.html` — treat it as a manually-invoked/future-use helper, not part of the live import flow.

### File import flow (in `index.html`)

1. User picks a format (`format-pill` buttons set `selectedFormat`: `eurobonus` .xlsx, `amex` .xlsx, or `personkonto` .csv) and drops/selects a file.
2. `handleFile` routes to `parseXlsx` (via SheetJS/`XLSX`, reading specific named sheets and fixed header rows/ranges per format) or `parsePersonkontoCSV` (manual `;`-delimited parsing with BOM stripping) to get raw rows.
3. `processImport` (from the categorization engine) parses + categorizes, returning `pendingImport = { results, unmatched, format }`, which is *not* saved yet.
4. `renderImportResults` shows unmatched rows with a category `<select>` per row so the user can resolve them.
5. `saveImport` applies any manual category picks as new `overrides` entries, assigns new sequential `id`s (`max existing id + 1`), appends to `dataset`, and writes both `canonical_dataset.json` and `canonical_overrides.json` back to Drive.

### Dashboard / charts

`renderOverview` drives three views off the in-memory `dataset`, all using Chart.js:

- **Spend chart** (`renderSpendChart`): a stacked bar chart with click-driven drill-down, tracked in `drillState` (`{ level: 'top' | 'sub' | 'merchant', category }`). Clicking a top-level category bar drills into its subcategories (if `CATEGORY_TREE` defines `subs` for it) or its top merchants (if not); only one level of drill-down is supported before returning via the breadcrumb "Back" button. At the merchant level, a summary table (merchant, transaction count, total) renders below the chart via `renderMerchantSummary`; at the subcategory level, hovering a bar shows the top 3 merchants for that subcategory/month in the tooltip.
- **Savings chart** (`renderSavingsChart`): stacked bars of spend per card plus a line for `salary − total spend` per month, keyed off transactions where `merchant === 'Lön (salary)'`.
- **Transactions browser** (`renderTransactionsBrowser` / `drawTransactionsTable`): a category filter plus a global From/To month range (`rangeFilter`, set via the range selectors in the Overview card) that also drives the spend and savings charts. Rows render as collapsible category/subcategory groups (`<details>`, built by `renderCategoryGroup`), each showing transaction count, % of the filtered total, and subtotal, expandable to the underlying transaction rows.

All money amounts are in SEK ("kr"); dates are `YYYY-MM-DD`; month labels are `Mon-YY` (e.g. `Aug-26`), produced by `monthLabel()`.
