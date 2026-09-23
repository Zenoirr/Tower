const SUGGESTIONS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbw_MWfQHsPGFN7kalOFFBXqGzHN5zttO7qPGaa8zVvkc8SxBhpGLfONHaHlSc6wThSgZw/exec';
const SUGGESTION_RATE_LIMIT_MS = 60000;
const SUGGESTION_RATE_KEY = 'towerOfGoySuggestionLastSent:v1';

let currentSuggestion = {
  type: null,
  floor: null
};

function suggestionCooldownRemainingMs() {
  try {
    const last = Number(localStorage.getItem(SUGGESTION_RATE_KEY) || 0);

    return Math.max(
      0,
      SUGGESTION_RATE_LIMIT_MS - (Date.now() - last)
    );
  } catch (_) {
    return 0;
  }
}

function markSuggestionSent() {
  try {
    localStorage.setItem(
      SUGGESTION_RATE_KEY,
      String(Date.now())
    );
  } catch (_) {}
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
        <input
          type="file"
          id="suggestLoadoutFile"
          accept="image/*"
          required
        >
      </label>

      <label class="suggest-field">
        <span>Notes (optional)</span>
        <textarea
          id="suggestLoadoutNote"
          placeholder="Any extra info about the team, order, timing..."
          rows="3"
        ></textarea>
      </label>

      <p class="suggest-note">
        Attach a screenshot/photo of the team used to clear this floor.
        It will be sent to the Tower of Goy Discord for review before
        it's added as the floor's loadout.
      </p>
    `;
  }

  return `
    <label class="suggest-field">
      <span>Strategy</span>
      <textarea
        id="suggestStrategyText"
        placeholder="Describe how to beat this floor..."
        rows="4"
        required
      ></textarea>
    </label>

    <label class="suggest-field">
      <span>Video (optional)</span>
      <input
        type="url"
        id="suggestStrategyVideo"
        placeholder="https://..."
      >
    </label>

    <p class="suggest-note">
      Your strategy (and video link, if any) will be sent to the
      Tower of Goy Discord for review before it's added to the floor.
    </p>
  `;
}

function openSuggestModal(type, floor) {
  currentSuggestion = {
    type,
    floor
  };

  const modal = document.getElementById('suggestModal');
  const kicker = document.getElementById('suggestModalKicker');
  const title = document.getElementById('suggestModalTitle');
  const subtitle = document.getElementById('suggestModalSubtitle');
  const fields = document.getElementById('suggestFormFields');
  const submitBtn = document.getElementById('suggestSubmit');

  if (!modal || !fields) return;

  kicker.textContent =
    type === 'loadout'
      ? 'SUGGEST LOADOUT'
      : 'SUGGEST STRATEGY';

  title.textContent =
    type === 'loadout'
      ? 'Suggest a loadout'
      : 'Suggest a strategy or video';

  subtitle.textContent = `Floor ${floor}`;

  fields.innerHTML = suggestFieldsHTML(type);

  setSuggestStatus('');

  submitBtn.disabled = false;
  submitBtn.textContent = 'Send suggestion';

  modal.classList.remove('hidden');

  setTimeout(() => {
    fields.querySelector('input, textarea')?.focus();
  }, 50);
}

function closeSuggestModal() {
  const modal = document.getElementById('suggestModal');

  if (modal) {
    modal.classList.add('hidden');
  }

  currentSuggestion = {
    type: null,
    floor: null
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIndex = result.indexOf(',');

      if (commaIndex === -1) {
        reject(new Error('Could not read the image.'));
        return;
      }

      resolve({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: result.slice(commaIndex + 1)
      });
    };

    reader.onerror = () => {
      reject(new Error('Could not read the image.'));
    };

    reader.readAsDataURL(file);
  });
}

async function sendLoadoutSuggestion(floor) {
  const fileInput =
    document.getElementById('suggestLoadoutFile');

  const note =
    document
      .getElementById('suggestLoadoutNote')
      ?.value
      .trim() || '';

  const file = fileInput?.files?.[0];

  if (!file) {
    throw new Error('Please attach a team photo.');
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error('That image is too large (8MB max).');
  }

  const image = await fileToBase64(file);

  const response = await fetch(
    SUGGESTIONS_PROXY_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        type: 'loadout',
        floor: String(floor),
        note: note,
        image: image
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      'The suggestion could not be sent. Try again later.'
    );
  }

  const result =
    await response
      .json()
      .catch(() => null);

  if (!result || result.success !== true) {
    throw new Error(
      result?.error ||
      'The suggestion could not be sent.'
    );
  }
}

async function sendStrategySuggestion(floor) {
  const text =
    document
      .getElementById('suggestStrategyText')
      ?.value
      .trim() || '';

  const video =
    document
      .getElementById('suggestStrategyVideo')
      ?.value
      .trim() || '';

  if (!text) {
    throw new Error(
      'Please describe the strategy.'
    );
  }

  const response = await fetch(
    SUGGESTIONS_PROXY_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        type: 'strategy',
        floor: String(floor),
        text: text.slice(0, 3800),
        video: video.slice(0, 900)
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      'The suggestion could not be sent. Try again later.'
    );
  }

  const result =
    await response
      .json()
      .catch(() => null);

  if (!result || result.success !== true) {
    throw new Error(
      result?.error ||
      'The suggestion could not be sent.'
    );
  }
}

async function handleSuggestSubmit(event) {
  event.preventDefault();

  const {
    type,
    floor
  } = currentSuggestion;

  if (!type || !floor) return;

  const remaining =
    suggestionCooldownRemainingMs();

  if (remaining > 0) {
    setSuggestStatus(
      `Please wait ${Math.ceil(
        remaining / 1000
      )}s before sending another suggestion.`,
      'error'
    );

    return;
  }

  const submitBtn =
    document.getElementById('suggestSubmit');

  if (!submitBtn) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  setSuggestStatus('Sending...', '');

  try {
    if (type === 'loadout') {
      await sendLoadoutSuggestion(floor);
    } else {
      await sendStrategySuggestion(floor);
    }

    markSuggestionSent();

    setSuggestStatus(
      'Thanks! Your suggestion was sent for review.',
      'success'
    );

    submitBtn.textContent = 'Sent ✓';

    setTimeout(
      closeSuggestModal,
      1400
    );

  } catch (error) {
    setSuggestStatus(
      error.message ||
      'Could not send the suggestion.',
      'error'
    );

    submitBtn.disabled = false;
    submitBtn.textContent = 'Send suggestion';
  }
}

function setupSuggestModal() {
  const modal =
    document.getElementById('suggestModal');

  const form =
    document.getElementById('suggestForm');

  if (!modal || !form) return;

  form.addEventListener(
    'submit',
    handleSuggestSubmit
  );

  document
    .getElementById('suggestClose')
    ?.addEventListener(
      'click',
      closeSuggestModal
    );

  modal
    .querySelector('.suggest-backdrop')
    ?.addEventListener(
      'click',
      closeSuggestModal
    );

  window.addEventListener(
    'keydown',
    event => {
      if (
        event.key === 'Escape' &&
        !modal.classList.contains('hidden')
      ) {
        closeSuggestModal();
      }
    }
  );
}

function bindSuggestButtons(scope = document) {
  scope
    .querySelectorAll(
      '[data-suggest-loadout]'
    )
    .forEach(button => {
      if (button.dataset.bound === '1') return;

      button.dataset.bound = '1';

      button.addEventListener(
        'click',
        event => {
          event.stopPropagation();

          openSuggestModal(
            'loadout',
            button.dataset.suggestLoadout
          );
        }
      );
    });

  scope
    .querySelectorAll(
      '[data-suggest-strategy]'
    )
    .forEach(button => {
      if (button.dataset.bound === '1') return;

      button.dataset.bound = '1';

      button.addEventListener(
        'click',
        event => {
          event.stopPropagation();

          openSuggestModal(
            'strategy',
            button.dataset.suggestStrategy
          );
        }
      );
    });
}

setupSuggestModal();
