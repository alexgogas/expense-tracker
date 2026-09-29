import { useEffect, useState } from 'preact/hooks';
import { insightsConversation, ANTHROPIC_API_KEY_STORAGE_KEY } from '../state.js';
import { startInsightsConversation, sendInsightsChatMessage } from '../insights.js';
import { Spinner } from './Spinner.jsx';

// Side-panel content (see app.jsx). The API key input, "include merchant detail" checkbox,
// chat-input text, and status line are local component state; only `insightsConversation` (the
// running chat) is a signal, so it survives closing and reopening the panel.
export function InsightsPanel() {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [includeMerchants, setIncludeMerchants] = useState(false);
  const [status, setStatus] = useState('');
  const [chatText, setChatText] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(ANTHROPIC_API_KEY_STORAGE_KEY);
    if (stored) setApiKeyInput(stored);
  }, []);

  function handleSend() {
    const text = chatText.trim();
    if (!text) return;
    setChatText('');
    sendInsightsChatMessage(text, apiKeyInput, setStatus);
  }

  return (
    <>
      <p class="panel-hint">
        Insights from the same category totals, budgets, and net worth figures the charts use,
        generated with your own Anthropic API key — called directly from your browser, nothing
        passes through any server of ours. The key is cached in this browser's local storage.
      </p>
      <input
        type="password" class="cat-select" placeholder="Anthropic API key (sk-ant-…)" style={{ width: '100%' }}
        value={apiKeyInput} onInput={(e) => setApiKeyInput(e.currentTarget.value)}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0', fontSize: '13px', color: 'var(--text-dim)' }}>
        <input type="checkbox" checked={includeMerchants} onChange={(e) => setIncludeMerchants(e.currentTarget.checked)} />
        Include individual transactions (merchant names/amounts) for richer insights
      </label>
      <button class="btn-sm" onClick={() => startInsightsConversation(apiKeyInput, includeMerchants, setStatus)}>Generate insights</button>
      <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-dim)' }} role="status">{status && <><Spinner /> {status}</>}</div>
      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {insightsConversation.value.map((msg, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.5', color: msg.role === 'user' ? 'var(--text-dim)' : undefined }}>
            {msg.role === 'user' ? 'You: ' + (msg.isSummaryPrompt ? '(requested insights from your current data)' : msg.content) : msg.content}
          </div>
        ))}
      </div>
      <div class="format-row" style={{ marginTop: '10px' }}>
        <input
          type="text" class="cat-select" placeholder="Ask a follow-up… (e.g. why did groceries go up?)" style={{ flex: '1 1 200px' }}
          value={chatText}
          onInput={(e) => setChatText(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
        />
        <button class="btn-sm" onClick={handleSend}>Send</button>
      </div>
    </>
  );
}
