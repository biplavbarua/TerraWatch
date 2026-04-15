/**
 * Chat panel — AI Q&A interface backed by the /api/ask endpoint.
 */
import { askAI } from '../api.js';

const SUGGESTIONS = [
  'What wildfires are active right now?',
  'Show me severe storms this week',
  'How many active events are there?',
  'Where are the most active volcanoes?',
  'Any floods in Asia right now?',
];

let _isOpen = false;

export function initChatPanel() {
  _buildSuggestions();
  _bindInput();
  _bindToggle();

  // Welcome message
  _appendMessage('ai', 'Hello! I have real-time access to NASA\'s natural disaster database. Ask me anything — active events, trends, statistics, or specific locations 🌍');
}

function _buildSuggestions() {
  const container = document.getElementById('chat-suggestions');
  if (!container) return;
  container.innerHTML = SUGGESTIONS.map(q => `
    <button class="suggestion-chip" data-q="${q}">${q}</button>
  `).join('');
  container.querySelectorAll('.suggestion-chip').forEach(btn => {
    btn.addEventListener('click', () => _submitQuestion(btn.dataset.q));
  });
}

function _bindInput() {
  const input  = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  if (!input || !sendBtn) return;

  sendBtn.addEventListener('click', () => {
    const q = input.value.trim();
    if (q) { input.value = ''; _submitQuestion(q); }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const q = input.value.trim();
      if (q) { input.value = ''; _submitQuestion(q); }
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
}

function _bindToggle() {
  const chatBtn = document.getElementById('chat-toggle-btn');
  const closeBtn = document.getElementById('chat-close');
  const panel = document.getElementById('chat-panel');

  chatBtn?.addEventListener('click', () => toggleChatPanel());
  closeBtn?.addEventListener('click', () => toggleChatPanel(false));
}

export function toggleChatPanel(force) {
  _isOpen = force !== undefined ? force : !_isOpen;
  const panel = document.getElementById('chat-panel');
  const btn   = document.getElementById('chat-toggle-btn');
  panel?.classList.toggle('open', _isOpen);
  btn?.classList.toggle('active', _isOpen);
}

async function _submitQuestion(question) {
  if (!question.trim()) return;
  _appendMessage('user', question);
  const indicator = _appendTyping();

  try {
    const answer = await askAI(question);
    indicator.remove();
    _appendMessage('ai', answer);
  } catch (err) {
    indicator.remove();
    _appendMessage('ai', `Sorry, I ran into an error: ${err.message}`);
  }
}

function _appendMessage(role, text) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="msg-bubble">${_escapeHtml(text).replace(/\n/g, '<br>')}</div>
    <span class="msg-time">${time}</span>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function _appendTyping() {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.innerHTML = `
    <div class="typing-indicator">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function _escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
