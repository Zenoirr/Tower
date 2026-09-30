const TOWER_VOTES_API_URL = 'https://script.google.com/macros/s/AKfycby8sbUD_ZdnoX5k7LKBB_3wlOqozWZOdbMU7FbeF3eARPUNnGdJ9k558J0L_C4v65DrLw/exec';
const TOWER_VOTER_ID_KEY = 'towerOfGoyVoterId:v1';

let sharedHardVotes = {};
let sharedHardVoted = {};

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

// One JSONP request to the votes Apps Script. The timeout is generous because
// Apps Script cold starts can take 15-40s; a late reply is ignored safely.
function voteJSONP(params = {}, timeoutMs = 45000) {
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

    const finish = (fn, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      script.remove();
      // Keep a harmless callback around so a late response can't throw.
      window[callbackName] = () => {};
      setTimeout(() => { try { delete window[callbackName]; } catch (_) {} }, 120000);
      fn(value);
    };

    window[callbackName] = data => finish(resolve, data);
    script.onerror = () => finish(reject, new Error('Could not reach the shared voting service.'));
    script.src = `${TOWER_VOTES_API_URL}${TOWER_VOTES_API_URL.includes('?') ? '&' : '?'}${query.toString()}`;
    document.head.appendChild(script);

    timeout = setTimeout(() => finish(reject, new Error('Shared voting service timed out.')), timeoutMs);
  });
}

// Reading votes is safe to repeat, so race a second request if the first is
// slow (cold start) and take whichever answers first.
function voteReadHedged(params) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failed = 0;
    const total = 2;
    const ok = data => { if (!settled) { settled = true; resolve(data); } };
    const fail = err => { failed += 1; if (!settled && failed >= total) reject(err); };
    voteJSONP(params).then(ok, fail);
    setTimeout(() => { if (!settled) voteJSONP(params).then(ok, fail); else failed = total; }, 8000);
  });
}

function applyVotesPayload(data) {
  if (!data?.success) throw new Error(data?.error || 'Could not load shared votes.');
  sharedHardVotes = data.votes && typeof data.votes === 'object' ? data.votes : {};
  // Merge: never forget a floor we already know this device voted for.
  const serverVoted = data.voted && typeof data.voted === 'object' ? data.voted : {};
  sharedHardVoted = { ...readLocalVoted(), ...serverVoted };
}

// Locally remembered votes (this browser). The server is still the source of
// truth for counts and for "one vote per person per floor".
const LOCAL_VOTED_KEY = 'towerOfGoyVotedFloors:v1';
function readLocalVoted() {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_VOTED_KEY) || '[]');
    return Object.fromEntries((Array.isArray(list) ? list : []).map(f => [String(f), true]));
  } catch (_) { return {}; }
}
function rememberLocalVote(floorKey) {
  try {
    const list = Object.keys(readLocalVoted());
    if (!list.includes(String(floorKey))) list.push(String(floorKey));
    localStorage.setItem(LOCAL_VOTED_KEY, JSON.stringify(list));
  } catch (_) {}
}

let votesLoadPromise = null;
function loadSharedVotes(force = false) {
  if (!votesApiReady()) return Promise.resolve(false);
  if (votesLoadPromise && !force) return votesLoadPromise;
  votesLoadPromise = voteReadHedged({ action: 'all', voter: getVoterId() })
    .then(data => { applyVotesPayload(data); return true; })
    .catch(error => { votesLoadPromise = null; throw error; });
  return votesLoadPromise;
}

// Wake the votes Apps Script up as soon as the page opens, in parallel with
// the floors request, so it's ready by the time someone clicks Vote Hard.
sharedHardVoted = readLocalVoted();
if (votesApiReady()) loadSharedVotes().catch(() => {});

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

  let data = null;
  try {
    data = await voteJSONP({ action: 'vote', floor: floorKey, voter: getVoterId() }, 45000);
  } catch (error) {
    // The request may have reached the server even though the reply didn't
    // reach us (timeout). Check before telling the person it failed.
    try {
      const check = await voteJSONP({ action: 'all', voter: getVoterId() }, 30000);
      if (check?.success && check.voted?.[floorKey] === true) {
        sharedHardVotes = check.votes && typeof check.votes === 'object' ? check.votes : sharedHardVotes;
        sharedHardVoted[floorKey] = true;
        rememberLocalVote(floorKey);
        return true;
      }
    } catch (_) {}
    throw new Error('The voting service is waking up and did not answer in time. Please try again in a few seconds.');
  }

  if (!data?.success) throw new Error(data?.error || 'Could not register the vote.');
  sharedHardVotes = data.votes && typeof data.votes === 'object' ? data.votes : sharedHardVotes;
  sharedHardVoted[floorKey] = true;
  rememberLocalVote(floorKey);
  return true;
}
