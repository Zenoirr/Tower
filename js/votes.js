const TOWER_VOTES_API_URL = 'https://script.google.com/macros/s/AKfycby8sbUD_ZdnoX5k7LKBB_3wlOqozWZOdbMU7FbeF3eARPUNnGdJ9k558J0L_C4v65DrLw/exec';
const TOWER_VOTER_ID_KEY = 'towerOfGoyVoterId:v1';

let sharedHardVotes = {};
let sharedHardVoted = {};

function getVoterId() {
  let id = '';
  try { id = localStorage.getItem(TOWER_VOTER_ID_KEY) || ''; } catch (_) {}
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${crypto?.randomUUID?.() || ''}`;
    try { localStorage.setItem(TOWER_VOTER_ID_KEY, id); } catch (_) {}
  }
  return id;
}

function votesApiReady() {
  return TOWER_VOTES_API_URL && !TOWER_VOTES_API_URL.includes('PASTE_YOUR_VOTE_WEB_APP_URL_HERE');
}

function voteJSONP(params = {}) {
  return new Promise((resolve, reject) => {
    if (!votesApiReady()) {
      reject(new Error('Shared voting endpoint is not configured yet.'));
      return;
    }

    const callbackName = `towerVotesCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const query = new URLSearchParams({ ...params, callback: callbackName });
    let finished = false;

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

    const timeout = setTimeout(() => finish(reject, new Error('Shared voting service timed out.')), 10000);
  });
}

async function loadSharedVotes() {
  if (!votesApiReady()) return false;
  const data = await voteJSONP({ action: 'all', voter: getVoterId() });
  if (!data?.success) throw new Error(data?.error || 'Could not load shared votes.');
  sharedHardVotes = data.votes && typeof data.votes === 'object' ? data.votes : {};
  sharedHardVoted = data.voted && typeof data.voted === 'object' ? data.voted : {};
  return true;
}

function getHardVotes(floor) {
  const value = Number(sharedHardVotes[String(floor)] || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function hasVotedHard(floor) {
  return sharedHardVoted[String(floor)] === true;
}

async function voteHard(floor) {
  const floorKey = String(floor);
  if (hasVotedHard(floorKey) || !votesApiReady()) return false;

  const data = await voteJSONP({
    action: 'vote',
    floor: floorKey,
    voter: getVoterId()
  });

  if (!data?.success) throw new Error(data?.error || 'Could not register the vote.');
  sharedHardVotes = data.votes && typeof data.votes === 'object' ? data.votes : sharedHardVotes;
  sharedHardVoted[floorKey] = true;
  return true;
}
