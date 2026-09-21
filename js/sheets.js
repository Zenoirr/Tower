const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbwojad__hJO57oQBZ9VgmctDJqlphu6QgQBh8FdEPjlxnaPVlEytFWBL4BFmsnEEdAcVZg/exec';

// Os ícones continuam externos para manter o projeto leve. O CSS usa a transparência
// dos PNGs como máscara e aplica a cor correta sem precisar armazenar os arquivos.
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
  const response = await fetch(SHEETS_API_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`API retornou HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.success) throw new Error(payload.error || 'A API retornou um erro.');
  return Array.isArray(payload.floors) ? payload.floors : [];
}
