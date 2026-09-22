let floors = [];
let activeFilter = 'all';
let activeStage = 'all';
let sortAscending = true;
let floorMap = new Map();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const displayValue = (value, fallback = '---') => {
  const text = String(value ?? '').trim();
  return text && text !== '-' && text !== '—' ? text : fallback;
};
const escapeHTML = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

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
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - startTime) / 500);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(end * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderSkeletons(count = 7) {
  if (!listEl) return;
  listEl.innerHTML = `<div class="skeleton-list">${Array.from({ length: count }, (_, i) => `<div class="skeleton-card" style="--i:${i}"></div>`).join('')}</div>`;
}

function setStatus(type, text) {
  if (!statusEl) return;
  statusEl.className = `status ${type}`;
  statusEl.querySelector('span').textContent = text;
  $('#homeApiStatus').textContent = type === 'online' ? 'Data available and synchronized' : text;
  $('#homeLastSync').textContent = type === 'online'
    ? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function iconHTML(type, name, className = '') {
  const clean = String(name ?? '').trim();
  const icon = getIcon(type, clean);
  if (!icon) return '';
  return `<img class="icon-image ${className}" src="${escapeHTML(icon)}" alt="${escapeHTML(clean)}" loading="lazy" decoding="async">`;
}

function modifierHTML(modifier) {
  const value = cleanModifier(modifier);
  if (!value) return '<span class="muted-value">---</span>';
  const icon = getIcon('modifiers', value);
  return `<span class="modifier-pill">${icon ? iconHTML('modifiers', value, 'modifier-icon') : '<span class="modifier-fallback">M</span>'}<span>${escapeHTML(value)}</span></span>`;
}

function resistanceHTML(type, value) {
  const clean = displayValue(value);
  if (clean === '---') return '<span class="muted-value">---</span>';
  return `<span class="resistance-item">${iconHTML('archetypes', type)}<span>${escapeHTML(clean)}</span></span>`;
}

const ELEMENT_NAMES = new Set(['Hydro', 'Gale', 'Terra', 'Flame', 'Storm', 'Light', 'Dark']);

function normalizeAffinityList(list) {
  if (!Array.isArray(list)) return [];
  const normalized = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const element = String(item.element ?? '').trim();
    const value = String(item.value ?? '').trim();
    if (ELEMENT_NAMES.has(value) && i + 1 < list.length) {
      const nextValue = String(list[i + 1]?.value ?? '').trim();
      if (/^-?\d+(?:[.,]\d+)?x$/i.test(nextValue)) {
        normalized.push({ element: value, value: nextValue });
        i++;
        continue;
      }
    }
    if (ELEMENT_NAMES.has(element) && value && !ELEMENT_NAMES.has(value)) normalized.push({ element, value });
  }
  return normalized;
}

function affinityHTML(item) {
  const element = displayValue(item.element);
  const value = displayValue(item.value);
  return `<span class="affinity-item">${iconHTML('elements', element)}<span>${escapeHTML(element)}</span><b>${escapeHTML(value)}</b></span>`;
}

function loadoutHTML(floor) {
  const loadout = getLoadout(floor.floor);
  if (!loadout) {
    return `<div class="loadout-empty"><div class="loadout-empty-icon">+</div><div><strong>Manual loadout</strong><span>No image has been added for this floor.</span></div></div>`;
  }
  return `<div class="loadout-card"><div class="loadout-image-wrap"><img src="${escapeHTML(loadout.image)}" alt="Loadout for Floor ${floor.floor}" loading="lazy" decoding="async"></div><div class="loadout-copy"><span class="section-label">LOADOUT</span><strong>${escapeHTML(loadout.title || 'Recommended loadout')}</strong>${loadout.note ? `<p>${escapeHTML(loadout.note)}</p>` : ''}</div></div>`;
}

function floorSummary(floor) {
  const modifier = cleanModifier(floor.modifier);
  return `<article class="floor-card ${modifier ? 'has-modifier' : ''}" data-floor="${escapeHTML(floor.floor)}">
    <button class="floor-summary" type="button" aria-expanded="false">
      <span class="floor-number">${String(floor.floor).padStart(2, '0')}</span>
      <span class="stage-boss"><strong>${escapeHTML(displayValue(floor.stage))}</strong><small>${escapeHTML(displayValue(floor.boss))}</small></span>
      <span class="summary-modifier">${modifierHTML(modifier)}</span>
      <span class="summary-hp summary-boss-hp"><b>${escapeHTML(displayValue(floor.bossHP?.actual || floor.bossHP?.base))}</b><small>Boss HP</small></span>
      <span class="summary-hp summary-enemy-hp"><b>${escapeHTML(displayValue(floor.enemyHP))}</b><small>Enemy HP</small></span>
      <span class="summary-resists">${resistanceHTML('Magical', floor.resistances?.magical)}${resistanceHTML('Physical', floor.resistances?.physical)}</span>
      <span class="expand-icon">+</span>
    </button>
    <div class="floor-details"><div class="details-inner"></div></div>
  </article>`;
}

function detailsHTML(floor) {
  const modifier = cleanModifier(floor.modifier);
  const affinities = normalizeAffinityList(floor.affinities);
  return `<div class="details-grid">
    <section class="info-panel"><div class="panel-title"><span>01</span><strong>Boss</strong></div><div class="boss-name">${escapeHTML(displayValue(floor.boss))}</div><div class="modifier-line"><span class="label">Modifier</span>${modifierHTML(modifier)}</div></section>
    <section class="info-panel"><div class="panel-title"><span>02</span><strong>HP</strong></div><div class="hp-row"><span>Base HP</span><b>${escapeHTML(displayValue(floor.bossHP?.base))}</b></div><div class="hp-row"><span>Actual HP</span><b>${escapeHTML(displayValue(floor.bossHP?.actual))}</b></div><div class="hp-row"><span>Enemy Wave 1</span><b>${escapeHTML(displayValue(floor.enemyHP))}</b></div></section>
    <section class="info-panel"><div class="panel-title"><span>03</span><strong>Resistances</strong></div><div class="resistance-list">${resistanceHTML('Magical', floor.resistances?.magical)}${resistanceHTML('Physical', floor.resistances?.physical)}</div></section>
    <section class="info-panel affinity-panel"><div class="panel-title"><span>04</span><strong>Affinities</strong></div><div class="affinity-list">${affinities.length ? affinities.map(affinityHTML).join('') : '<span class="muted-value">No affinities listed.</span>'}</div></section>
  </div><div class="loadout-section">${loadoutHTML(floor)}</div>`;
}

function matchesSearch(floor, query) {
  if (!query) return true;
  const text = [floor.floor, floor.stage, floor.boss, floor.modifier, floor.enemyHP, floor.bossHP?.base, floor.bossHP?.actual, floor.resistances?.magical, floor.resistances?.physical, ...(floor.affinities || []).flatMap(item => [item.element, item.value])].join(' ').toLowerCase();
  return text.includes(query);
}

function matchesFilter(floor) {
  if (activeFilter === 'modifier') return Boolean(cleanModifier(floor.modifier));
  if (activeFilter === 'loadout') return Boolean(getLoadout(floor.floor));
  return true;
}

function render() {
  const query = searchEl?.value.trim().toLowerCase() || '';
  const filtered = floors.filter(floor => matchesFilter(floor) && (activeStage === 'all' || String(floor.stage) === activeStage) && matchesSearch(floor, query));
  const ordered = [...filtered].sort((a, b) => sortAscending ? Number(a.floor) - Number(b.floor) : Number(b.floor) - Number(a.floor));
  listEl.innerHTML = ordered.map(floorSummary).join('');
  emptyEl.classList.toggle('hidden', ordered.length !== 0);
  resultCountEl.textContent = `${ordered.length} of ${floors.length} floors`;
  clearSearchEl.classList.toggle('hidden', !query);
}

function openFloor(card, floor) {
  const wasOpen = card.classList.contains('open');
  $$('.floor-card.open').forEach(other => {
    if (other === card) return;
    other.classList.remove('open');
    other.querySelector('.floor-summary')?.setAttribute('aria-expanded', 'false');
    const inner = other.querySelector('.details-inner');
    if (inner) inner.innerHTML = '';
  });
  const button = card.querySelector('.floor-summary');
  const inner = card.querySelector('.details-inner');
  if (wasOpen) {
    card.classList.remove('open');
    button?.setAttribute('aria-expanded', 'false');
    if (inner) inner.innerHTML = '';
    return;
  }
  if (inner) inner.innerHTML = detailsHTML(floor);
  card.classList.add('open');
  button?.setAttribute('aria-expanded', 'true');
}

listEl?.addEventListener('click', event => {
  const button = event.target.closest('.floor-summary');
  if (!button) return;
  const card = button.closest('.floor-card');
  const floor = floorMap.get(String(card?.dataset.floor));
  if (card && floor) openFloor(card, floor);
});

function populateStageFilter() {
  const stages = [...new Set(floors.map(floor => String(floor.stage || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  stageFilterEl.innerHTML = '<option value="all">All stages</option>' + stages.map(stage => `<option value="${escapeHTML(stage)}">${escapeHTML(stage)}</option>`).join('');
  $('#homeStageChips').innerHTML = stages.slice(0, 8).map(stage => `<button type="button" data-stage-chip="${escapeHTML(stage)}">${escapeHTML(stage)}</button>`).join('');
  $$('#homeStageChips [data-stage-chip]').forEach(button => button.addEventListener('click', () => goToTower(button.dataset.stageChip)));
}

function showPage(page) {
  const pages = { home: $('#homePage'), tower: $('#towerPage'), info: $('#infoPage') };
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
  setTimeout(() => searchEl?.focus(), 100);
}

function handleRoute() {
  const route = location.hash.replace('#', '') || 'home';
  showPage(route === 'tower' || route === 'info' || route === 'home' ? route : 'home');
}

function updateHomeStatsAnimated() {
  animateCount($('#homeFloorCount'), floors.length);
  animateCount($('#homeModifierCount'), new Set(floors.map(f => cleanModifier(f.modifier)).filter(Boolean)).size);
  animateCount($('#homeStageCount'), new Set(floors.map(f => f.stage).filter(Boolean)).size);
}

const UPDATE_LOG_VERSION = 'v1.1';
function closeUpdateLog() {
  $('#updateModal')?.classList.add('hidden');
  try { localStorage.setItem(`towerOfGoyUpdateSeen:${UPDATE_LOG_VERSION}`, '1'); } catch (_) {}
}
function openUpdateLog() { $('#updateModal')?.classList.remove('hidden'); }
function setupUpdateLog() {
  $('#updateLogButton')?.addEventListener('click', openUpdateLog);
  $('#updateOk')?.addEventListener('click', closeUpdateLog);
  $('#updateClose')?.addEventListener('click', closeUpdateLog);
  $('.update-backdrop')?.addEventListener('click', closeUpdateLog);
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#updateModal')?.classList.contains('hidden')) closeUpdateLog(); });
  let seen = false;
  try { seen = localStorage.getItem(`towerOfGoyUpdateSeen:${UPDATE_LOG_VERSION}`) === '1'; } catch (_) {}
  if (!seen) setTimeout(openUpdateLog, 350);
}

async function init() {
  renderSkeletons();
  resultCountEl.textContent = 'Loading...';
  try {
    setStatus('', 'Syncing');
    floors = await fetchTowerData();
    floors = floors.filter(floor => Number.isFinite(Number(floor.floor)));
    floors.sort((a, b) => Number(a.floor) - Number(b.floor));
    floorMap = new Map(floors.map(floor => [String(floor.floor), floor]));
    animateCount(countEl, floors.length);
    updateHomeStatsAnimated();
    populateStageFilter();
    setStatus('online', 'Synchronized');
    render();
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

searchEl?.addEventListener('input', render);
clearSearchEl?.addEventListener('click', () => { searchEl.value = ''; render(); searchEl.focus(); });
stageFilterEl?.addEventListener('change', () => { activeStage = stageFilterEl.value; render(); });
$('#sortButton')?.addEventListener('click', () => {
  sortAscending = !sortAscending;
  $('#sortButton').textContent = sortAscending ? '↓ Lowest → highest' : '↑ Highest → lowest';
  render();
});
$('#backTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('#resetFilters')?.addEventListener('click', () => {
  activeFilter = 'all'; activeStage = 'all'; searchEl.value = ''; stageFilterEl.value = 'all';
  $$('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
  render();
});
$$('.filter-button').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  $$('.filter-button').forEach(item => item.classList.toggle('active', item === button));
  render();
}));
$('#openTower')?.addEventListener('click', () => { location.hash = 'tower'; });
$('#homeSearchButton')?.addEventListener('click', () => { location.hash = 'tower'; setTimeout(() => goToTower($('#homeSearch').value.trim()), 0); });
$('#homeSearch')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#homeSearchButton').click(); } });
$$('[data-quick]').forEach(button => button.addEventListener('click', () => {
  location.hash = 'tower';
  const action = button.dataset.quick;
  setTimeout(() => {
    if (action === 'modifier') activeFilter = 'modifier'; else if (action === 'loadout') activeFilter = 'loadout'; else activeFilter = 'all';
    $$('.filter-button').forEach(item => item.classList.toggle('active', item.dataset.filter === activeFilter));
    if (action === 'stage') searchEl.value = '';
    render();
  }, 0);
}));
$('#mobileMenu')?.addEventListener('click', () => $('.main-nav').classList.toggle('open'));
$$('.nav-link').forEach(link => link.addEventListener('click', () => $('.main-nav').classList.remove('open')));
window.addEventListener('hashchange', handleRoute);
window.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); showPage('tower'); searchEl?.focus(); }
  if (event.key === 'Escape' && document.activeElement === searchEl) { searchEl.value = ''; render(); }
});

handleRoute();
setupUpdateLog();
init();
