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

const EMPTY_VALUES = new Set(['-', '--', '---', '—', 'none', 'n/a']);

function cleanModifier(value) {
  const modifier = normalizeName(value);
  return EMPTY_VALUES.has(modifier.toLowerCase()) ? '' : modifier;
}

function fetchTowerData() {
  return fetchTowerDataJSONP();
}

function validateTowerPayload(payload) {
  if (!payload || payload.success !== true) throw new Error(payload?.error || 'The API returned an invalid response.');
  if (!Array.isArray(payload.floors)) throw new Error('The API response does not contain a floors array.');
  return payload.floors;
}

function fetchTowerDataJSONP(attempt = 1) {
  const maxAttempts = 3;
  const timeoutMs = 45000;

  return new Promise((resolve, reject) => {
    const callbackName = `towerGoyCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let finished = false;
    let timeout;

    const finish = (callback) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      callback();
    };

    const retryOrFail = (error) => {
      if (attempt < maxAttempts) {
        finish(() => {
          setTimeout(() => {
            fetchTowerDataJSONP(attempt + 1).then(resolve).catch(reject);
          }, 1500 * attempt);
        });
        return;
      }

      finish(() => reject(error));
    };

    timeout = setTimeout(() => {
      retryOrFail(new Error('The Apps Script API did not respond in time. The data may still be synchronizing.'));
    }, timeoutMs);

    window[callbackName] = (payload) => {
      try {
        const data = validateTowerPayload(payload);
        finish(() => resolve(data));
      } catch (error) {
        retryOrFail(error);
      }
    };

    script.onerror = () => {
      retryOrFail(new Error('Could not load the Apps Script Web App. The connection may have timed out.'));
    };

    const separator = SHEETS_API_URL.includes('?') ? '&' : '?';
    script.src = `${SHEETS_API_URL}${separator}callback=${encodeURIComponent(callbackName)}&_=${Date.now()}_${attempt}`;
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    document.head.appendChild(script);
  });
}
