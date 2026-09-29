import { useState } from 'preact/hooks';
import { categorizationRules, categoryRoles } from '../state.js';
import { validMergeTargets } from '../categories.js';
import { isValidPattern, findMatchingRule, addRule, updateRule, moveRule, deleteRule, setRole } from '../rules.js';

const ROLE_LABELS = {
  housing: 'Housing (its budget is replaced by the mortgage simulation in Net Worth)',
  housingFee: 'Housing-association fee (Personkonto Bankgiro payment)',
  mortgageCost: 'Mortgage cost (Sparkonto loan rollover; Net Worth mortgage line)'
};

// A <select> over every category, plus the current value if it no longer exists in the tree (so
// a stale target stays visible instead of silently snapping to the first option).
function CategorySelect({ value, onChange, allowEmpty }) {
  const options = validMergeTargets();
  const missing = value && !options.includes(value);
  return (
    <select class="cat-select" value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      {allowEmpty && <option value="">(choose category)</option>}
      {missing && <option value={value}>{value} (missing)</option>}
      {options.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

function TestBox() {
  const [merchant, setMerchant] = useState('');
  const match = merchant.trim() ? findMatchingRule(merchant.trim()) : null;
  return (
    <div class="mortgage-model-row" style={{ marginTop: '10px' }}>
      <label>Test a merchant name
        <input type="text" class="budget-input" style={{ width: '200px', textAlign: 'left' }} placeholder="e.g. RYANAIR DUBLIN"
          value={merchant} onInput={(e) => setMerchant(e.currentTarget.value)} />
      </label>
      {merchant.trim() && (
        <span>
          {match ? `→ rule #${match.index + 1}: ${match.category}` : '→ no rule matches (goes to manual review, unless it has an override or learned category)'}
        </span>
      )}
    </div>
  );
}

export function RulesEditor() {
  const rules = categorizationRules.value;
  const options = validMergeTargets();

  return (
    <details style={{ marginTop: '16px' }}>
      <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-dim)' }}>
        Auto-categorization rules ({rules.length})
      </summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: '8px 0 10px' }}>
        Used for newly imported merchants that have no override and no learned category yet. Each
        pattern is a case-insensitive regular expression tried against the merchant name, top to
        bottom; the first match wins. Renaming or merging a category updates these automatically.
      </p>
      {rules.map((rule, i) => {
        const invalid = rule.pattern && !isValidPattern(rule.pattern);
        const missing = rule.category && !options.includes(rule.category);
        return (
          <div key={i} class="cat-tree-sub-row">
            <span style={{ minWidth: '24px' }}>#{i + 1}</span>
            <input
              type="text" class="budget-input" placeholder="pattern, e.g. RYANAIR|NORWEGIAN"
              style={{ flex: '1 1 240px', width: 'auto', textAlign: 'left', borderColor: invalid ? 'var(--danger)' : undefined }}
              value={rule.pattern} onInput={(e) => updateRule(i, 'pattern', e.currentTarget.value)}
            />
            <CategorySelect value={rule.category} allowEmpty onChange={(v) => updateRule(i, 'category', v)} />
            <span class="cat-tree-actions">
              <button onClick={() => moveRule(i, -1)} disabled={i === 0} title="Move up">▲</button>
              <button onClick={() => moveRule(i, 1)} disabled={i === rules.length - 1} title="Move down">▼</button>
              <button onClick={() => deleteRule(i)}>Delete</button>
            </span>
            {invalid && <span style={{ color: 'var(--danger)', fontSize: '12px', flexBasis: '100%' }}>Not a valid regular expression — ignored until fixed.</span>}
            {missing && <span style={{ color: 'var(--warn)', fontSize: '12px', flexBasis: '100%' }}>"{rule.category}" isn't in your category tree.</span>}
          </div>
        );
      })}
      <div style={{ marginTop: '10px' }}>
        <button class="btn-sm" onClick={addRule}>+ Add rule</button>
      </div>
      <TestBox />

      <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-dim)' }}>Special categories</div>
      {Object.keys(ROLE_LABELS).map(role => (
        <div key={role} class="cat-tree-sub-row">
          <span>{ROLE_LABELS[role]}</span>
          <CategorySelect value={categoryRoles.value[role]} onChange={(v) => setRole(role, v)} />
        </div>
      ))}
    </details>
  );
}
