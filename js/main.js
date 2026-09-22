let floors = [];
let activeFilter = 'all';
let activeStage = 'all';
let sortAscending = true;

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

function renderSkeletons(count = 8) {
  if (!listEl) return;
  const cards = Array.from({ length: count }, (_, i) =>
    `<div class="skeleton-card" style="--i:${i}"></div>`
  ).join('');
  listEl.innerHTML = `<div class="skeleton-list">${cards}</div>`;
}

function setStatus(type, text) {
  if (!statusEl) return;
  statusEl.className = `status ${type}`;
  statusEl.querySelector('span').textContent = text;
  $('#homeApiStatus').textContent = type === 'online' ? 'Data available and synchronized' : text;
  $('#homeLastSync').textContent = type === 'online'
    ? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—';
}

function iconHTML(type, name, className = '') {
  const clean = String(name ?? '').trim();
  const icon = getIcon(type, clean);
  if (!icon) return '';

  return `<img class="icon-image ${className}" src="${escapeHTML(icon)}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
}

const MODIFIER_COLORS = {
  Summoner: '#B52BFF',
  Sword: '#00CFFF',
  Greed: '#E8E8E8',
  Tartaros: '#7CFF00'
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
  return `<span class="resistance-item" style="--data-color:${escapeHTML(color)}">${iconHTML('archetypes', type)}<span>${escapeHTML(clean)}</span></span>`;
}

const ELEMENT_NAMES = new Set(['Hydro', 'Gale', 'Terra', 'Flame', 'Storm', 'Light', 'Dark']);

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
  const element = displayValue(item.element);
  const value = displayValue(item.value);
  const color = getIconColor(element);
  return `<span class="affinity-item" style="--data-color:${escapeHTML(color)}">${iconHTML('elements', element)}<span>${escapeHTML(element)}</span><b>${escapeHTML(value)}</b></span>`;
}

function loadoutHTML(floor) {
  const floorNumber = Number(floor.floor);
  const trait = getLoadout(floorNumber, 'trait');
  const traitless = getLoadout(floorNumber, 'traitless');
  const traitExists = loadoutStatus.get(loadoutKey(floorNumber, 'trait')) === true;
  const traitlessExists = loadoutStatus.get(loadoutKey(floorNumber, 'traitless')) === true;

  if (!traitExists && !traitlessExists) {
    return `<div class="loadout-empty"><div class="loadout-empty-icon">—</div><div><strong>No Loadout Detected.</strong><span>There is no loadout image available for this floor.</span></div></div>`;
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
    <div class="loadout-copy">${tabs}<span class="section-label">LOADOUT</span><strong class="loadout-title">${escapeHTML(activeLoadout.title)}</strong></div>
  </div>`;
}

function floorSummary(floor) {
  const modifier = cleanModifier(floor.modifier);
  const affinities = normalizeAffinityList(floor.affinities);
  const summaryAffinities = affinities.length
    ? affinities.map(item => `<span class="summary-affinity">${iconHTML('elements', item.element)}<span>${escapeHTML(item.element)}</span><b>${escapeHTML(item.value)}</b></span>`).join('')
    : '<span class="muted-value">---</span>';

  return `<button class="floor-summary" type="button" aria-expanded="false">
      <span class="floor-number">${String(floor.floor).padStart(2, '0')}</span>
      <span class="stage-boss"><strong>${escapeHTML(displayValue(floor.stage))}</strong><small>${escapeHTML(displayValue(floor.boss))}</small></span>
      <span class="summary-modifier">${modifierHTML(modifier)}</span>
      <span class="summary-hp summary-boss-hp"><b class="boss-hp-value">${hpHTML(floor.bossHP?.actual || floor.bossHP?.base, modifier)}</b><small>Boss HP</small></span>
      <span class="summary-hp summary-enemy-hp"><b class="enemy-hp-value">${escapeHTML(displayValue(floor.enemyHP))}</b><small>Enemy HP</small></span>
      <span class="summary-resists">${resistanceHTML('Magical', floor.resistances?.magical)}${resistanceHTML('Physical', floor.resistances?.physical)}</span>
      <span class="summary-affinities">${summaryAffinities}</span>
      <span class="expand-icon" aria-hidden="true">+</span>
    </button>`;
}

function floorDetails(floor) {
  const modifier = cleanModifier(floor.modifier);
  const affinities = normalizeAffinityList(floor.affinities);
  return `<div class="floor-details"><div class="details-inner"><div class="details-grid">
      <section class="info-panel"><div class="panel-title"><span>01</span><strong>Boss</strong></div><div class="boss-name">${escapeHTML(displayValue(floor.boss))}</div><div class="modifier-line"><span class="label">Modifier</span>${modifierHTML(modifier)}</div></section>
      <section class="info-panel"><div class="panel-title"><span>02</span><strong>HP</strong></div><div class="hp-row hp-row-boss"><span>Base HP</span><b class="boss-hp-value">${hpHTML(floor.bossHP?.base, modifier)}</b></div><div class="hp-row hp-row-boss"><span>Actual HP</span><b class="boss-hp-value">${hpHTML(floor.bossHP?.actual, modifier)}</b></div><div class="hp-row hp-row-enemy"><span>Enemy Wave 1</span><b class="enemy-hp-value">${escapeHTML(displayValue(floor.enemyHP))}</b></div></section>
      <section class="info-panel"><div class="panel-title"><span>03</span><strong>Resistances</strong></div><div class="resistance-list">${resistanceHTML('Magical', floor.resistances?.magical)}${resistanceHTML('Physical', floor.resistances?.physical)}</div></section>
      <section class="info-panel affinity-panel"><div class="panel-title"><span>04</span><strong>Affinities</strong></div><div class="affinity-list">${affinities.length ? affinities.map(affinityHTML).join('') : '<span class="muted-value">No affinities listed.</span>'}</div></section>
    </div><div class="loadout-section">${loadoutHTML(floor)}</div></div></div>`;
}

function refreshVisibleLoadouts() {
  $$('.floor-card').forEach(card => {
    const floor = floors.find(item => String(item.floor) === card.dataset.floor);
    const section = card.querySelector('.loadout-section');
    if (floor && section) { section.outerHTML = `<div class="loadout-section">${loadoutHTML(floor)}</div>`; bindLoadoutTabs(card); }
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
  return `<article class="floor-card ${modifier ? 'has-modifier' : ''}" data-floor="${escapeHTML(floor.floor)}">${floorSummary(floor)}<div class="floor-details-host"></div></article>`;
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
  emptyEl.classList.toggle('hidden', ordered.length !== 0);
  resultCountEl.textContent = `${ordered.length} of ${floors.length} floors`;
  clearSearchEl.classList.toggle('hidden', !query);

  $$('.floor-summary').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.floor-card');
    const open = card.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
    const host = card.querySelector('.floor-details-host');
    if (open && host && !host.dataset.rendered) {
      const floor = floors.find(item => String(item.floor) === card.dataset.floor);
      if (floor) {
        host.innerHTML = floorDetails(floor);
        host.dataset.rendered = 'true';
        bindLoadoutTabs(host);
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
  if (route === 'tower' || route === 'info' || route === 'credits' || route === 'home') showPage(route);
  else showPage('home');
}

function updateHomeStatsAnimated() {
  animateCount($('#homeFloorCount'), floors.length);
  animateCount($('#homeModifierCount'), new Set(floors.map(f => cleanModifier(f.modifier)).filter(Boolean)).size);
  animateCount($('#homeStageCount'), new Set(floors.map(f => f.stage).filter(Boolean)).size);
}

async function init() {
  renderSkeletons();
  resultCountEl.textContent = 'Loading...';
  try {
    setStatus('', 'Syncing');
    floors = await fetchTowerData();
    floors = floors.filter(floor => Number.isInteger(Number(floor.floor)));
    floors.sort((a, b) => Number(a.floor) - Number(b.floor));
    countEl.textContent = floors.length;
    updateHomeStatsAnimated();
    populateStageFilter();
    setStatus('online', 'Synchronized');
    render();
    detectLoadouts(floors).then(() => {
      if (activeFilter === 'loadout') render();
      else refreshVisibleLoadouts();
    });
  } catch (error) {
    console.error(error);
    setStatus('error', 'API error');
    listEl.innerHTML = `<div class="error-card"><strong>The Tower data could not be loaded.</strong><span>${escapeHTML(error.message)}</span><small>Check the Apps Script web app deployment and refresh the page.</small><button class="small-button retry-button" id="retryFetch" type="button">↻ Try again</button></div>`;
    $('#retryFetch')?.addEventListener('click', init);
    resultCountEl.textContent = '0 of 0 floors';
    countEl.textContent = '—';
    $('#homeFloorCount').textContent = '—';
    $('#homeModifierCount').textContent = '—';
    $('#homeStageCount').textContent = '—';
  }
}

const UPDATE_LOG_VERSION = '1.3';

function closeUpdateLog() {
  $('#updateModal')?.classList.add('hidden');
  try { localStorage.setItem(`towerOfGoyUpdateSeen:${UPDATE_LOG_VERSION}`, '1'); } catch (_) {}
}

function openUpdateLog() {
  $('#updateModal')?.classList.remove('hidden');
}

function setupUpdateLog() {
  $('#updateLogButton')?.addEventListener('click', openUpdateLog);
  $('#updateOk')?.addEventListener('click', closeUpdateLog);
  $('#updateClose')?.addEventListener('click', closeUpdateLog);
  $('.update-backdrop')?.addEventListener('click', closeUpdateLog);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#updateModal')?.classList.contains('hidden')) closeUpdateLog();
  });

  let seen = false;
  try { seen = localStorage.getItem(`towerOfGoyUpdateSeen:${UPDATE_LOG_VERSION}`) === '1'; } catch (_) {}
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
