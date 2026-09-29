import { signal } from '@preact/signals';
import { todayMonthLabel, addMonthsToLabel } from './lib/months.js';

// ============================================================
// CONFIGURATION — plain constants, never change, not signals.
// Verbatim port from index.html.
// ============================================================
export const CLIENT_ID = '312075890401-qh3mmofr68m9baujmbiv2uqu9ft8n8af.apps.googleusercontent.com';
export const APP_ID = CLIENT_ID.split('-')[0];
export const API_KEY = 'AIzaSyC6c4cHh7sdor57Eqn22bmMy2_6RVyWTvs'; // Restricted to Google Picker API + your GitHub Pages origin
export const DRIVE_FOLDER_NAME = 'Expense Tracker App';
export const SCOPES = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_STORAGE_KEY = 'expense_tracker_folder_id';
export const ANTHROPIC_API_KEY_STORAGE_KEY = 'expense_tracker_anthropic_api_key';
export const REQUIRED_FILES = ['canonical_dataset.json', 'canonical_aliases.json', 'canonical_overrides.json', 'merchant_category_lookup.json'];
export const NET_WORTH_ACCOUNT = 'Sparkonto';
export const MUNICIPAL_TAX_RATE = 0.30; // approximate Swedish municipal + regional income-tax rate, no church tax
export const STATE_TAX_RATE = 0.20;
export const STATE_TAX_MONTHLY_THRESHOLD = 51900; // approx monthly brytpunkt for statlig inkomstskatt

// ============================================================
// SHARED REACTIVE STATE — every signal a migrated component can read/write directly, no prop
// drilling. Ports the 41 top-level `let`/`const` declarations from index.html.
//
// IMPORTANT (see the plan's "single most important thing to get right" note): signals detect
// changes by reference, not deep equality. Any nested object/array field (budgets, mortgageModel's
// schedule arrays, incomeModel.benefitTiers, etc.) must be replaced with a shallow copy on every
// mutation — `x.value = { ...x.value, key: newValue }` — never mutated in place, or the relevant
// component simply won't re-render.
//
// Chart.js instance handles (chartInstance/savingsChartInstance/netWorthChartInstance in the old
// code) are deliberately NOT ported here — they're imperative refs, not reactive read state, and
// belong as local useRef()s inside their owning chart component once that component's slice lands.
// ============================================================

// --- Auth/Drive shell ---
export const accessToken = signal(null);
export const folderId = signal(null);
export const fileIds = signal({}); // { 'canonical_dataset.json': '<driveFileId>', ... }

// --- Core transaction data + categorization config ---
export const dataset = signal([]);
export const aliases = signal({});
export const overrides = signal({});
export const learnedLookup = signal({});
export const categoryTree = signal([]); // live, user-editable taxonomy

// --- app_settings.json fields ---
export const budgets = signal({});
export const budgetPeriods = signal({});
export const iskYtdPct = signal(0);
export const notes = signal('');
export const mortgageModel = signal({
  loanBalance: 0,
  originalLoanAmount: 0,
  currentInterestRate: 2,
  quarterlyInterestRates: [null, null, null, null],
  currentAmortizationRate: 2,
  amortizationSchedule: [
    { month: null, rate: null }, { month: null, rate: null },
    { month: null, rate: null }, { month: null, rate: null }
  ]
});
// Private bank reference numbers used by categorization-engine.js's parsers (never hardcoded in the
// public source). The name predates housingFeeBankgiro, which the Personkonto parser reads.
export const DEFAULT_BANK_REFERENCES = { isk: '', externalSavings: '', personkontoLink: '', housingFeeBankgiro: '' };
export const sparkontoReferences = signal({ ...DEFAULT_BANK_REFERENCES });
// User-editable categorization rules ([{ pattern, category }], ordered) and role categories
// ({ housing, housingFee, mortgageCost }) — seeded from categorization-engine.js's defaults
// (classic-script globals) until loadAllData() replaces them with the saved settings.
export const categorizationRules = signal(DEFAULT_CATEGORIZATION_RULES.map(r => ({ ...r })));
export const categoryRoles = signal({ ...DEFAULT_CATEGORY_ROLES });
export const incomeModel = signal({
  regularSalaryCutoff: todayMonthLabel(),
  projectedMonthlySalary: 0,
  benefitTiers: [
    { throughMonth: 3, gross: 0 },
    { throughMonth: 5, gross: 0 },
    { throughMonth: 10, gross: 0 }
  ]
});

// --- account_balances.json (kept separate from app_settings.json, see persistence.js) ---
export const accountBalances = signal({}); // { month ("Mon-YY"): { [NET_WORTH_ACCOUNT]: balance } }

// --- UI-only state (not persisted) ---
export const selectedFormat = signal('eurobonus');
export const pendingImport = signal(null); // { results, unmatched, format }
export const drillState = signal({ level: 'top', category: null }); // 'top' | 'sub' | 'merchant'
export const rangeFilter = signal({ from: null, to: null });
// Default visible period when data loads: charts look back DEFAULT_HISTORY_MONTHS, and the Net
// Worth chart also projects DEFAULT_PROJECTION_MONTHS ahead. Applied by initOverviewState() on
// every load; the user can widen either range with the From/To pickers.
export const DEFAULT_HISTORY_MONTHS = 12;
export const DEFAULT_PROJECTION_MONTHS = 3;
export function defaultNetWorthRange() {
  const today = todayMonthLabel();
  return { from: addMonthsToLabel(today, -DEFAULT_HISTORY_MONTHS), to: addMonthsToLabel(today, DEFAULT_PROJECTION_MONTHS) };
}
// Net Worth chart's own independent range (unlike rangeFilter above) — its "To" end is what pulls
// the projection forward into future months.
export const netWorthRangeFilter = signal(defaultNetWorthRange());
export const unsavedChanges = signal(false);
export const insightsConversation = signal([]);
