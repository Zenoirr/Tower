const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbwojad__hJO57oQBZ9VgmctDJqlphu6QgQBh8FdEPjlxnaPVtEyFWBL4BFmsnEEdAcVZg/exec';

const ICONS = {
  archetypes: {
    Magical: 'https://static.wikitide.net/animeexpeditionswiki/e/e9/Magical_Icon.png',
    Physical: 'https://static.wikitide.net/animeexpeditionswiki/d/db/Physical_Icon.png',
    Psychic: 'https://static.wikitide.net/animeexpeditionswiki/d/dd/Psychic_Icon.png'
  },
  elements: {
    Hydro: 'https://static.wikitide.net/animeexpeditionswiki/8/8f/Hydro_Icon.png',
    Gale: 'https://static.wikitide.net/animeexpeditionswiki/e/ef/Gale_Icon.png',
    Wind: 'https://static.wikitide.net/animeexpeditionswiki/e/ef/Gale_Icon.png',
    Terra: 'https://static.wikitide.net/animeexpeditionswiki/4/46/Terra_Icon.png',
    Fire: 'https://static.wikitide.net/animeexpeditionswiki/a/a9/Flame_Icon.png',
    Flame: 'https://static.wikitide.net/animeexpeditionswiki/a/a9/Flame_Icon.png',
    Storm: 'https://static.wikitide.net/animeexpeditionswiki/0/03/Storm_Icon.png',
    Light: 'https://static.wikitide.net/animeexpeditionswiki/9/95/Light_Icon.png',
    Dark: 'https://static.wikitide.net/animeexpeditionswiki/e/e9/Dark_Icon.png'
  },
  modifiers: {
    Bulwark: 'https://static.wikitide.net/animeexpeditionswiki/d/dd/Bulwark_Icon.png',
    'Zone Debuff': 'https://static.wikitide.net/animeexpeditionswiki/e/e1/Zone_Debuff_Icon.png',
    Transformer: 'https://static.wikitide.net/animeexpeditionswiki/a/a4/Transformer_Icon.png',
    Greed: 'https://static.wikitide.net/animeexpeditionswiki/9/9b/Greed_%28Modifier%29_Icon.png',
    Shielded: 'https://static.wikitide.net/animeexpeditionswiki/c/cd/Shielded_Icon.png',
    Summoner: 'https://static.wikitide.net/animeexpeditionswiki/a/a3/Summoner_Icon.png',
    Burrowing: 'https://static.wikitide.net/animeexpeditionswiki/e/ee/Burrowing_Icon.png',
    Tartaros: 'https://static.wikitide.net/animeexpeditionswiki/2/26/Tartaros_Icon.png',
    Momentum: 'https://static.wikitide.net/animeexpeditionswiki/3/33/Momentum_Icon.png',
    'Status Cleanse': 'https://static.wikitide.net/animeexpeditionswiki/b/b9/Status_Cleanse_Icon.png',
    Commander: 'https://static.wikitide.net/animeexpeditionswiki/0/0e/Commander_Icon.png',
    Stunner: 'https://static.wikitide.net/animeexpeditionswiki/0/04/Stunner_Icon.png',
    Sword: 'https://static.wikitide.net/animeexpeditionswiki/3/32/Sword_Icon.png',
    Splitter: 'https://animeexpedition.com/images/modifiers/splitter.webp',
    Veil: 'https://animeexpedition.com/images/modifiers/veil.webp',
    Zombie: 'https://animeexpedition.com/images/modifiers/zombie.webp',
    'Retaliation Counter': 'https://animeexpedition.com/images/modifiers/retaliation-counter.webp',
    Reinforced: 'https://animeexpedition.com/images/modifiers/reinforced.webp'
  }
};

const ICON_COLORS = {
  Magical: '#34BAF2', Physical: '#C31919', Psychic: '#EA4ACF',
  Hydro: '#369BFC', Gale: '#8BC238', Wind: '#8BC238', Terra: '#B66337',
  Fire: '#FB8700', Flame: '#FB8700', Storm: '#4ACDCB', Light: '#FCD64B', Dark: '#771CE7',
  Bulwark: '#E8E8E8', 'Zone Debuff': '#E8E8E8', Transformer: '#AFAFAF', Greed: '#E8E8E8',
  Shielded: '#00BFEF', Summoner: '#B52BFF', Burrowing: '#A85A2A', Tartaros: '#7CFF00',
  Momentum: '#009FEF', 'Status Cleanse': '#E8E8E8', Commander: '#FFD900', Stunner: '#E8E8E8', Sword: '#00CFFF',
  Splitter: '#00CFFF', Veil: '#B52BFF', Zombie: '#AFAFAF', Reinforced: '#AFAFAF', 'Retaliation Counter': '#FFFFFF'
};

function normalizeName(value) {
  return String(value ?? '').trim();
}

function getIcon(type, name) {
  const clean = normalizeName(name);
  return ICONS[type]?.[clean] || '';
}

function getIconColor(name) {
  return ICON_COLORS[normalizeName(name)] || '#A8B2C2';
}

const EMPTY_VALUES = new Set(['-', '--', '---', '—', 'none', 'n/a']);

function cleanModifier(value) {
  const modifier = normalizeName(value);
  return EMPTY_VALUES.has(modifier.toLowerCase()) ? '' : modifier;
}

function validateTowerPayload(payload) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.error || 'The API returned an invalid response.');
  }

  if (!Array.isArray(payload.floors)) {
    throw new Error('The API response does not contain a floors array.');
  }

  return payload.floors;
}

// ---------------------------------------------------------------------
// TOWER DATA LOADING
// Google Apps Script has "cold starts": the first request after it has been
// idle can take 10-40s. The old code aborted + restarted the request every
// 18s, which threw away work already in progress and restarted the cold
// start. Now we:
//   1) keep the first request ALIVE (never abort it),
//   2) fire extra "hedged" requests at 7s and 16s in parallel,
//   3) accept whichever answers first,
//   4) also try a static snapshot (data/floors.json) served by GitHub Pages,
//      which is instant, and only use it if the API hasn't answered yet.
// ---------------------------------------------------------------------
const TOWER_HEDGE_DELAYS_MS = [0, 7000, 16000];
const TOWER_TOTAL_TIMEOUT_MS = 60000;

// One JSONP request. Resolves with floors, rejects on error. Never times out
// on its own (the caller decides), so a slow cold start can still finish.
function jsonpTowerRequest(tag) {
  return new Promise((resolve, reject) => {
    const callbackName = `towerGoyCallback_${Date.now()}_${tag}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');

    const cleanup = () => {
      // Keep a no-op callback so a late response doesn't throw a ReferenceError.
      window[callbackName] = () => {};
      script.remove();
      setTimeout(() => { try { delete window[callbackName]; } catch (_) {} }, 120000);
    };

    window[callbackName] = (payload) => {
      try {
        const data = validateTowerPayload(payload);
        cleanup();
        resolve(data);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Could not load the Apps Script Web App. Check the /exec URL and deployment permissions.'));
    };

    const separator = SHEETS_API_URL.includes('?') ? '&' : '?';
    script.src = `${SHEETS_API_URL}${separator}callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    document.head.appendChild(script);
  });
}

// Races several staggered requests; first success wins. Rejects only when
// every request failed or the overall timeout is reached.
function fetchTowerDataFromApi() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failures = 0;
    let launched = 0;
    let lastError = null;
    const timers = [];

    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      fn(value);
    };

    const launch = (index) => {
      if (settled) return;
      launched += 1;
      jsonpTowerRequest(index).then(
        (data) => done(resolve, data),
        (error) => {
          lastError = error;
          failures += 1;
          // A hard failure (network/script error) on every launched request
          // and nothing left to launch -> give up.
          if (failures >= TOWER_HEDGE_DELAYS_MS.length) done(reject, lastError);
          // A failed request shouldn't make us wait for the next hedge timer.
          else if (failures === launched) launch(launched);
        }
      );
    };

    TOWER_HEDGE_DELAYS_MS.forEach((delay, index) => {
      if (delay === 0) launch(index);
      else timers.push(setTimeout(() => launch(index), delay));
    });

    timers.push(setTimeout(
      () => done(reject, lastError || new Error('The Apps Script API did not return data within the allowed time.')),
      TOWER_TOTAL_TIMEOUT_MS
    ));
  });
}

// Static snapshot shipped with the site (data/floors.json). Optional: if the
// file is missing or invalid this resolves to null.
async function fetchTowerSnapshot() {
  try {
    const response = await fetch('data/floors.json', { cache: 'no-cache' });
    if (!response.ok) return null;
    const payload = await response.json();
    const floors = Array.isArray(payload) ? payload : payload?.floors;
    return Array.isArray(floors) && floors.length ? floors : null;
  } catch (_) {
    return null;
  }
}

// Start the API request as early as possible (as soon as this script runs)
// and share the same promise with init().
let towerApiPromise = null;
function fetchTowerData() {
  if (!towerApiPromise) {
    towerApiPromise = fetchTowerDataFromApi();
    // Allow a later retry (e.g. "Try again" button) to start fresh.
    towerApiPromise.catch(() => { towerApiPromise = null; });
  }
  return towerApiPromise;
}

// Kick off the request right away, before main.js even runs.
fetchTowerData().catch(() => {});
