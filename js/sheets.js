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
    Sword: 'https://static.wikitide.net/animeexpeditionswiki/3/32/Sword_Icon.png'
  }
};

const ICON_COLORS = {
  Magical: '#34BAF2', Physical: '#C31919', Psychic: '#EA4ACF',
  Hydro: '#369BFC', Gale: '#8BC238', Wind: '#8BC238', Terra: '#B66337',
  Fire: '#FB8700', Flame: '#FB8700', Storm: '#4ACDCB', Light: '#FCD64B', Dark: '#771CE7',
  Bulwark: '#E8E8E8', 'Zone Debuff': '#E8E8E8', Transformer: '#AFAFAF', Greed: '#E8E8E8',
  Shielded: '#00BFEF', Summoner: '#B52BFF', Burrowing: '#A85A2A', Tartaros: '#7CFF00',
  Momentum: '#009FEF', 'Status Cleanse': '#E8E8E8', Commander: '#FFD900', Stunner: '#E8E8E8', Sword: '#00CFFF'
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

function cleanModifier(value) {
  const modifier = normalizeName(value);
  return modifier === '-' || modifier.toLowerCase() === 'none' ? '' : modifier;
}

async function fetchTowerData() {
  try {
    const response = await fetch(SHEETS_API_URL, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
    const payload = await response.json();
    return validateTowerPayload(payload);
  } catch (error) {
    console.warn('Direct API request failed. Trying JSONP fallback.', error);
    return fetchTowerDataJSONP();
  }
}

function validateTowerPayload(payload) {
  if (!payload || payload.success !== true) throw new Error(payload?.error || 'The API returned an invalid response.');
  if (!Array.isArray(payload.floors)) throw new Error('The API response does not contain a floors array.');
  return payload.floors;
}

function fetchTowerDataJSONP() {
  return new Promise((resolve, reject) => {
    const callbackName = `towerGoyCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('The database request was blocked. Enable JSONP in the Apps Script deployment.'));
    }, 12000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

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
      reject(new Error('The database could not be reached. Check the Apps Script web app permissions.'));
    };

    script.src = `${SHEETS_API_URL}?callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
    script.async = true;
    document.head.appendChild(script);
  });
}
