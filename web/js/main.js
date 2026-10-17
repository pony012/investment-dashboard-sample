/* ============================== Orquestación ============================== */
function setSeg(id, value) { document.querySelectorAll(`#${id} button`).forEach(element => element.classList.toggle('on', (element.dataset.value || element.dataset.period) === value)); }
function withIncDiv(value) { const keep = state.incDiv; state.incDiv = value; const built = buildModel(); state.incDiv = keep; return built; }
function renderAll() {
  readTokens();
  model = buildModel();
  model.alt = { MD: state.incDiv ? model : withIncDiv(true), MP: state.incDiv ? withIncDiv(false) : model };
  const ocr = MONTHS.filter(month => month.mode === 'ocr').length;
  document.getElementById('subtitle').textContent = `${MONTHS.length} estados de cuenta · ${ymLabel(YM[0])} a ${ymLabel(YM[YM.length - 1])}` + (ocr ? ` · ${ocr} leídos con OCR` : '') + (DATA.built ? ` · generado ${DATA.built.slice(0, 10)}` : '');
  document.getElementById('incDiv').checked = !!state.incDiv;
  setSeg('evoMode', state.evoMode);
  renderKPIs(); renderDataQuality(); renderInsights(); renderEvo(); renderGrowth(); renderYears(); renderComp(); renderSunburst(); renderTreemap();
  renderRank(); renderScatter(); renderHeat(); renderRisk(); renderDividends(); renderFlows(); renderDetail(); renderInflation(); renderRetirement(); renderFire(); renderTable();
}
function rerenderSafe() { try { renderAll(); } catch (err) { console.error(err); toast('Error: ' + err.message); } }

function fillSelects() {
  const opts = YM.map((ym, index) => `<option value="${index}">${ymLabel(ym)}</option>`).join('');
  const from = document.getElementById('from'), to = document.getElementById('to');
  from.innerHTML = opts; to.innerHTML = opts; from.value = state.from; to.value = state.to;
  const dimOpts = Object.entries(DIMS).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('');
  const dim = document.getElementById('dim'); dim.innerHTML = dimOpts; dim.value = state.dim;
  const s1 = document.getElementById('sb1'), s2 = document.getElementById('sb2');
  s1.innerHTML = dimOpts; s2.innerHTML = dimOpts; s1.value = state.sb1; s2.value = state.sb2;
}
function applyPreset(preset) {
  const last = MONTHS.length - 1;
  state.to = last;
  if (preset === 'all') state.from = 0;
  else if (preset === 'ytd') { const year = YM[last].slice(0, 4); const first = YM.findIndex(ym => ym.startsWith(year)); state.from = Math.max(0, first - 1); }   // incluye diciembre anterior como base
  else state.from = Math.max(0, last - (+preset));
  document.getElementById('from').value = state.from; document.getElementById('to').value = state.to;
  setSeg('presets', preset);
  rerenderSafe();
}
function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600); }
function applyTheme() {
  if (state.theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = state.theme;
  document.getElementById('theme').textContent = 'Tema: ' + ({ auto: 'auto', light: 'claro', dark: 'oscuro' })[state.theme];
}
function rebuildCharts() { Object.values(charts).forEach(chartInst => chartInst.dispose()); for (const id in charts) delete charts[id]; rerenderSafe(); }

function exportClassification() {
  const out = { instruments: {}, aliases: DATA.aliases || {} };
  Object.keys(P.instruments).forEach(tk => { const cls = clsOf(tk); out.instruments[tk] = { nombre: cls.nombre, tipo: cls.tipo, moneda: cls.moneda, clase: cls.clase, region: cls.region, riesgo: cls.riesgo, ...divCalOf(tk) }; });
  const blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'instruments.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('Descargado instruments.json: cópialo a private/instruments.json y corre `uv run gbm build`');
}

function bind() {
  const onRange = () => {
    let fromIdx = +document.getElementById('from').value, toIdx = +document.getElementById('to').value;
    if (fromIdx > toIdx) [fromIdx, toIdx] = [toIdx, fromIdx];
    if (toIdx - fromIdx < 2) { toIdx = Math.min(MONTHS.length - 1, fromIdx + 2); fromIdx = Math.max(0, toIdx - 2); }
    state.from = fromIdx; state.to = toIdx; document.getElementById('from').value = fromIdx; document.getElementById('to').value = toIdx;
    setSeg('presets', ''); rerenderSafe();
  };
  document.getElementById('from').onchange = onRange;
  document.getElementById('to').onchange = onRange;
  document.querySelectorAll('#presets button').forEach(element => element.onclick = () => applyPreset(element.dataset.period));
  document.getElementById('dim').onchange = event => { state.dim = event.target.value; LS.set('dim', state.dim); rerenderSafe(); };
  document.getElementById('incDiv').onchange = event => { state.incDiv = event.target.checked; LS.set('incDiv', state.incDiv); toast(state.incDiv ? 'Rendimientos = plusvalías + dividendos netos' : 'Rendimientos = sólo plusvalías'); rerenderSafe(); };
  const seg = (id, key, render, persist) => document.querySelectorAll(`#${id} button`).forEach(element => element.onclick = () => { state[key] = element.dataset.value; if (persist) LS.set(key, state[key]); render(); });
  seg('evoMode', 'evoMode', () => { setSeg('evoMode', state.evoMode); renderEvo(); });
  seg('evoGran', 'evoGran', renderEvo);
  seg('compMode', 'compMode', renderComp);
  seg('compBy', 'compBy', renderComp, true);
  seg('tmMetric', 'tmMetric', renderTreemap);
  seg('rankMetric', 'rankMetric', renderRank);
  seg('divGran', 'divGran', renderDividends);
  seg('divMetric', 'divMetric', renderDividends);
  seg('flowGran', 'flowGran', renderFlows);
  seg('flowBy', 'flowBy', renderFlows, true);
  seg('heatGran', 'heatGran', renderHeat, true);
  seg('calGran', 'calGran', renderDividends, true);
  seg('infMode', 'infMode', renderInflation);
  document.getElementById('sb1').onchange = event => { state.sbPath = []; state.sb1 = event.target.value; if (state.sb2 === state.sb1) { state.sb2 = Object.keys(DIMS).find(key => key !== state.sb1); document.getElementById('sb2').value = state.sb2; } renderSunburst(); };
  document.getElementById('sb2').onchange = event => { state.sbPath = []; state.sb2 = event.target.value; if (state.sb2 === state.sb1) { state.sb1 = Object.keys(DIMS).find(key => key !== state.sb2); document.getElementById('sb1').value = state.sb1; } renderSunburst(); };
  document.getElementById('detSel').onchange = event => { state.detail = event.target.value; renderDetail(); };
  const setExcl = list => { state.excl = list; LS.set('excl', state.excl); if (state.detail && state.excl.includes(state.detail)) state.detail = null; rerenderSafe(); };
  document.getElementById('tbl').addEventListener('click', event => {
    const xb = event.target.closest('[data-excl]'); if (xb) { setExcl([...state.excl, xb.dataset.excl]); toast(`${xb.dataset.excl} excluido de todos los cálculos`); return; }
    const th = event.target.closest('th'); if (!th || !th.dataset.col || th.dataset.col === 'x') return;
    const col = th.dataset.col; state.sort = { col, dir: state.sort.col === col ? -state.sort.dir : (COLS.find(item => item.key === col).left ? 1 : -1) }; renderTable();
  });
  document.getElementById('tbl').addEventListener('change', event => {
    const select = event.target; if (select.tagName !== 'SELECT') return;
    const key = select.dataset.key, dim = select.dataset.dim;
    state.ovr[key] = Object.assign({}, state.ovr[key], { [dim]: select.value }); LS.set('cls', state.ovr);
    toast(`${key}: ${DIMS[dim].label} → ${select.value}`); rerenderSafe();
  });
  document.getElementById('exclList').addEventListener('click', event => {
    const button = event.target.closest('[data-incl]'); if (!button) return;
    setExcl(state.excl.filter(key => key !== button.dataset.incl)); toast(`${button.dataset.incl} incluido de nuevo`);
  });
  document.getElementById('exportCls').onclick = exportClassification;
  document.getElementById('resetCls').onclick = () => { state.ovr = {}; LS.del('cls'); toast('Clasificación restablecida (la de private/instruments.json)'); rerenderSafe(); };
  document.getElementById('inpcLast').textContent = INPC_LAST ? `· INPC real hasta ${ymLabel(INPC_LAST)}` : '';
  document.getElementById('rfIn').onchange = event => { const value = parseFloat(event.target.value); if (!isFinite(value)) return; state.rf = value / 100; LS.set('rf', state.rf); rerenderSafe(); };
  const simSave = () => { LS.set('sim', state.sim); renderSim(profileSeries(model)); };
  document.getElementById('simPct').oninput = event => { state.sim.pct = +event.target.value; simSave(); };
  document.getElementById('simFrom').onchange = event => { state.sim.from = event.target.value; simSave(); };
  document.getElementById('simTo').onchange = event => { state.sim.to = event.target.value; simSave(); };
  document.getElementById('infIn').onchange = event => { const value = parseFloat(event.target.value); if (!isFinite(value)) return; state.inf = value / 100; LS.set('inf', state.inf); renderInflation(); renderRetirement(); renderFire(); };
  document.getElementById('tvBox').addEventListener('change', event => {
    const input = event.target.closest('input'); if (!input) return; const key = input.dataset.field;
    if (key === 'pastYm') state.tv.pastYm = input.value || undefined;
    else { const value = parseFloat(input.value); if (!isFinite(value)) return; state.tv[key] = key === 'rate' ? value / 100 : value; }
    LS.set('tv', state.tv); renderTimeValue();
  });
  const retBox = document.getElementById('retCfg');
  retBox.addEventListener('change', event => {
    const input = event.target.closest('input'); if (!input) return; const key = input.dataset.field;
    if (input.type === 'checkbox') state.ret[key] = input.checked;
    else { const value = parseFloat(input.value); if (!isFinite(value)) return; state.ret[key] = key === 'rate' ? value / 100 : value; }
    LS.set('ret', state.ret); renderRetirement(); renderFire();
  });
  retBox.addEventListener('click', event => {
    const button = event.target.closest('button[data-preset]'); if (!button) return;
    if (button.dataset.preset === '8') state.ret.rate = 0.08; else if (button.dataset.preset === 'twr') delete state.ret.rate; else state.ret = {};
    LS.set('ret', state.ret); renderRetirement();
  });
  const fireBox = document.getElementById('fireCfg');
  fireBox.addEventListener('change', event => {
    const input = event.target.closest('input'); if (!input) return; const key = input.dataset.field;
    const value = parseFloat(input.value); if (!isFinite(value)) return;
    state.fire[key] = ['swr', 'rate', 'vol'].includes(key) ? value / 100 : value;
    LS.set('fire', state.fire); renderFire();
  });
  fireBox.addEventListener('click', event => { if (event.target.closest('button[data-preset="reset"]')) { state.fire = {}; LS.del('fire'); renderFire(); } });
  document.getElementById('eye').onclick = () => { state.hideAmt = !state.hideAmt; LS.set('hideAmt', state.hideAmt); applyEye(); rerenderSafe(); };
  document.getElementById('theme').onclick = () => { state.theme = { auto: 'light', light: 'dark', dark: 'auto' }[state.theme]; LS.set('theme', state.theme); applyTheme(); rebuildCharts(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'auto') rebuildCharts(); });
  let resizeTimer; window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { Object.values(charts).forEach(chartInst => chartInst.resize()); if (model) renderSunburst(); }, 120); });
}

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';
function applyEye() {
  const el = document.getElementById('eye');
  el.innerHTML = (state.hideAmt ? EYE_OFF : EYE) + `<span>${state.hideAmt ? 'Mostrar montos' : 'Ocultar montos'}</span>`;
  el.setAttribute('aria-pressed', state.hideAmt); el.title = state.hideAmt ? 'Mostrar montos' : 'Ocultar montos (los % siguen visibles)';
}
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
function sectionsState() { return [...document.querySelectorAll('.wrap > section')].filter(element => !element.hidden); }
function setCollapsed(sec, on, save = true) {
  sec.classList.toggle('collapsed', on);
  sec.querySelector(':scope > h2').setAttribute('aria-expanded', String(!on));
  if (!on) requestAnimationFrame(() => { Object.values(charts).forEach(chartInst => { if (sec.contains(chartInst.getDom())) chartInst.resize(); }); if (model && sec.contains(document.getElementById('cSun'))) renderSunburst(); });
  if (save) LS.set('collapsed', [...document.querySelectorAll('.wrap > section.collapsed')].map(element => element.dataset.key));
  const anyOpen = sectionsState().some(section => !section.classList.contains('collapsed'));
  document.getElementById('collapseAll').textContent = anyOpen ? 'Colapsar todo' : 'Expandir todo';
}
function setupSections() {
  // Secciones marcadas con data-default-collapsed empiezan colapsadas hasta que el usuario elija otra cosa
  const defaults = [...document.querySelectorAll('.wrap > section[data-default-collapsed]')].map(sec => sec.id);
  const closed = new Set(LS.get('collapsed', defaults));
  document.querySelectorAll('.wrap > section').forEach(sec => {
    const heading = sec.querySelector(':scope > h2');
    const key = sec.id || heading.textContent.trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');
    sec.dataset.key = key;
    const body = document.createElement('div'); body.className = 'sec-body';
    while (heading.nextSibling) body.appendChild(heading.nextSibling);
    sec.appendChild(body);
    heading.insertAdjacentHTML('afterbegin', CHEV);
    heading.classList.add('collapsible'); heading.tabIndex = 0; heading.setAttribute('role', 'button');
    const toggle = () => setCollapsed(sec, !sec.classList.contains('collapsed'));
    heading.onclick = toggle;
    heading.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } };
    setCollapsed(sec, closed.has(key), false);
  });
  document.getElementById('collapseAll').onclick = () => {
    const secs = sectionsState(), anyOpen = secs.some(section => !section.classList.contains('collapsed'));
    secs.forEach(section => setCollapsed(section, anyOpen, false)); setCollapsed(secs[0], anyOpen);
  };
}


/* ============================== Navegación entre secciones ============================== */
function setupToc() {
  const secs = [...document.querySelectorAll('.wrap > section')];
  const label = sec => { const h2 = sec.querySelector(':scope > h2'); const text = [...h2.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim(); return text.split(':')[0].trim(); };
  const items = [{ id: 'top', text: 'Resumen' }, ...secs.map(sec => { if (!sec.id) sec.id = 'sec-' + sec.dataset.key; return { id: sec.id, text: label(sec) }; })];
  const html = items.map(item => `<a href="#${item.id}" data-target="${item.id}"><span class="lbl">${esc(item.text)}</span><span class="bar"></span></a>`).join('');
  const toc = document.getElementById('toc'), menu = document.getElementById('tocMenu'), btn = document.getElementById('tocBtn');
  toc.innerHTML = html;
  menu.innerHTML = items.map(item => `<a href="#${item.id}" data-target="${item.id}">${esc(item.text)}</a>`).join('');
  const go = event => {
    const link = event.target.closest('a[data-target]'); if (!link) return;
    event.preventDefault();
    const id = link.dataset.target;
    if (id === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else { const sec = document.getElementById(id); if (sec.classList.contains('collapsed')) setCollapsed(sec, false); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
  };
  toc.onclick = go; menu.onclick = go;
  btn.onclick = () => { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); };
  document.addEventListener('click', event => { if (!menu.hidden && !menu.contains(event.target) && event.target !== btn) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  // Sección actual: la última cuyo encabezado ya pasó el tercio superior de la pantalla
  const spy = () => {
    const line = window.innerHeight / 3;
    let current = 'top';
    secs.forEach(sec => { if (sec.getBoundingClientRect().top <= line) current = sec.id; });
    document.querySelectorAll('#toc a, #tocMenu a').forEach(link => link.classList.toggle('on', link.dataset.target === current));
  };
  let ticking = false;
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { spy(); ticking = false; }); } }, { passive: true });
  spy();
}

document.getElementById('demoBanner').hidden = !DATA.demo;
setupSections();
setupToc();
setupAiBox();
applyTheme();
applyEye();
bind();
fillSelects();
setSeg('presets', 'all');
if (MONTHS.length < 3) document.querySelector('.wrap').insertAdjacentHTML('afterbegin', '<div class="demo-banner">Se necesitan al menos 3 estados de cuenta para el análisis.</div>');
else rerenderSafe();
