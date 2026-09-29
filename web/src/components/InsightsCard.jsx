import { useEffect, useState } from 'preact/hooks';
import { insightsConversation, ANTHROPIC_API_KEY_STORAGE_KEY } from '../state.js';
import { startInsightsConversation, sendInsightsChatMessage } from '../insights.js';
import { Spinner } from './Spinner.jsx';

// Port of index.html's AI Insights card. The API key input, "include merchant detail" checkbox,
// chat-input text, and status line are all local component state (ephemeral UI, not shared with
// anything else) — only `insightsConversation` (the running chat history) is a signal, since it's
// the one piece meant to persist for the life of the session the same way it did as a bare global.
export function InsightsCard() {
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
    <details class="card">
      <summary><h2>AI Insights</h2></summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 14px' }}>
        Generates natural-language insights from the same category totals, budgets, and net worth
        figures driving the charts above, using your own Anthropic API key — called directly from
        your browser, nothing passes through any server of ours. The key is cached in this
        browser's local storage, the same way the Drive folder id already is.
      </p>
      <div class="format-row">
        <input
          type="password" class="cat-select" placeholder="Anthropic API key (sk-ant-…)" style={{ flex: '1 1 260px' }}
          value={apiKeyInput} onInput={(e) => setApiKeyInput(e.currentTarget.value)}
        />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0', fontSize: '13px', color: 'var(--text-dim)' }}>
        <input type="checkbox" checked={includeMerchants} onChange={(e) => setIncludeMerchants(e.currentTarget.checked)} />
        Include individual transaction detail (merchant names/amounts) for richer insights
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
          type="text" class="cat-select" placeholder="Ask a follow-up… (e.g. why did groceries go up?)" style={{ flex: '1 1 260px' }}
          value={chatText}
          onInput={(e) => setChatText(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
        />
        <button class="btn-sm" onClick={handleSend}>Send</button>
      </div>
    </details>
  );
}
