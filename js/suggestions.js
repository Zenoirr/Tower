// ---------------------------------------------------------------------
// Community suggestions
// pls dont spam my webhook :c
const SUGGESTIONS_WEBHOOK_URL = 'https://discord.com/api/webhooks/1552140008906031104/OgajCkdRqfLCU5SJ-cyLszaMzVf5tT-czXrbXqaM-Hu6QL65yXoWeY-zu94CWtNLdJgG';
const SUGGESTION_RATE_LIMIT_MS = 60000;
const SUGGESTION_RATE_KEY = 'towerOfGoySuggestionLastSent:v1';

let currentSuggestion = { type: null, floor: null };

function suggestionCooldownRemainingMs() {
  try {
    const last = Number(localStorage.getItem(SUGGESTION_RATE_KEY) || 0);
    return Math.max(0, SUGGESTION_RATE_LIMIT_MS - (Date.now() - last));
  } catch (_) {
    return 0;
  }
}

function markSuggestionSent() {
  try { localStorage.setItem(SUGGESTION_RATE_KEY, String(Date.now())); } catch (_) {}
}

function setSuggestStatus(message, kind = '') {
  const statusEl = document.getElementById('suggestFormStatus');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = `suggest-status ${kind}`.trim();
}

function suggestFieldsHTML(type) {
  if (type === 'loadout') {
    return `
      <label class="suggest-field">
        <span>Team photo</span>
        <input type="file" id="suggestLoadoutFile" accept="image/*" required>
      </label>
      <label class="suggest-field">
        <span>Notes (optional)</span>
        <textarea id="suggestLoadoutNote" placeholder="Any extra info about the team, order, timing..." rows="3"></textarea>
      </label>
      <p class="suggest-note">Attach a screenshot/photo of the team used to clear this floor. It will be sent to the Tower of Goy Discord for review before it's added as the floor's loadout.</p>`;
  }

  return `
    <label class="suggest-field">
      <span>Strategy</span>
      <textarea id="suggestStrategyText" placeholder="Describe how to beat this floor..." rows="4" required></textarea>
    </label>
    <label class="suggest-field">
      <span>Video (optional)</span>
      <input type="url" id="suggestStrategyVideo" placeholder="https://...">
    </label>
    <p class="suggest-note">Your strategy (and video link, if any) will be sent to the Tower of Goy Discord for review before it's added to the floor.</p>`;
}

function openSuggestModal(type, floor) {
  currentSuggestion = { type, floor };
  const modal = document.getElementById('suggestModal');
  const kicker = document.getElementById('suggestModalKicker');
  const title = document.getElementById('suggestModalTitle');
  const subtitle = document.getElementById('suggestModalSubtitle');
  const fields = document.getElementById('suggestFormFields');
  const submitBtn = document.getElementById('suggestSubmit');
  if (!modal || !fields) return;

  kicker.textContent = type === 'loadout' ? 'SUGGEST LOADOUT' : 'SUGGEST STRATEGY';
  title.textContent = type === 'loadout' ? 'Suggest a loadout' : 'Suggest a strategy or video';
  subtitle.textContent = `Floor ${floor}`;
  fields.innerHTML = suggestFieldsHTML(type);
  setSuggestStatus('');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Send suggestion';

  modal.classList.remove('hidden');
  setTimeout(() => fields.querySelector('input, textarea')?.focus(), 50);
}

function closeSuggestModal() {
  document.getElementById('suggestModal')?.classList.add('hidden');
  currentSuggestion = { type: null, floor: null };
}

async function sendLoadoutSuggestion(floor) {
  const fileInput = document.getElementById('suggestLoadoutFile');
  const note = document.getElementById('suggestLoadoutNote')?.value.trim() || '';
  const file = fileInput?.files?.[0];
  if (!file) throw new Error('Please attach a team photo.');
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is too large (8MB max).');

  const formData = new FormData();
  formData.append('payload_json', JSON.stringify({
    embeds: [{
      title: `📥 Loadout suggestion — Floor ${floor}`,
      description: note || 'No additional notes provided.',
      color: 0x584fd0,
      timestamp: new Date().toISOString()
    }]
  }));
  formData.append('files[0]', file, file.name);

  const response = await fetch(SUGGESTIONS_WEBHOOK_URL, { method: 'POST', body: formData });
  if (!response.ok) throw new Error('Discord rejected the request. Try again later.');
}

async function sendStrategySuggestion(floor) {
  const text = document.getElementById('suggestStrategyText')?.value.trim() || '';
  const video = document.getElementById('suggestStrategyVideo')?.value.trim() || '';
  if (!text) throw new Error('Please describe the strategy.');

  const embed = {
    title: `📥 Strategy suggestion — Floor ${floor}`,
    description: text.slice(0, 3800),
    color: 0x58d6a4,
    timestamp: new Date().toISOString(),
    fields: video ? [{ name: 'Video', value: video.slice(0, 900) }] : []
  };

  const response = await fetch(SUGGESTIONS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });
  if (!response.ok) throw new Error('Discord rejected the request. Try again later.');
}

async function handleSuggestSubmit(event) {
  event.preventDefault();
  const { type, floor } = currentSuggestion;
  if (!type || !floor) return;

  const remaining = suggestionCooldownRemainingMs();
  if (remaining > 0) {
    setSuggestStatus(`Please wait ${Math.ceil(remaining / 1000)}s before sending another suggestion.`, 'error');
    return;
  }

  const submitBtn = document.getElementById('suggestSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';
  setSuggestStatus('Sending...', '');

  try {
    if (type === 'loadout') await sendLoadoutSuggestion(floor);
    else await sendStrategySuggestion(floor);

    markSuggestionSent();
    setSuggestStatus('Thanks! Your suggestion was sent for review.', 'success');
    submitBtn.textContent = 'Sent ✓';
    setTimeout(closeSuggestModal, 1400);
  } catch (error) {
    setSuggestStatus(error.message || 'Could not send the suggestion.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send suggestion';
  }
}

function setupSuggestModal() {
  const modal = document.getElementById('suggestModal');
  const form = document.getElementById('suggestForm');
  if (!modal || !form) return;

  form.addEventListener('submit', handleSuggestSubmit);
  document.getElementById('suggestClose')?.addEventListener('click', closeSuggestModal);
  modal.querySelector('.suggest-backdrop')?.addEventListener('click', closeSuggestModal);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeSuggestModal();
  });
}

function bindSuggestButtons(scope = document) {
  scope.querySelectorAll('[data-suggest-loadout]').forEach(button => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.stopPropagation();
      openSuggestModal('loadout', button.dataset.suggestLoadout);
    });
  });

  scope.querySelectorAll('[data-suggest-strategy]').forEach(button => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.stopPropagation();
      openSuggestModal('strategy', button.dataset.suggestStrategy);
    });
  });
}

setupSuggestModal();
