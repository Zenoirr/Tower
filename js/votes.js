const TOWER_VOTES_API_URL = 'https://script.google.com/macros/s/AKfycby8sbUD_ZdnoX5k7LKBB_3wlOqozWZOdbMU7FbeF3eARPUNnGdJ9k558J0L_C4v65DrLw/exec';
const TOWER_VOTER_ID_KEY = 'towerOfGoyVoterId:v1';

let sharedHardVotes = {};
let sharedHardVoted = {};

const VOTE_TIMEOUT_MS = 45000;      // Apps Script cold starts can be slow
const VOTE_READ_RETRY_MS = 8000;    // 'all' reads fire a 2nd parallel attempt after this
const LOCAL_VOTED_KEY = 'towerOfGoyHardVoted:v1';

// Local memory of floors this browser already voted on, so the UI never
// "forgets" a vote if a later server read fails. The server stays the source of truth.
const localVoted = new Set();
try {
  const raw = localStorage.getItem(LOCAL_VOTED_KEY);
  if (raw) JSON.parse(raw).forEach(f => localVoted.add(String(f)));
} catch (_) {}

function rememberVoted(floor) {
  localVoted.add(String(floor));
  try { localStorage.setItem(LOCAL_VOTED_KEY, JSON.stringify([...localVoted])); } catch (_) {}
}

function getVoterId() {
  let id = '';
  try { id = localStorage.getItem(TOWER_VOTER_ID_KEY) || ''; } catch (_) {}
  if (!id) {
    const uuid = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2);
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${uuid}`;
    try { localStorage.setItem(TOWER_VOTER_ID_KEY, id); } catch (_) {}
  }
  return id;
}

function votesApiReady() {
  return TOWER_VOTES_API_URL && !TOWER_VOTES_API_URL.includes('PASTE_YOUR_VOTE_WEB_APP_URL_HERE');
}

function voteJSONPOnce(params = {}, timeoutMs = VOTE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!votesApiReady()) {
      reject(new Error('Shared voting endpoint is not configured yet.'));
      return;
    }

    const callbackName = `towerVotesCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const query = new URLSearchParams({ ...params, callback: callbackName, _: Date.now().toString() });
    let finished = false;
    let timeout = null;

    const cleanup = () => {
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
    };

    const finish = (fn, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      cleanup();
      fn(value);
    };

    window[callbackName] = data => finish(resolve, data);
    script.onerror = () => finish(reject, new Error('Could not reach the shared voting service.'));
    script.src = `${TOWER_VOTES_API_URL}${TOWER_VOTES_API_URL.includes('?') ? '&' : '?'}${query.toString()}`;
    document.head.appendChild(script);

    timeout = setTimeout(() => {
      const error = new Error('Shared voting service timed out.');
      error.isTimeout = true;
      finish(reject, error);
    }, timeoutMs);
  });
}

// Reads ('all') are safe to repeat: if the first request is still waiting after
// 8s (cold start), fire a second one in parallel and take whichever answers first.
// Writes ('vote') are never duplicated.
function voteJSONP(params = {}) {
  if (params.action !== 'all') return voteJSONPOnce(params);

  return new Promise((resolve, reject) => {
    let settled = false;
    let failures = 0;
    let started = 1;
    let lastError = null;

    const onSuccess = data => { if (!settled) { settled = true; clearTimeout(retryTimer); resolve(data); } };
    const onFailure = error => {
      lastError = error;
      failures += 1;
      // Failed early (e.g. network error) -> start the 2nd attempt right away if not started yet
      if (started === 1 && !settled) { startSecond(); return; }
      if (!settled && failures >= started) { settled = true; clearTimeout(retryTimer); reject(lastError); }
    };
    const startSecond = () => {
      if (settled || started >= 2) return;
      clearTimeout(retryTimer);
      started = 2;
      voteJSONPOnce(params).then(onSuccess, onFailure);
    };

    voteJSONPOnce(params).then(onSuccess, onFailure);
    const retryTimer = setTimeout(startSecond, VOTE_READ_RETRY_MS);
  });
}

let sharedVotesInflight = null;
let sharedVotesLoadedAt = 0;

// maxAgeMs: reuse a load that finished less than this long ago (used by init after the warm-up call).
function loadSharedVotes(maxAgeMs = 0) {
  if (!votesApiReady()) return Promise.resolve(false);
  if (sharedVotesInflight) return sharedVotesInflight;
  if (maxAgeMs && sharedVotesLoadedAt && Date.now() - sharedVotesLoadedAt < maxAgeMs) return Promise.resolve(true);

  sharedVotesInflight = (async () => {
    const data = await voteJSONP({ action: 'all', voter: getVoterId() });
    if (!data?.success) throw new Error(data?.error || 'Could not load shared votes.');
    sharedHardVotes = data.votes && typeof data.votes === 'object' ? data.votes : {};
    sharedHardVoted = data.voted && typeof data.voted === 'object' ? data.voted : {};
    Object.keys(sharedHardVoted).forEach(floor => { if (sharedHardVoted[floor] === true) rememberVoted(floor); });
    sharedVotesLoadedAt = Date.now();
    return true;
  })().finally(() => { sharedVotesInflight = null; });

  return sharedVotesInflight;
}

// Wake the voting Apps Script as soon as the page opens (in parallel with the floors script).
// init() reuses this in-flight request instead of starting a new one.
function warmVotesService() {
  loadSharedVotes().catch(() => {});
}
warmVotesService();

function getHardVotes(floor) {
  const value = Number(sharedHardVotes[String(floor)] || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function hasVotedHard(floor) {
  return sharedHardVoted[String(floor)] === true || localVoted.has(String(floor));
}

async function voteHard(floor) {
  const floorKey = String(floor);
  if (hasVotedHard(floorKey) || !votesApiReady()) return false;

  let data;
  try {
    data = await voteJSONPOnce({ action: 'vote', floor: floorKey, voter: getVoterId() });
  } catch (error) {
    // The vote may have been registered even though the response never arrived.
    // Check the server before reporting a failure.
    if (error?.isTimeout) {
      try {
        await loadSharedVotes();
        if (sharedHardVoted[floorKey] === true) { rememberVoted(floorKey); return true; }
      } catch (_) {}
    }
    throw error;
  }

  if (!data?.success) throw new Error(data?.error || 'Could not register the vote.');
  sharedHardVotes = data.votes && typeof data.votes === 'object' ? data.votes : sharedHardVotes;
  sharedHardVoted[floorKey] = true;
  rememberVoted(floorKey);
  return true;
}
