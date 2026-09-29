import { sparkontoReferences } from '../state.js';
import { setSparkontoReference } from '../import.js';

// Settings tab: private bank reference numbers the import parsers use. Placeholders are fake
// examples — the real values live only in the user's Drive settings.
export function BankReferencesSettings() {
  const refs = sparkontoReferences.value;
  return (
    <>
      <p class="panel-hint">
        Real reference numbers from your own transactions, stored only in your Drive settings.
        They let imports recognize internal transfers to your ISK, an external savings account, or
        your linked Personkonto (so the Net Worth chart can track those pots), and your housing
        association's Bankgiro payments. Leave a field blank to skip that rule.
      </p>
      <div class="mortgage-model-row">
        <label>ISK transfer reference <input type="text" class="budget-input" style={{ width: '140px' }} placeholder="e.g. 1234 56 78901"
          value={refs.isk} onChange={(e) => setSparkontoReference('isk', e.currentTarget.value)} /></label>
        <label>External savings reference <input type="text" class="budget-input" style={{ width: '140px' }} placeholder="e.g. 2345 67 89012"
          value={refs.externalSavings} onChange={(e) => setSparkontoReference('externalSavings', e.currentTarget.value)} /></label>
        <label>Personkonto↔Sparkonto link reference <input type="text" class="budget-input" style={{ width: '140px' }} placeholder="e.g. 3456 78 90123"
          value={refs.personkontoLink} onChange={(e) => setSparkontoReference('personkontoLink', e.currentTarget.value)} /></label>
        <label>Housing association Bankgiro <input type="text" class="budget-input" style={{ width: '140px' }} placeholder="e.g. 123-4567"
          value={refs.housingFeeBankgiro} onChange={(e) => setSparkontoReference('housingFeeBankgiro', e.currentTarget.value)} /></label>
      </div>
    </>
  );
}
