let floors = [];
let activeFilter = 'all';
let activeStage = 'all';
let sortAscending = true;
let strategies = {};
const HARD_VOTE_THRESHOLD = 5;
const FLOORS_CACHE_KEY = 'towerOfGoyFloorsCache:v1';
const CLEARED_FLOORS_KEY = 'towerOfGoyClearedFloors:v1';

let clearedFloors = new Set();
try {
  const rawCleared = localStorage.getItem(CLEARED_FLOORS_KEY);
  if (rawCleared) JSON.parse(rawCleared).forEach(f => clearedFloors.add(String(f)));
} catch (_) {}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const displayValue = (value, fallback = '---') => {
  const text = String(value ?? '').trim();
  return text && text !== '-' && text !== '—' ? text : fallback;
};

const escapeHTML = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const statusEl = $('#apiStatus');
const listEl = $('#towerList');
const emptyEl = $('#emptyState');
const searchEl = $('#searchInput');
const countEl = $('#floorCount');
const stageFilterEl = $('#stageFilter');
const resultCountEl = $('#resultCount');
const clearSearchEl = $('#clearSearch');

function animateCount(el, value) {
  if (!el) return;
  const end = Number(value);
  if (!Number.isFinite(end)) { el.textContent = value; return; }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { el.textContent = end; return; }

  const start = 0;
  const duration = 700;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (end - start) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function renderSkeletons(count = 8, message = 'Loading tower data...') {
  if (!listEl) return;
  clearTimeout(renderSkeletons._msgTimer);
  const cards = Array.from({ length: count }, (_, i) =>
    `<div class="skeleton-card" style="--i:${i}"></div>`
  ).join('');
  listEl.innerHTML = `<div class="skeleton-list"><p class="skeleton-message" id="skeletonMessage">${escapeHTML(message)}</p>${cards}</div>`;
  renderSkeletons._msgTimer = setTimeout(() => {
    const msgEl = $('#skeletonMessage');
    if (msgEl) msgEl.textContent = 'Still loading — the community database can be slow to wake up. Hang tight...';
  }, 6000);
}

function loadCachedFloors() {
  try {
    const raw = localStorage.getItem(FLOORS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.floors) || !parsed.floors.length) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function saveCachedFloors(floorsList) {
  try {
    localStorage.setItem(FLOORS_CACHE_KEY, JSON.stringify({ floors: floorsList, savedAt: Date.now() }));
  } catch (_) {}
}

function setStatus(type, text) {
  if (!statusEl) return;
  statusEl.className = `status ${type}`;
  statusEl.querySelector('span').textContent = text;
  const homeApiStatusEl = $('#homeApiStatus');
  if (homeApiStatusEl) homeApiStatusEl.textContent = type === 'online' ? 'Data available and synchronized' : text;
  const homeLastSyncEl = $('#homeLastSync');
  if (homeLastSyncEl) {
    homeLastSyncEl.textContent = type === 'online'
      ? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '—';
  }
}

const LOCAL_ICON_FILES = {
  elements: { Hydro: 'hydro.png', Gale: 'gale.png', Wind: 'gale.png', Terra: 'terra.png', Fire: 'fire.png', Flame: 'fire.png', Storm: 'storm.png', Light: 'light.png', Dark: 'dark.png' },
  archetypes: { Magical: 'magical.png', Physical: 'physical.png', Psychic: 'psychic.png' },
  modifiers: { Bulwark: 'bulwark.png', 'Zone Debuff': 'zone_debuff.png', Transformer: 'transformer.png', Greed: 'greed.png', Shielded: 'shielded.png', Summoner: 'summoner.png', Burrowing: 'burrowing.png', Tartaros: 'tartaros.png', Momentum: 'momentum.png', 'Status Cleanse': 'status_cleanse.png', Commander: 'commander.png', Stunner: 'stunner.png', Sword: 'sword.png' }
};

const REMOTE_MODIFIER_ICONS = {
  Splitter: 'https://animeexpedition.com/images/modifiers/splitter.webp',
  Veil: 'https://animeexpedition.com/images/modifiers/veil.webp',
  Zombie: 'https://animeexpedition.com/images/modifiers/zombie.webp',
  'Retaliation Counter': 'https://animeexpedition.com/images/modifiers/retaliation-counter.webp'
};

function iconHTML(type, name, className = '') {
  const clean = String(name ?? '').trim();
  const file = LOCAL_ICON_FILES[type]?.[clean];
  const remote = type === 'modifiers' ? REMOTE_MODIFIER_ICONS[clean] : '';
  if (!file && !remote) return '';

  const color = getIconColor(clean);
  const src = remote || `assets/${escapeHTML(type)}/${escapeHTML(file)}`;
  return `<img class="icon-image ${escapeHTML(className)}" src="${escapeHTML(src)}" alt="" aria-hidden="true" data-icon-name="${escapeHTML(clean)}" loading="lazy" decoding="async" style="--icon-color:${escapeHTML(color)}">`;
}

const MODIFIER_COLORS = {
  Summoner: '#B52BFF',
  Sword: '#00CFFF',
  Greed: '#E8E8E8',
  Tartaros: '#7CFF00',
  Transformer: '#AFAFAF',
  Veil: '#C6B7FF',
  Splitter: '#FF7B7B',
  Zombie: '#78D27B',
  'Retaliation Counter': '#FFB14A'
};

function colorExtraValue(text, modifier = '') {
  const clean = displayValue(text);
  if (clean === '---') return clean;

  const modifierName = cleanModifier(modifier);
  const color = MODIFIER_COLORS[modifierName];
  if (!color) return escapeHTML(clean);

  if (modifierName === 'Summoner') {
    return escapeHTML(clean).replace(/(\([^)]*\))/g, `<span class="modifier-extra" style="--modifier-extra-color:${color}">$1</span>`);
  }

  if (modifierName === 'Sword') {
    return escapeHTML(clean).replace(/(\d+(?:\.\d+)?x?\s*(?:revives?|revs?))/gi, `<span class="modifier-extra" style="--modifier-extra-color:${color}">$1</span>`);
  }

  if (modifierName === 'Greed') {
    return escapeHTML(clean).replace(/(\+?\d+(?:\.\d+)?%)/g, `<span class="modifier-extra" style="--modifier-extra-color:${color}">$1</span>`);
  }

  if (modifierName === 'Tartaros') {
    return escapeHTML(clean).replace(/(\+?\d+(?:\.\d+)?[KMB]?\/\s*10s)/gi, `<span class="modifier-extra" style="--modifier-extra-color:${color}">$1</span>`);
  }

  return escapeHTML(clean);
}

function parseCompactHP(value) {
  const text = String(value ?? '').trim().replace(/,/g, '.').replace(/\s+/g, '');
  if (!text) return null;
  const match = text.match(/^(-?\d+(?:\.\d+)?)([KMBT])?/i);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const multipliers = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return number * (multipliers[String(match[2] || '').toUpperCase()] || 1);
}

function formatCompactHP(value) {
  if (!Number.isFinite(value)) return '---';
  const abs = Math.abs(value);
  const units = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K']
  ];
  const unit = units.find(([size]) => abs >= size);
  if (!unit) return String(Math.round(value));
  const number = value / unit[0];
  const digits = Math.abs(number) >= 100 ? 0 : Math.abs(number) >= 10 ? 1 : 2;
  return `${number.toFixed(digits).replace(/\.0+$|(?<=\.\d)0+$/g, '')}${unit[1]}`;
}

function hpNumbersEqual(a, b) {
  const left = parseCompactHP(a);
  const right = parseCompactHP(b);
  return left !== null && right !== null && Math.abs(left - right) < Math.max(1, Math.abs(right) * 0.000001);
}

function getBossHPDisplay(floor) {
  const baseRaw = displayValue(floor.bossHP?.base);
  const actualRaw = String(floor.bossHP?.actual ?? '').trim();
  const modifier = cleanModifier(floor.modifier);
  const baseNumber = parseCompactHP(baseRaw);

  // A non-empty Actual HP that differs from Base HP is a manual Sheet override.
  // Keeping equal Base/Actual values automatic lets the existing sheet work without re-entering every row.
  if (actualRaw && actualRaw !== '---' && !hpNumbersEqual(actualRaw, baseRaw)) {
    return { base: baseRaw, actual: actualRaw, automatic: false };
  }

  if (baseNumber === null || !modifier) {
    return { base: baseRaw, actual: actualRaw || baseRaw, automatic: false };
  }

  const effect = (actual, note) => ({ base: baseRaw, actual: `${actual} ${note}`, automatic: true });

  switch (modifier) {
    case 'Tartaros':
    case 'Greed': {
      const extra = formatCompactHP(baseNumber * 0.10);
      return effect(baseRaw, `(+${extra}/10s)`);
    }
    case 'Veil':
      return effect(formatCompactHP(baseNumber * 3), '(+200%)');
    case 'Transformer':
      return effect(formatCompactHP(baseNumber * 1.5), '(+50%)');
    case 'Splitter':
      return effect(`3 × ${formatCompactHP(baseNumber * 0.33)}`, '(33% each)');
    default:
      return { base: baseRaw, actual: baseRaw, automatic: true };
  }
}

function hpHTML(value, modifier = '') {
  const clean = displayValue(value);
  if (clean === '---') return '<span class="muted-value">---</span>';

  const escaped = escapeHTML(clean);
  const modifierName = cleanModifier(modifier);
  if (modifierName === 'Summoner') {
    return escaped.replace(/(\([^)]*\))/g, `<span class="modifier-extra" style="--modifier-extra-color:${MODIFIER_COLORS.Summoner}">$1</span>`);
  }
  if (modifierName === 'Greed') {
    return escaped.replace(/(\+?\d+(?:\.\d+)?%)/g, `<span class="modifier-extra" style="--modifier-extra-color:${MODIFIER_COLORS.Greed}">$1</span>`);
  }
  if (modifierName === 'Tartaros') {
    return escaped.replace(/(\+?\d+(?:\.\d+)?[KMB]?\/\s*10s)/gi, `<span class="modifier-extra" style="--modifier-extra-color:${MODIFIER_COLORS.Tartaros}">$1</span>`);
  }
  if (modifierName === 'Sword') {
    return escaped.replace(/(\d+(?:\.\d+)?x?\s*(?:revives?|revs?))/gi, `<span class="modifier-extra" style="--modifier-extra-color:${MODIFIER_COLORS.Sword}">$1</span>`);
  }
  return escaped;
}

function modifierHTML(modifier) {
  const value = cleanModifier(modifier);
  if (!value) return '<span class="muted-value">---</span>';
  const icon = getIcon('modifiers', value);
  const color = getIconColor(value);
  const label = colorExtraValue(value, value);
  return `<span class="modifier-pill" style="--modifier-color:${escapeHTML(color)}">${icon ? iconHTML('modifiers', value, 'modifier-icon') : '<span class="modifier-fallback">M</span>'}<span>${label}</span></span>`;
}

function resistanceHTML(type, value) {
  const clean = displayValue(value);
  if (clean === '---') return '<span class="muted-value">---</span>';
  const color = getIconColor(type);
  return `<span class="resistance-item" style="--data-color:${escapeHTML(color)}">${iconHTML('archetypes', type)}<span style="color:${escapeHTML(color)}">${escapeHTML(clean)}</span></span>`;
}

const ELEMENT_NAMES = new Set(['Hydro', 'Gale', 'Terra', 'Fire', 'Flame', 'Storm', 'Light', 'Dark']);

function displayElementName(name) {
  const clean = String(name ?? '').trim();
  return clean === 'Flame' ? 'Fire' : clean;
}

function normalizeAffinityList(list) {
  if (!Array.isArray(list)) return [];

  const normalized = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const element = String(item.element ?? '').trim();
    const value = String(item.value ?? '').trim();

    // Defensive handling for an older API response where element/value
    // could be shifted by one column. The corrected Apps Script should
    // already return the proper pair, but this keeps the UI safe.
    if (ELEMENT_NAMES.has(value) && i + 1 < list.length) {
      const nextValue = String(list[i + 1]?.value ?? '').trim();
      if (/^-?\d+(?:[.,]\d+)?x$/i.test(nextValue)) {
        normalized.push({ element: value, value: nextValue });
        i++;
        continue;
      }
    }

    if (ELEMENT_NAMES.has(element) && value && !ELEMENT_NAMES.has(value)) {
      normalized.push({ element, value });
    }
  }

  return normalized;
}

function affinityHTML(item) {
  const rawElement = displayValue(item.element);
  const element = displayElementName(rawElement);
  const value = displayValue(item.value);
  const color = getIconColor(rawElement);
  return `<span class="affinity-item" style="--data-color:${escapeHTML(color)}">${iconHTML('elements', rawElement)}<span style="color:${escapeHTML(color)}">${escapeHTML(element)}</span><b style="color:${escapeHTML(color)}">${escapeHTML(value)}</b></span>`;
}

function strategyHTML(floor) {
  const item = strategies[String(floor.floor)] || {};
  const text = String(item.text || '').trim();
  const video = String(item.video || '').trim();
  if (!text && !video) return '';

  const videoHTML = video
    ? `<a class="strategy-video" href="${escapeHTML(video)}" target="_blank" rel="noopener noreferrer">▶ Watch strategy video <span>↗</span></a>`
    : '';

  return `<section class="strategy-section">
    <div class="strategy-heading"><div><span class="section-label">STRATEGY</span><strong>Community strategy</strong></div></div>
    ${text ? `<p class="strategy-text">${escapeHTML(text)}</p>` : ''}
    ${videoHTML}
  </section>`;
}

function suggestStrategyButtonHTML(floor) {
  const item = strategies[String(floor.floor)] || {};
  const hasStrategy = Boolean(String(item.text || '').trim() || String(item.video || '').trim());
  if (hasStrategy) return '';
  return `<button type="button" class="suggest-button" data-suggest-strategy="${escapeHTML(floor.floor)}">+ Suggest strategy or video</button>`;
}

function copyFloorLinkHTML(floor) {
  return `<button type="button" class="small-button copy-floor-inline" data-copy-floor="${escapeHTML(floor)}">🔗 Copy Link</button>`;
}

function hardVoteHTML(floor) {
  const floorNumber = Number(floor.floor);
  const votes = getHardVotes(floorNumber);
  const voted = hasVotedHard(floorNumber);
  return `<button type="button" class="hard-vote-button hard-vote-compact ${voted ? 'voted' : ''}" data-hard-vote="${escapeHTML(floorNumber)}" ${voted ? 'disabled' : ''} aria-label="${voted ? 'You voted this floor as hard' : 'Vote this floor as hard'}">
    <span>🔥</span><b>${voted ? 'Voted' : 'Vote Hard'}</b><em>${votes}</em>
  </button>`;
}

// ---------------------------------------------------------------------
// FLOOR CLEARED TRACKER
function isFloorCleared(floor) {
  return clearedFloors.has(String(floor));
}

function saveClearedFloors() {
  try { localStorage.setItem(CLEARED_FLOORS_KEY, JSON.stringify([...clearedFloors])); } catch (_) {}
}

function toggleFloorCleared(floor) {
  const key = String(floor);
  if (clearedFloors.has(key)) clearedFloors.delete(key); else clearedFloors.add(key);
  saveClearedFloors();
  updateClearedProgress();
}

function clearedToggleHTML(floor) {
  const cleared = isFloorCleared(floor);
  return `<button type="button" class="hard-vote-button hard-vote-compact cleared-toggle-button ${cleared ? 'cleared' : ''}" data-cleared-toggle="${escapeHTML(floor)}" aria-pressed="${cleared}">
    <span>${cleared ? '✓' : '○'}</span><b>${cleared ? 'Cleared' : 'Mark Cleared'}</b>
  </button>`;
}

function updateClearedProgress() {
  const fillEl = $('#clearedProgressFill');
  const textEl = $('#clearedProgressText');
  if (!textEl) return;
  const total = floors.length;
  const done = floors.filter(f => isFloorCleared(f.floor)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  if (fillEl) fillEl.style.width = `${pct}%`;
  textEl.textContent = total ? `${done} / ${total} floors cleared (${pct}%)` : '0 / 0 floors cleared';
}

function bindClearedButtons(scope = document) {
  scope.querySelectorAll('[data-cleared-toggle]').forEach(button => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.stopPropagation();
      const floor = button.dataset.clearedToggle;
      toggleFloorCleared(floor);
      const cleared = isFloorCleared(floor);
      button.classList.toggle('cleared', cleared);
      button.setAttribute('aria-pressed', String(cleared));
      const iconSpan = button.querySelector('span');
      const labelB = button.querySelector('b');
      if (iconSpan) iconSpan.textContent = cleared ? '✓' : '○';
      if (labelB) labelB.textContent = cleared ? 'Cleared' : 'Mark Cleared';

      const card = button.closest('.floor-card');
      if (card) {
        card.classList.toggle('is-cleared', cleared);
        const numberEl = card.querySelector('.floor-number');
        const badge = numberEl?.querySelector('.cleared-check-badge');
        if (cleared && numberEl && !badge) {
          numberEl.insertAdjacentHTML('beforeend', '<small class="cleared-check-badge">✓ CLEARED</small>');
        } else if (!cleared && badge) {
          badge.remove();
        }
      }
    });
  });
}

// ---------------------------------------------------------------------
// COUNTER CALCULATOR
// Shows only the combinations that can exist on this floor.
// Damage multiplier = archetype resistance × elemental affinity.
const COUNTER_ARCHETYPES = ['Magical', 'Physical'];

function parseMultiplier(value) {
  const clean = String(value ?? '').trim().replace(',', '.');
  const match = clean.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  return Number.isFinite(num) ? num : null;
}

function counterCalculatorHTML(floor) {
  const affinities = normalizeAffinityList(floor.affinities);
  const resistanceEntries = COUNTER_ARCHETYPES
    .map(name => ({
      name,
      value: parseMultiplier(name === 'Magical' ? floor.resistances?.magical : floor.resistances?.physical)
    }))
    .filter(item => item.value !== null);

  const combinations = [];
  for (const archetype of resistanceEntries) {
    for (const affinity of affinities) {
      const affinityValue = parseMultiplier(affinity.value);
      if (affinityValue === null) continue;
      combinations.push({
        archetype: archetype.name,
        archetypeValue: archetype.value,
        element: displayElementName(affinity.element),
        elementValue: affinityValue,
        rawElement: affinity.element
      });
    }
  }

  const items = combinations.map(item => {
    const total = item.archetypeValue * item.elementValue;
    const totalText = `${total.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x`;
    return `<button type="button" class="counter-combo" aria-label="${escapeHTML(item.archetype)} plus ${escapeHTML(item.element)} equals ${escapeHTML(totalText)}">
      <span class="counter-combo-icon">${iconHTML('archetypes', item.archetype)}</span>
      <span class="counter-combo-plus">+</span>
      <span class="counter-combo-icon">${iconHTML('elements', item.rawElement)}</span>
      <b>${escapeHTML(totalText)}</b>
    </button>`;
  }).join('');

  if (!items) return '';

  return `<div class="counter-calculator" data-counter-floor="${escapeHTML(floor.floor)}">
    <button type="button" class="small-button calculator-button" data-calculator-toggle aria-expanded="false">
      Calculator
    </button>
    <div class="counter-calculator-popup hidden" role="dialog" aria-label="Damage calculator">
      <div class="counter-calculator-grid">${items}</div>
    </div>
  </div>`;
}

function bindCounterCalculators(scope = document) {
  scope.querySelectorAll('.counter-calculator').forEach(wrapper => {
    if (wrapper.dataset.bound === '1') return;
    wrapper.dataset.bound = '1';
    const toggle = wrapper.querySelector('[data-calculator-toggle]');
    const popup = wrapper.querySelector('.counter-calculator-popup');
    if (!toggle || !popup) return;

    toggle.addEventListener('click', event => {
      event.stopPropagation();
      const willOpen = popup.classList.contains('hidden');
      scope.querySelectorAll('.counter-calculator-popup').forEach(item => item.classList.add('hidden'));
      scope.querySelectorAll('[data-calculator-toggle]').forEach(item => item.setAttribute('aria-expanded', 'false'));
      popup.classList.toggle('hidden', !willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
    });

    popup.addEventListener('click', event => event.stopPropagation());
  });
}

function communityActionsHTML(floor) {
  return `<div class="loadout-actions-row">
    <div class="loadout-action-left">
      ${hardVoteHTML(floor)}
      ${clearedToggleHTML(floor.floor)}
    </div>
    <div class="loadout-action-right">
      ${counterCalculatorHTML(floor)}
      ${copyFloorLinkHTML(floor.floor)}
    </div>
  </div>`;
}

function loadoutHTML(floor) {
  const floorNumber = Number(floor.floor);
  const trait = getLoadout(floorNumber, 'trait');
  const traitless = getLoadout(floorNumber, 'traitless');
  const traitExists = loadoutStatus.get(loadoutKey(floorNumber, 'trait')) === true;
  const traitlessExists = loadoutStatus.get(loadoutKey(floorNumber, 'traitless')) === true;

  if (!traitExists && !traitlessExists) {
    return `<div class="loadout-empty"><div class="loadout-empty-icon">—</div><div><strong>No Loadout Detected.</strong><span>There is no loadout image available for this floor.</span></div><button type="button" class="suggest-button" data-suggest-loadout="${escapeHTML(floorNumber)}">+ Suggest Loadout</button></div>`;
  }

  const activeType = traitExists ? 'trait' : 'traitless';
  const activeLoadout = activeType === 'traitless' ? traitless : trait;
  const tabs = `
    <div class="loadout-tabs" role="tablist" aria-label="Loadout type">
      <button type="button" class="loadout-tab ${activeType === 'trait' ? 'active' : ''} ${traitExists ? '' : 'disabled'}" data-loadout-type="trait" ${traitExists ? '' : 'disabled'}>Trait</button>
      <button type="button" class="loadout-tab ${activeType === 'traitless' ? 'active' : ''} ${traitlessExists ? '' : 'disabled'}" data-loadout-type="traitless" ${traitlessExists ? '' : 'disabled'}>Traitless</button>
    </div>`;

  return `<div class="loadout-card" data-floor-loadout="${escapeHTML(floorNumber)}" data-active-loadout="${activeType}">
    <div class="loadout-image-wrap"><img src="${escapeHTML(activeLoadout.image)}" alt="${escapeHTML(activeLoadout.title)} for Floor ${floorNumber}" loading="lazy" decoding="async"></div>
    <div class="loadout-copy">
      ${tabs}
      <span class="section-label">LOADOUT</span>
      <strong class="loadout-title">${escapeHTML(activeLoadout.title)}</strong>
      <div class="loadout-community">
        ${strategyHTML(floor) || suggestStrategyButtonHTML(floor)}
        ${communityActionsHTML(floor)}
      </div>
    </div>
  </div>`;
}

function floorSummary(floor) {
  const modifier = cleanModifier(floor.modifier);
  const bossHP = getBossHPDisplay(floor);
  const affinities = normalizeAffinityList(floor.affinities);
  const hardVotes = getHardVotes(floor.floor);
  const isHard = hardVotes >= HARD_VOTE_THRESHOLD;
  const cleared = isFloorCleared(floor.floor);
  const summaryAffinities = affinities.length
    ? affinities.map(item => `<span class="summary-affinity" style="--data-color:${escapeHTML(getIconColor(item.element))}">${iconHTML('elements', item.element)}<span style="color:${escapeHTML(getIconColor(item.element))}">${escapeHTML(displayElementName(item.element))}</span><b style="color:${escapeHTML(getIconColor(item.element))}">${escapeHTML(item.value)}</b></span>`).join('')
    : '<span class="muted-value">---</span>';

  return `<button class="floor-summary" type="button" aria-expanded="false">
      <span class="floor-number ${isHard ? 'is-hard' : ''}"><b>${String(floor.floor).padStart(2, '0')}</b>${isHard ? '<small class="hard-badge">HARD</small>' : ''}${cleared ? '<small class="cleared-check-badge">✓ CLEARED</small>' : ''}</span>
      <span class="stage-boss"><strong>${escapeHTML(displayValue(floor.stage))}</strong><small>${escapeHTML(displayValue(floor.boss))}</small></span>
      <span class="summary-modifier">${modifierHTML(modifier)}</span>
      <span class="summary-hp summary-boss-hp"><b class="boss-hp-value">${hpHTML(bossHP.actual, modifier)}</b><small>Boss HP</small></span>
      <span class="summary-hp summary-enemy-hp"><b class="enemy-hp-value">${escapeHTML(displayValue(floor.enemyHP))}</b><small>Enemy HP</small></span>
      <span class="summary-combat">
        <span class="summary-combat-line summary-resists">${resistanceHTML('Magical', floor.resistances?.magical)}${resistanceHTML('Physical', floor.resistances?.physical)}</span>
        <span class="summary-combat-line summary-affinities">${summaryAffinities}</span>
      </span>
      <span class="expand-icon" aria-hidden="true">+</span>
    </button>`;
}

function floorDetails(floor) {
  const modifier = cleanModifier(floor.modifier);
  const bossHP = getBossHPDisplay(floor);
  const affinities = normalizeAffinityList(floor.affinities);
  return `<div class="floor-details"><div class="details-inner"><div class="details-grid">
      <section class="info-panel"><div class="panel-title"><span>01</span><strong>Boss</strong></div><div class="boss-name">${escapeHTML(displayValue(floor.boss))}</div><div class="modifier-line"><span class="label">Modifier</span>${modifierHTML(modifier)}</div></section>
      <section class="info-panel"><div class="panel-title"><span>02</span><strong>HP</strong></div><div class="hp-row hp-row-boss"><span>Base HP</span><b class="boss-hp-value">${hpHTML(bossHP.base, modifier)}</b></div><div class="hp-row hp-row-boss"><span>Actual HP</span><b class="boss-hp-value">${hpHTML(bossHP.actual, modifier)}</b></div><div class="hp-row hp-row-enemy"><span>Enemy Wave 1</span><b class="enemy-hp-value">${escapeHTML(displayValue(floor.enemyHP))}</b></div></section>
      <section class="info-panel"><div class="panel-title"><span>03</span><strong>Resistances</strong></div><div class="resistance-list">${resistanceHTML('Magical', floor.resistances?.magical)}${resistanceHTML('Physical', floor.resistances?.physical)}</div></section>
      <section class="info-panel affinity-panel"><div class="panel-title"><span>04</span><strong>Affinities</strong></div><div class="affinity-list">${affinities.length ? affinities.map(affinityHTML).join('') : '<span class="muted-value">No affinities listed.</span>'}</div></section>
    </div>
    <div class="loadout-section">${loadoutHTML(floor)}${!hasAnyLoadout(floor.floor) ? `<div class="loadout-community-fallback">
        ${strategyHTML(floor) || suggestStrategyButtonHTML(floor)}
        ${communityActionsHTML(floor)}
      </div>` : ''}</div></div></div>`;
}

function refreshVisibleLoadouts() {
  $$('.floor-card').forEach(card => {
    const floor = floors.find(item => String(item.floor) === card.dataset.floor);
    const section = card.querySelector('.loadout-section');
    if (floor && section) { section.outerHTML = `<div class="loadout-section">${loadoutHTML(floor)}</div>`; bindLoadoutTabs(card); bindSuggestButtons(card); bindHardVoteButtons(card); bindClearedButtons(card); bindCounterCalculators(card); }
  });
}

function bindLoadoutTabs(scope = document) {
  scope.querySelectorAll('[data-loadout-type]').forEach(button => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      const card = button.closest('.loadout-card');
      const floorNumber = Number(card?.dataset.floorLoadout);
      const type = button.dataset.loadoutType;
      const loadout = getLoadout(floorNumber, type);
      if (!card || !loadout || loadoutStatus.get(loadoutKey(floorNumber, type)) !== true) return;

      card.dataset.activeLoadout = type;
      const image = card.querySelector('.loadout-image-wrap img');
      const title = card.querySelector('.loadout-title');
      if (image) {
        image.src = `${loadout.image}?v=${Date.now()}`;
        image.alt = `${loadout.title} for Floor ${floorNumber}`;
      }
      if (title) title.textContent = loadout.title;
      card.querySelectorAll('.loadout-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.loadoutType === type));
    });
  });
}

function floorCard(floor) {
  const modifier = cleanModifier(floor.modifier);
  const cleared = isFloorCleared(floor.floor);
  return `<article class="floor-card ${modifier ? 'has-modifier' : ''} ${cleared ? 'is-cleared' : ''}" data-floor="${escapeHTML(floor.floor)}">${floorSummary(floor)}<div class="floor-details-host"></div></article>`;
}

function matchesSearch(floor, query) {
  if (!query) return true;
  const text = [
    floor.floor,
    floor.stage,
    floor.boss,
    floor.modifier,
    floor.enemyHP,
    floor.bossHP?.base,
    floor.bossHP?.actual,
    floor.resistances?.magical,
    floor.resistances?.physical,
    ...(floor.affinities || []).flatMap(item => [item.element, item.value])
  ].join(' ').toLowerCase();
  return text.includes(query);
}

function matchesFilter(floor) {
  if (activeFilter === 'modifier') return Boolean(cleanModifier(floor.modifier));
  if (activeFilter === 'loadout') return hasAnyLoadout(floor.floor);
  if (activeFilter === 'hard') return getHardVotes(floor.floor) >= HARD_VOTE_THRESHOLD;
  if (activeFilter === 'not-cleared') return !isFloorCleared(floor.floor);
  return true;
}

function render() {
  const query = searchEl?.value.trim().toLowerCase() || '';
  const filtered = floors.filter(floor =>
    matchesFilter(floor) &&
    (activeStage === 'all' || String(floor.stage) === activeStage) &&
    matchesSearch(floor, query)
  );
  const ordered = [...filtered].sort((a, b) =>
    sortAscending ? Number(a.floor) - Number(b.floor) : Number(b.floor) - Number(a.floor)
  );

  listEl.innerHTML = ordered.map(floorCard).join('');
  bindLoadoutTabs(listEl);
  bindHardVoteButtons(listEl);
  bindClearedButtons(listEl);
  bindShareButtons(listEl);
  bindSuggestButtons(listEl);
  updateClearedProgress();
  emptyEl.classList.toggle('hidden', ordered.length !== 0);
  const emptyStrong = emptyEl.querySelector('strong');
  const emptySpan = emptyEl.querySelector('span');
  if (emptyStrong && emptySpan) {
    if (activeFilter === 'hard') {
      emptyStrong.textContent = 'No Hard Floors yet';
      emptySpan.textContent = "There aren't any floors with 5+ hard votes yet.";
    } else if (activeFilter === 'not-cleared') {
      emptyStrong.textContent = 'No uncleared floors found';
      emptySpan.textContent = 'Every floor is currently marked as cleared.';
    } else {
      emptyStrong.textContent = 'No floors found';
      emptySpan.textContent = 'Try another search or change the filters.';
    }
  }
  resultCountEl.textContent = activeFilter === 'hard'
    ? `${ordered.length} hard floors`
    : activeFilter === 'not-cleared'
      ? `${ordered.length} not cleared floors`
      : `${ordered.length} of ${floors.length} floors`;
  clearSearchEl.classList.toggle('hidden', !query);

  $$('.floor-summary').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.floor-card');
    const open = !card.classList.contains('open');
    if (open) {
      $$('.floor-card.open').forEach(otherCard => {
        if (otherCard === card) return;
        otherCard.classList.remove('open');
        otherCard.querySelector('.floor-summary')?.setAttribute('aria-expanded', 'false');
        otherCard.querySelectorAll('.counter-calculator-popup').forEach(popup => popup.classList.add('hidden'));
        otherCard.querySelectorAll('[data-calculator-toggle]').forEach(toggle => toggle.setAttribute('aria-expanded', 'false'));
      });
    }
    card.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    const host = card.querySelector('.floor-details-host');
    if (open && host && !host.dataset.rendered) {
      const floor = floors.find(item => String(item.floor) === card.dataset.floor);
      if (floor) {
        host.innerHTML = floorDetails(floor);
        host.dataset.rendered = 'true';
        bindLoadoutTabs(host);
        bindHardVoteButtons(host);
        bindClearedButtons(host);
        bindShareButtons(host);
        bindSuggestButtons(host);
        bindCounterCalculators(host);
      }
    }
  }));
}

function populateStageFilter() {
  const stages = [...new Set(
    floors.map(floor => String(floor.stage || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  stageFilterEl.innerHTML = '<option value="all">All stages</option>' +
    stages.map(stage => `<option value="${escapeHTML(stage)}">${escapeHTML(stage)}</option>`).join('');

  $('#homeStageChips').innerHTML = stages.slice(0, 8).map(stage =>
    `<button type="button" data-stage-chip="${escapeHTML(stage)}">${escapeHTML(stage)}</button>`
  ).join('');

  $$('#homeStageChips [data-stage-chip]').forEach(button =>
    button.addEventListener('click', () => goToTower(button.dataset.stageChip))
  );
}

function showPage(page) {
  const pages = { home: $('#homePage'), tower: $('#towerPage'), info: $('#infoPage'), credits: $('#creditsPage') };
  Object.entries(pages).forEach(([key, el]) => el.classList.toggle('hidden', key !== page));
  $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.page === page));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToTower(query = '') {
  showPage('tower');
  if (query && searchEl) {
    searchEl.value = query;
    activeStage = 'all';
    stageFilterEl.value = 'all';
  }
  render();
  setTimeout(() => searchEl?.focus(), 150);
}

function handleRoute() {
  const route = location.hash.replace('#', '') || 'home';
  const towerFloorMatch = route.match(/^tower\/(\d+)$/);
  if (towerFloorMatch) {
    showPage('tower');
    render();
    const floorNumber = towerFloorMatch[1];
    setTimeout(() => {
      const card = document.querySelector(`.floor-card[data-floor="${floorNumber}"]`);
      const summary = card?.querySelector('.floor-summary');
      if (summary && !card.classList.contains('open')) summary.click();
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return;
  }
  if (route === 'tower' || route === 'info' || route === 'credits' || route === 'home') showPage(route);
  else showPage('home');
}

function copyFloorLink(floor) {
  const url = `${location.origin}${location.pathname}#tower/${floor}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => showCopyFeedback(floor)).catch(() => fallbackCopy(url, floor));
  } else {
    fallbackCopy(url, floor);
  }
}

function fallbackCopy(text, floor) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try { document.execCommand('copy'); } catch (_) {}
  input.remove();
  showCopyFeedback(floor);
}

function showCopyFeedback(floor) {
  const button = document.querySelector(`[data-copy-floor="${floor}"]`);
  if (!button) return;
  const old = button.textContent;
  button.textContent = 'Copied ✓';
  setTimeout(() => { if (button.isConnected) button.textContent = old; }, 1300);
}

function updateHomeStatsAnimated() {
  animateCount($('#homeFloorCount'), floors.length);
  animateCount($('#homeModifierCount'), new Set(floors.map(f => cleanModifier(f.modifier)).filter(Boolean)).size);
  animateCount($('#homeStageCount'), new Set(floors.map(f => f.stage).filter(Boolean)).size);
}

async function loadStrategies() {
  try {
    const response = await fetch(`data/strategies.json?v=1`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load strategies.');
    const data = await response.json();
    strategies = data && typeof data === 'object' ? data : {};
  } catch (error) {
    console.warn('Strategies could not be loaded:', error);
    strategies = {};
  }
}

function bindShareButtons(scope = document) {
  scope.querySelectorAll('[data-copy-floor]').forEach(button => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.stopPropagation();
      copyFloorLink(button.dataset.copyFloor);
    });
  });
}

function bindHardVoteButtons(scope = document) {
  scope.querySelectorAll('[data-hard-vote]').forEach(button => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', async event => {
      event.stopPropagation();
      const floorNumber = Number(button.dataset.hardVote);
      if (!Number.isInteger(floorNumber) || hasVotedHard(floorNumber)) return;

      button.disabled = true;
      button.classList.add('is-loading');
      try {
        const voted = await voteHard(floorNumber);
        if (!voted) return;
        await refreshSharedVotesUI();
        const scrollY = window.scrollY;
        render();
        requestAnimationFrame(() => {
          const card = document.querySelector(`.floor-card[data-floor="${floorNumber}"]`);
          const summary = card?.querySelector('.floor-summary');
          if (summary) summary.click();
          window.scrollTo({ top: scrollY, behavior: 'auto' });
        });
      } catch (error) {
        console.error('Hard vote failed:', error);
        button.disabled = false;
        button.classList.remove('is-loading');
        alert(error.message || 'Could not register the vote.');
      }
    });
  });
}

let votesRefreshTimer = null;

function refreshVoteButtonsOnly() {
  $$('[data-hard-vote]').forEach(button => {
    const floorNumber = String(button.dataset.hardVote || '');
    const votes = getHardVotes(floorNumber);
    const voted = hasVotedHard(floorNumber);
    const count = button.querySelector('em');
    const label = button.querySelector('b');
    if (count) count.textContent = String(votes);
    if (label) label.textContent = voted ? 'Voted' : 'Vote Hard';
    button.classList.toggle('voted', voted);
    button.disabled = voted;
  });

  $$('.floor-card').forEach(card => {
    const floorNumber = String(card.dataset.floor || '');
    const hard = getHardVotes(floorNumber) >= HARD_VOTE_THRESHOLD;
    const number = card.querySelector('.floor-number');
    if (!number) return;
    number.classList.toggle('is-hard', hard);
    let badge = number.querySelector('.hard-badge');
    if (hard && !badge) {
      badge = document.createElement('small');
      badge.className = 'hard-badge';
      badge.textContent = 'HARD';
      number.appendChild(badge);
    } else if (!hard && badge) {
      badge.remove();
    }
  });
}

async function refreshSharedVotesUI() {
  try {
    const before = JSON.stringify(sharedHardVotes);
    await loadSharedVotes();
    const changed = before !== JSON.stringify(sharedHardVotes);
    if (!changed) return;
    if (activeFilter === 'hard') {
      render();
    } else {
      refreshVoteButtonsOnly();
    }
  } catch (error) {
    console.warn('Shared votes refresh failed:', error);
  }
}

function startVotesRefresh() {
  if (votesRefreshTimer) clearInterval(votesRefreshTimer);
  votesRefreshTimer = setInterval(refreshSharedVotesUI, 30000);
  window.addEventListener('focus', refreshSharedVotesUI);
}

async function init() {
  const cached = loadCachedFloors();

  if (cached) {
    floors = cached.floors.filter(floor => Number.isInteger(Number(floor.floor)));
    floors.sort((a, b) => Number(a.floor) - Number(b.floor));
    if (countEl) countEl.textContent = floors.length;
    updateHomeStatsAnimated();
    populateStageFilter();
    setStatus('', 'Showing cached data — syncing...');
    render();
    handleRoute();
  } else {
    renderSkeletons(8, 'Loading tower data — first load can take a few seconds...');
    resultCountEl.textContent = 'Loading...';
    setStatus('', 'Syncing');
  }

  try {
    const [, freshFloors] = await Promise.all([loadStrategies(), fetchTowerData()]);
    floors = freshFloors.filter(floor => Number.isInteger(Number(floor.floor)));
    floors.sort((a, b) => Number(a.floor) - Number(b.floor));
    saveCachedFloors(floors);

    if (countEl) countEl.textContent = floors.length;
    updateHomeStatsAnimated();
    populateStageFilter();
    setStatus('online', 'Synchronized');
    try {
      await loadSharedVotes();
    } catch (voteError) {
      console.warn('Shared votes could not be loaded:', voteError);
    }
    startVotesRefresh();
    render();
    handleRoute();
    detectLoadouts(floors).then(() => {
      if (activeFilter === 'loadout') render();
      else refreshVisibleLoadouts();
    });
  } catch (error) {
    console.error(error);
    if (cached) {
      // Keep showing the cached list — just flag that the refresh failed.
      setStatus('error', 'Could not refresh — showing cached data');
    } else {
      setStatus('error', 'API error');
      listEl.innerHTML = `<div class="error-card"><strong>The Tower data could not be loaded.</strong><span>${escapeHTML(error.message)}</span><small>Check the Apps Script web app deployment and refresh the page.</small><button class="small-button retry-button" id="retryFetch" type="button">↻ Try again</button></div>`;
      $('#retryFetch')?.addEventListener('click', init);
      resultCountEl.textContent = '0 of 0 floors';
      if (countEl) countEl.textContent = '—';
      $('#homeFloorCount') && ($('#homeFloorCount').textContent = '—');
      $('#homeModifierCount') && ($('#homeModifierCount').textContent = '—');
      $('#homeStageCount') && ($('#homeStageCount').textContent = '—');
    }
  }
}

// ---------------------------------------------------------------------
// UPDATE LOG
// Newest first. Only the last 3 are kept/shown via the Versions button.
// Add a new entry at the top (with a new `id`) any time you want the log
// to pop up again for everyone.
const UPDATE_LOG_HISTORY = [
  {
    id: 4,
    categories: {
      Changes: [
        { title: 'Floor Cleared tracker', description: 'Mark any floor as cleared from its details panel and track your overall progress with the new bar above the floor list. Filter the list to only your cleared floors with the new "Cleared" button.' },
        { title: 'Counter Calculator', description: 'Every floor now has a built-in calculator — pick an archetype and an element to estimate the damage multiplier against that boss.' }
      ],
      Strategies: [],
      Uis: [
        { title: 'Resistances & Affinities alignment', description: 'Fixed the values in the floor list not lining up under their column headers — both are now properly centered.' },
        { title: 'Update log redesign', description: 'A cleaner layout with color-coded entries per category and a refreshed look.' }
      ]
    }
  },
  {
    id: 3,
    categories: {
      Changes: [
        { title: 'Community suggestions', description: 'Added "Suggest Loadout" and "Suggest strategy or video" buttons on floors that are missing them. Submissions go straight to our Discord for review.' }
      ],
      Strategies: [],
      Uis: [
        { title: 'Loadout layout', description: 'Fixed the empty space next to loadout images — the image and text now line up properly instead of leaving a big gap.' },
        { title: 'Copy Floor Link', description: 'Moved next to Vote Hard and made smaller, instead of a big button stuck in the corner.' },
        { title: 'Resistances alignment', description: 'Resistance values are now centered and stacked, matching how affinities are displayed.' },
        { title: 'Update log', description: 'No longer scrolls internally, and you can now browse the last 3 versions with the Versions button below.' }
      ]
    }
  },
  {
    id: 2,
    categories: {
      Changes: [],
      Strategies: [
        { title: 'New Loadouts', description: '278, 283, 285, 288, 291, 295' }
      ],
      Uis: []
    }
  },
  {
    id: 1,
    categories: {
      Changes: [
        { title: 'Hard Floors voting', description: 'Community voting for floors that are consistently marked as hard, with direct floor links and lighter floor interactions.' }
      ],
      Strategies: [
        { title: 'New Strategies', description: '158(TI)' },
        { title: 'New Loadouts', description: '250, 276, 177(TI), 158(TI), 162(TI)' }
      ],
      Uis: [
        { title: 'Bigger affinities', description: 'Affinity icons in the details panel no longer render smaller than resistances.' }
      ]
    }
  }
];

const UPDATE_LOG = UPDATE_LOG_HISTORY[0]; // latest — kept for back-compat with anything referencing it directly
const UPDATE_LOG_CATEGORIES = ['Changes', 'Strategies', 'Uis'];
let activeUpdateLogId = UPDATE_LOG.id;

function getUpdateLogEntry(id) {
  return UPDATE_LOG_HISTORY.find(entry => entry.id === id) || UPDATE_LOG_HISTORY[0];
}

function closeUpdateLog() {
  $('#updateModal')?.classList.add('hidden');
  try { localStorage.setItem(`towerOfGoyUpdateSeen:${UPDATE_LOG.id}`, '1'); } catch (_) {}
}

function renderUpdateVersionList() {
  const list = $('#updateVersionList');
  if (!list) return;
  list.innerHTML = UPDATE_LOG_HISTORY.map(entry => {
    const isLatest = entry.id === UPDATE_LOG_HISTORY[0].id;
    const isActive = entry.id === activeUpdateLogId;
    return `<button type="button" class="update-version-pill${isActive ? ' active' : ''}" data-version-id="${entry.id}">#${entry.id}${isLatest ? ' · Latest' : ''}</button>`;
  }).join('');
}

function renderUpdateLogBody(id = activeUpdateLogId) {
  const body = $('#updateLogBody');
  if (!body) return;

  const log = getUpdateLogEntry(id);
  activeUpdateLogId = log.id;

  const kicker = $('#updateModalKicker');
  if (kicker) kicker.textContent = `UPDATE #${log.id}`;

  const sections = UPDATE_LOG_CATEGORIES.map(category => {
    const entries = log.categories?.[category] || [];
    if (!entries.length) return '';
    const items = entries.map(entry => `<div class="update-entry"><strong>${escapeHTML(entry.title)}</strong><p>${escapeHTML(entry.description)}</p></div>`).join('');
    return `<section class="update-category" data-category="${escapeHTML(category)}"><span class="update-category-title">${escapeHTML(category)}</span><div class="update-entry-list">${items}</div></section>`;
  }).join('');

  body.innerHTML = sections || '<p class="muted">No updates in this release.</p>';
  renderUpdateVersionList();
}

function openUpdateLog() {
  activeUpdateLogId = UPDATE_LOG_HISTORY[0].id;
  renderUpdateLogBody(activeUpdateLogId);
  $('#updateModal')?.classList.remove('hidden');
}

function setupUpdateLog() {
  $('#updateLogButton')?.addEventListener('click', openUpdateLog);
  $('#updateOk')?.addEventListener('click', closeUpdateLog);
  $('#updateClose')?.addEventListener('click', closeUpdateLog);
  $('.update-backdrop')?.addEventListener('click', closeUpdateLog);
  $('#updateVersionsToggle')?.addEventListener('click', () => {
    $('#updateVersionList')?.classList.toggle('hidden');
  });
  $('#updateVersionList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-version-id]');
    if (!button) return;
    renderUpdateLogBody(Number(button.dataset.versionId));
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#updateModal')?.classList.contains('hidden')) closeUpdateLog();
  });

  let seen = false;
  try { seen = localStorage.getItem(`towerOfGoyUpdateSeen:${UPDATE_LOG.id}`) === '1'; } catch (_) {}
  if (!seen) setTimeout(openUpdateLog, 350);
}

let searchTimer = null;
searchEl?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 70);
});
clearSearchEl?.addEventListener('click', () => { searchEl.value = ''; render(); searchEl.focus(); });
stageFilterEl?.addEventListener('change', () => { activeStage = stageFilterEl.value; render(); });
$('#sortButton')?.addEventListener('click', () => {
  sortAscending = !sortAscending;
  $('#sortButton').textContent = sortAscending ? '↓ Lowest → highest' : '↑ Highest → lowest';
  render();
});
$('#resetFilters')?.addEventListener('click', () => {
  activeFilter = 'all';
  activeStage = 'all';
  searchEl.value = '';
  stageFilterEl.value = 'all';
  $$('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
  render();
});
$$('.filter-button').forEach(button => button.addEventListener('click', async () => {
  activeFilter = button.dataset.filter;
  $$('.filter-button').forEach(item => item.classList.toggle('active', item === button));
  if (activeFilter === 'loadout') {
    resultCountEl.textContent = 'Checking loadouts...';
    await detectLoadouts(floors);
  }
  render();
}));
$('#openTower')?.addEventListener('click', () => { location.hash = 'tower'; });
$('#homeSearchButton')?.addEventListener('click', () => {
  location.hash = 'tower';
  setTimeout(() => goToTower($('#homeSearch').value.trim()), 0);
});
$('#homeSearch')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('#homeSearchButton').click();
  }
});
$$('[data-quick]').forEach(button => button.addEventListener('click', () => {
  location.hash = 'tower';
  const action = button.dataset.quick;
  setTimeout(async () => {
    if (action === 'modifier') activeFilter = 'modifier';
    else if (action === 'loadout') activeFilter = 'loadout';
    else if (action === 'hard') activeFilter = 'hard';
    else activeFilter = 'all';

    $$('.filter-button').forEach(item => item.classList.toggle('active', item.dataset.filter === activeFilter));
    if (action === 'stage') searchEl.value = '';
    if (activeFilter === 'loadout') {
      resultCountEl.textContent = 'Checking loadouts...';
      await detectLoadouts(floors);
    }
    render();
  }, 0);
}));
$('#mobileMenu')?.addEventListener('click', () => $('.main-nav').classList.toggle('open'));
$$('.nav-link').forEach(link => link.addEventListener('click', () => $('.main-nav').classList.remove('open')));
window.addEventListener('hashchange', handleRoute);
window.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    event.preventDefault();
    showPage('tower');
    searchEl?.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchEl) {
    searchEl.value = '';
    render();
  }
});

setupUpdateLog();
handleRoute();
init();
