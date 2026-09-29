// Port of index.html's AI Insights logic — updated to read signals instead of bare globals, and
// to pull chart data from buildNetWorthChartData()/buildSavingsChartData() (exported by their
// owning components) instead of reaching into `netWorthChartInstance`/`savingsChartInstance`
// directly. Chart.js instance handles are deliberately not shared state in this app (see
// state.js's file-level comment) — recomputing the same pure data is simpler than threading a
// ref through, and it means this summary is always available, not conditional on those charts
// having mounted first.

import { categoryTree, budgetPeriods, insightsConversation, ANTHROPIC_API_KEY_STORAGE_KEY } from './state.js';
import { effectiveMonthlyBudget } from './budgets.js';
import { visibleMonths, actualSpendForPath, rangeFilteredDataset } from './lib/dataset.js';
import { buildNetWorthChartData } from './components/NetWorthCard.jsx';
import { buildSavingsChartData } from './components/SavingsCard.jsx';
import { showToast } from './lib/ui.js';

// Builds a plain-text summary for the LLM prompt, reusing already-computed state rather than
// re-deriving anything: the Budgets card's own helpers for budget vs actual, and the Net Worth/
// Savings charts' own data-builder functions for trajectory and savings-rate figures.
export function buildInsightsSummary(includeMerchantDetail) {
  const lines = [];

  // Two independent selectors exist in this app — the Overview/Savings/Transactions range
  // (rangeFilter) and the Net Worth chart's own (netWorthRangeFilter), which can cover a
  // different span (e.g. extending into future projected months). State both explicitly so
  // Claude frames its answer around the period actually selected, not "all time."
  const months = visibleMonths();
  if (months.length) {
    lines.push(`Selected date range (Overview/Savings/Transactions): ${months[0]} through ${months[months.length - 1]} (${months.length} month${months.length === 1 ? '' : 's'})`);
  }
  const netWorthData = buildNetWorthChartData();
  const nwLabels = netWorthData.labels;
  if (nwLabels.length) {
    lines.push(`Selected date range (Net Worth chart, may differ from above and can extend into future projected months): ${nwLabels[0]} through ${nwLabels[nwLabels.length - 1]}`);
  }
  lines.push('');

  const monthCount = Math.max(months.length, 1);
  lines.push('## Monthly budget vs actual spend (selected date range above, kr/month unless noted otherwise)');
  categoryTree.value.forEach(entry => {
    if (entry.key === 'Excluded') return;
    const monthlyBudget = effectiveMonthlyBudget(entry);
    const avgActual = actualSpendForPath(entry.key, true) / monthCount;
    const isAnnual = budgetPeriods.value[entry.key] === 'year';
    const budgetTxt = monthlyBudget
      ? (isAnnual ? `${Math.round(monthlyBudget * 12)} kr/year (non-recurring/lumpy spend, budgeted annually rather than monthly)` : `${Math.round(monthlyBudget)} kr/month`)
      : 'none set';
    lines.push(`- ${entry.key}: budget ${budgetTxt}, actual ~${Math.round(avgActual)} kr/month over the selected range`);
  });

  lines.push('', '## Net worth (Sparkonto + ISK + external savings + fixed-term deposit), by month, kr — includes both real history and the current projection scenarios');
  netWorthData.datasets.forEach(ds => {
    const points = nwLabels.map((m, i) => (ds.data[i] != null ? `${m}: ${Math.round(ds.data[i])}` : null)).filter(Boolean);
    if (points.length) lines.push(`${ds.label} — ${points.join(', ')}`);
  });

  const savingsData = buildSavingsChartData();
  const savingsDs = savingsData.datasets.find(d => d.label === 'Savings (salary − spend)');
  if (savingsDs) {
    lines.push('', '## Monthly savings (salary minus spend), kr');
    const sLabels = savingsData.labels;
    const points = sLabels.map((m, i) => (savingsDs.data[i] != null ? `${m}: ${Math.round(savingsDs.data[i])}` : null)).filter(Boolean);
    lines.push(points.join(', '));
  }

  if (includeMerchantDetail) {
    // Same selected range as the budget section above (not a fixed "last 3 months") — capped at
    // 150 rows, largest-first, to bound token cost if the range is long.
    const rows = rangeFilteredDataset()
      .filter(t => t.category !== 'Excluded')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 150);
    lines.push('', '## Individual transactions in the selected date range, largest first (date | merchant | amount kr | category)');
    rows.forEach(t => lines.push(`${t.txn_date} | ${t.merchant} | ${Math.round(t.amount)} | ${t.category}`));
  }

  return lines.join('\n');
}

export async function callAnthropicMessages(apiKey, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Documented opt-in for calling the API directly from browser JS — the "bring your own
      // key" pattern this feature relies on instead of standing up a server-side proxy.
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    })
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`${res.status} ${errBody}`);
  }
  const data = await res.json();
  return (data.content || []).map(b => b.text || '').join('\n').trim();
}

// Reads the key from the input value (falling back to whatever's cached), persisting it back to
// localStorage so it survives a reload — same cache-locally pattern as FOLDER_STORAGE_KEY.
function getStoredApiKey(apiKeyInputValue) {
  const apiKey = (apiKeyInputValue || '').trim() || localStorage.getItem(ANTHROPIC_API_KEY_STORAGE_KEY) || '';
  if (apiKey) localStorage.setItem(ANTHROPIC_API_KEY_STORAGE_KEY, apiKey);
  return apiKey;
}

async function sendPendingInsightsRequest(apiKey, setInsightsStatus) {
  setInsightsStatus('Asking Claude…');
  try {
    const replyText = await callAnthropicMessages(apiKey, insightsConversation.value);
    setInsightsStatus('');
    insightsConversation.value = [...insightsConversation.value, { role: 'assistant', content: replyText || 'No response text returned.' }];
  } catch (err) {
    setInsightsStatus('');
    showToast('Insights request failed: ' + err.message, 'error');
    console.error(err);
  }
}

export async function startInsightsConversation(apiKeyInputValue, includeMerchantDetail, setInsightsStatus) {
  const apiKey = getStoredApiKey(apiKeyInputValue);
  if (!apiKey) {
    showToast('Enter your Anthropic API key first.', 'error');
    return;
  }

  const summary = buildInsightsSummary(includeMerchantDetail);
  const prompt = 'You\'re a personal finance assistant. Based on this summarized financial ' +
    'data (amounts in SEK), give 3-5 concise, specific insights about spending trends, ' +
    'budget adherence, and savings/net worth trajectory. Be direct and specific with ' +
    'numbers, not generic advice. The user may ask follow-up questions after this — answer ' +
    'those using the same data below.\n\n' + summary;

  insightsConversation.value = [{ role: 'user', content: prompt, isSummaryPrompt: true }];
  await sendPendingInsightsRequest(apiKey, setInsightsStatus);
}

export async function sendInsightsChatMessage(text, apiKeyInputValue, setInsightsStatus) {
  if (!text) return;
  if (!insightsConversation.value.length) {
    showToast('Click "Generate insights" first to start the conversation.', 'error');
    return;
  }
  const apiKey = getStoredApiKey(apiKeyInputValue);
  if (!apiKey) {
    showToast('Enter your Anthropic API key first.', 'error');
    return;
  }

  insightsConversation.value = [...insightsConversation.value, { role: 'user', content: text }];
  await sendPendingInsightsRequest(apiKey, setInsightsStatus);
}
