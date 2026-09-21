let floors = [];
let activeFilter = 'all';
let activeStage = 'all';
let sortAscending = true;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHTML = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const statusEl = $('#apiStatus');
const listEl = $('#towerList');
const emptyEl = $('#emptyState');
const searchEl = $('#searchInput');
const countEl = $('#floorCount');
const stageFilterEl = $('#stageFilter');
const resultCountEl = $('#resultCount');
const clearSearchEl = $('#clearSearch');

function setStatus(type, text) {
  if (!statusEl) return;
  statusEl.className = `status ${type}`;
  statusEl.querySelector('span').textContent = text;
  $('#homeApiStatus').textContent = type === 'online' ? 'Dados disponíveis e sincronizados' : text;
  $('#homeLastSync').textContent = type === 'online' ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function iconHTML(type, name, className = '') {
  const clean = String(name ?? '').trim();
  const icon = getIcon(type, clean);
  if (!icon) return '';
  return `<span class="icon-mask ${className}" aria-label="${escapeHTML(clean)}" role="img" style="--icon-url:url('${icon}');--icon-color:${getIconColor(clean)}"></span>`;
}

function modifierHTML(modifier) {
  const value = cleanModifier(modifier);
  if (!value) return '<span class="muted-value">—</span>';
  const icon = getIcon('modifiers', value);
  return `<span class="modifier-pill">${icon ? iconHTML('modifiers', value, 'modifier-icon') : '<span class="modifier-fallback">M</span>'}<span>${escapeHTML(value)}</span></span>`;
}

function resistanceHTML(type, value) {
  if (!value) return '<span class="muted-value">—</span>';
  return `<span class="resistance-item">${iconHTML('archetypes', type)}<span>${escapeHTML(value)}</span></span>`;
}

function affinityHTML(item) {
  return `<span class="affinity-item">${iconHTML('elements', item.element)}<span>${escapeHTML(item.element)}</span><b>${escapeHTML(item.value)}</b></span>`;
}

function loadoutHTML(floor) {
  const loadout = getLoadout(floor.floor);
  if (!loadout) return `<div class="loadout-empty"><div class="loadout-empty-icon">+</div><div><strong>Loadout manual</strong><span>Nenhuma imagem adicionada para este floor.</span></div></div>`;
  return `<div class="loadout-card"><div class="loadout-image-wrap"><img src="${escapeHTML(loadout.image)}" alt="Loadout do Floor ${floor.floor}" loading="lazy"></div><div class="loadout-copy"><span class="section-label">LOADOUT</span><strong>${escapeHTML(loadout.title || 'Loadout recomendado')}</strong>${loadout.note ? `<p>${escapeHTML(loadout.note)}</p>` : ''}</div></div>`;
}

function floorCard(floor) {
  const modifier = cleanModifier(floor.modifier);
  const affinities = Array.isArray(floor.affinities) ? floor.affinities : [];
  return `<article class="floor-card ${modifier ? 'has-modifier' : ''}" data-floor="${escapeHTML(floor.floor)}">
    <button class="floor-summary" type="button" aria-expanded="false">
      <span class="floor-number">${String(floor.floor).padStart(2, '0')}</span>
      <span class="stage-boss"><strong>${escapeHTML(floor.stage || '—')}</strong><small>${escapeHTML(floor.boss || 'Boss não informado')}</small></span>
      <span class="summary-modifier">${modifierHTML(modifier)}</span>
      <span class="summary-hp"><b>${escapeHTML(floor.bossHP?.actual || floor.bossHP?.base || '—')}</b><small>Boss HP</small></span>
      <span class="summary-hp"><b>${escapeHTML(floor.enemyHP || '—')}</b><small>Enemy HP</small></span>
      <span class="summary-resists">${resistanceHTML('Magical', floor.resistances?.magical)}${resistanceHTML('Physical', floor.resistances?.physical)}</span>
      <span class="expand-icon">+</span>
    </button>
    <div class="floor-details"><div class="details-inner"><div class="details-grid">
      <section class="info-panel"><div class="panel-title"><span>01</span><strong>Boss</strong></div><div class="boss-name">${escapeHTML(floor.boss || '—')}</div><div class="modifier-line"><span class="label">Modifier</span>${modifierHTML(modifier)}</div></section>
      <section class="info-panel"><div class="panel-title"><span>02</span><strong>HP</strong></div><div class="hp-row"><span>Base HP</span><b>${escapeHTML(floor.bossHP?.base || '—')}</b></div><div class="hp-row"><span>Actual HP</span><b>${escapeHTML(floor.bossHP?.actual || '—')}</b></div><div class="hp-row"><span>Enemy Wave 1</span><b>${escapeHTML(floor.enemyHP || '—')}</b></div></section>
      <section class="info-panel"><div class="panel-title"><span>03</span><strong>Resistências</strong></div><div class="resistance-list">${resistanceHTML('Magical', floor.resistances?.magical)}${resistanceHTML('Physical', floor.resistances?.physical)}</div></section>
      <section class="info-panel affinity-panel"><div class="panel-title"><span>04</span><strong>Afinidades</strong></div><div class="affinity-list">${affinities.length ? affinities.map(affinityHTML).join('') : '<span class="muted-value">Nenhuma afinidade informada.</span>'}</div></section>
    </div><div class="loadout-section">${loadoutHTML(floor)}</div></div></div>
  </article>`;
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
  listEl.innerHTML = ordered.map(floorCard).join('');
  emptyEl.classList.toggle('hidden', ordered.length !== 0);
  resultCountEl.textContent = `${ordered.length} de ${floors.length} floors`;
  clearSearchEl.classList.toggle('hidden', !query);
  $$('.floor-summary').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.floor-card');
    const open = card.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  }));
}

function populateStageFilter() {
  const stages = [...new Set(floors.map(floor => String(floor.stage || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  stageFilterEl.innerHTML = '<option value="all">Todos os stages</option>' + stages.map(stage => `<option value="${escapeHTML(stage)}">${escapeHTML(stage)}</option>`).join('');
  $('#homeStageChips').innerHTML = stages.slice(0, 8).map(stage => `<button type="button" data-stage-chip="${escapeHTML(stage)}">${escapeHTML(stage)}</button>`).join('');
  $$('#homeStageChips [data-stage-chip]').forEach(button => button.addEventListener('click', () => goToTower(button.dataset.stageChip)));
}

function updateHomeStats() {
  $('#homeFloorCount').textContent = floors.length;
  $('#homeModifierCount').textContent = new Set(floors.map(f => cleanModifier(f.modifier)).filter(Boolean)).size;
  $('#homeStageCount').textContent = new Set(floors.map(f => f.stage).filter(Boolean)).size;
}

function showPage(page) {
  const pages = { home: $('#homePage'), tower: $('#towerPage'), info: $('#infoPage') };
  Object.entries(pages).forEach(([key, el]) => el.classList.toggle('hidden', key !== page));
  $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.page === page));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToTower(query = '') {
  showPage('tower');
  if (query && searchEl) { searchEl.value = query; activeStage = 'all'; stageFilterEl.value = 'all'; }
  render();
  setTimeout(() => searchEl?.focus(), 150);
}

function handleRoute() {
  const route = location.hash.replace('#', '') || 'home';
  if (route === 'tower' || route === 'info' || route === 'home') showPage(route);
  else showPage('home');
}

async function init() {
  try {
    setStatus('', 'Sincronizando');
    floors = await fetchTowerData();
    floors.sort((a, b) => Number(a.floor) - Number(b.floor));
    countEl.textContent = floors.length;
    updateHomeStats();
    populateStageFilter();
    setStatus('online', 'Sincronizado');
    render();
  } catch (error) {
    console.error(error);
    setStatus('error', 'Erro na API');
    listEl.innerHTML = `<div class="error-card"><strong>Não foi possível carregar a Tower.</strong><span>${escapeHTML(error.message)}</span><small>Verifique a implantação do Apps Script e tente atualizar a página.</small></div>`;
    countEl.textContent = '—';
    $('#homeFloorCount').textContent = '—';
    $('#homeModifierCount').textContent = '—';
    $('#homeStageCount').textContent = '—';
  }
}

searchEl?.addEventListener('input', render);
clearSearchEl?.addEventListener('click', () => { searchEl.value = ''; render(); searchEl.focus(); });
stageFilterEl?.addEventListener('change', () => { activeStage = stageFilterEl.value; render(); });
$('#sortButton')?.addEventListener('click', () => { sortAscending = !sortAscending; $('#sortButton').textContent = sortAscending ? '↓ 51 → cima' : '↑ alto → baixo'; render(); });
$('#backTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('#resetFilters')?.addEventListener('click', () => { activeFilter = 'all'; activeStage = 'all'; searchEl.value = ''; stageFilterEl.value = 'all'; $$('.filter-button').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all')); render(); });
$$('.filter-button').forEach(button => button.addEventListener('click', () => { activeFilter = button.dataset.filter; $$('.filter-button').forEach(item => item.classList.toggle('active', item === button)); render(); }));
$('#openTower')?.addEventListener('click', () => { location.hash = 'tower'; });
$('#homeSearchButton')?.addEventListener('click', () => { location.hash = 'tower'; setTimeout(() => goToTower($('#homeSearch').value.trim()), 0); });
$('#homeSearch')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#homeSearchButton').click(); } });
$$('[data-quick]').forEach(button => button.addEventListener('click', () => {
  location.hash = 'tower';
  const action = button.dataset.quick;
  setTimeout(() => {
    if (action === 'modifier') { activeFilter = 'modifier'; }
    else if (action === 'loadout') { activeFilter = 'loadout'; }
    else { activeFilter = 'all'; }
    $$('.filter-button').forEach(item => item.classList.toggle('active', item.dataset.filter === activeFilter));
    if (action === 'stage') { searchEl.value = ''; }
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
init();
