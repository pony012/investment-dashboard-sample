/* ============================== Animación en el tiempo ==============================
 * Las gráficas sin eje de tiempo (sunburst, mapa, ranking, riesgo vs. rendimiento, dividendos por instrumento y
 * frontera eficiente) tienen un reproductor: ▶ y una barra para ver cómo se veían si el periodo hubiera terminado en
 * cada mes. Cada cuadro es el mismo render con un modelo recalculado hasta ese mes (acumulado desde "Desde", o los
 * últimos 12 meses) y se dibuja con merge para que ECharts anime la transición entre meses.
 */
const PLAY_MS = 550;
const TP_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>';
const TP_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z" fill="currentColor"/></svg>';
const PLAYERS = {};
const frameCache = new Map();
let frameCacheOf = null;

function frameRange(player) {
  const lo = Math.min(state.from + player.min, state.to);
  return { lo, hi: state.to };
}
function frameFrom(player, monthIdx) { return player.win === '12' ? Math.max(state.from, monthIdx - 11)   /* 12 meses con rendimiento: el primero del rango es la base */ : state.from; }
let liveModel = null;   // el modelo del periodo completo mientras `model` apunta a un cuadro
function modelAt(player, monthIdx) {
  const live = FRAME != null ? liveModel : model;
  if (frameCacheOf !== live) { frameCache.clear(); frameCacheOf = live; }   // el modelo se reconstruye en cada renderAll
  const from = frameFrom(player, monthIdx), key = `${from}-${monthIdx}`;
  if (!frameCache.has(key)) {
    const keep = { from: state.from, to: state.to };
    state.from = from; state.to = monthIdx;
    try { frameCache.set(key, buildModel()); } finally { Object.assign(state, keep); }
  }
  return frameCache.get(key);
}

// Ejes fijos durante la animación: la unión de lo que mide `measure` en todos los meses del reproductor, para que
// los ejes no se reescalen en cada cuadro. measure(modelo) → { x: [min, max], y: [min, max] } o null.
function frameExtent(id, measure, { pad = 0.08, step = 0 } = {}) {
  const player = PLAYERS[id], { lo, hi } = frameRange(player);
  const key = `ext-${id}-${lo}-${hi}-${frameFrom(player, lo)}-${player.win}-${step}`;
  modelAt(player, hi);   // asegura que el caché sea del modelo vigente
  if (!frameCache.has(key)) {
    let ext = null;
    for (let monthIdx = lo; monthIdx <= hi; monthIdx++) {
      const box = measure(modelAt(player, monthIdx)); if (!box) continue;
      ext = ext ? { x: [Math.min(ext.x[0], box.x[0]), Math.max(ext.x[1], box.x[1])], y: [Math.min(ext.y[0], box.y[0]), Math.max(ext.y[1], box.y[1])] } : box;
    }
    if (ext) ['x', 'y'].forEach(axis => { const span = (ext[axis][1] - ext[axis][0]) || Math.abs(ext[axis][0]) || 0.01; ext[axis] = [ext[axis][0] - span * pad, ext[axis][1] + span * pad]; if (step) ext[axis] = [Math.floor(ext[axis][0] / step) * step, Math.ceil(ext[axis][1] / step) * step]; });   // step: límites redondos para que las etiquetas no se encimen
    frameCache.set(key, ext);
  }
  return frameCache.get(key);
}

// Dibuja `render` con el modelo del mes `monthIdx`; setOption hace merge (no reemplazo) para que se anime
function withFrame(player, monthIdx, render) {
  const keepModel = model, chartInst = chart(player.id), setOption = chartInst.setOption;
  chartInst.setOption = (option) => setOption.call(chartInst, Object.assign(option, { animationDurationUpdate: PLAY_MS - 100, animationEasingUpdate: 'cubicInOut' }), { replaceMerge: ['graphic'] });   // merge para animar; graphic se reemplaza (botón central del sunburst)
  const frameModel = modelAt(player, monthIdx);
  liveModel = keepModel; FRAME = monthIdx; model = frameModel;
  try { render(); } finally { model = keepModel; FRAME = null; liveModel = null; chartInst.setOption = setOption; }
}

// Reemplaza la función global de render: si su reproductor está en un mes anterior, dibuja ese mes
function timed(id, min, render) {
  const player = PLAYERS[id] = { id, min, render, frame: null, win: 'cum', timer: null };
  return function (...args) {
    if (player.frame == null || FRAME != null) return render(...args);
    const { lo, hi } = frameRange(player);
    if (player.frame >= hi) { player.frame = null; syncPlayer(player); return render(...args); }
    player.frame = Math.max(player.frame, lo);
    syncPlayer(player);
    withFrame(player, player.frame, () => render());   // sin args: renderFrontier(pM) recibe los perfiles del periodo completo
  };
}
renderSunburst = timed('cSun', 0, renderSunburst);
renderTreemap = timed('cTree', 1, renderTreemap);
renderRank = timed('cRank', 1, renderRank);
renderScatter = timed('cScatter', 3, renderScatter);
renderDivTk = timed('cDivTk', 1, renderDivTk);
renderFrontier = timed('cFrontier', 6, renderFrontier);
renderSwr = timed('cSwr', 6, renderSwr);
const PLAY_RENDER = { cSun: () => renderSunburst(), cTree: () => renderTreemap(), cRank: () => renderRank(), cScatter: () => renderScatter(), cDivTk: () => renderDivTk(), cFrontier: () => renderFrontier(), cSwr: () => renderSwr() };

function stopPlayer(player) { clearInterval(player.timer); player.timer = null; syncPlayer(player); }
function goFrame(player, monthIdx) {
  const { hi } = frameRange(player);
  player.frame = monthIdx >= hi ? null : monthIdx;
  PLAY_RENDER[player.id]();
  syncPlayer(player);
}
function togglePlay(player) {
  if (player.timer) { stopPlayer(player); return; }
  const { lo, hi } = frameRange(player);
  if (lo >= hi) { toast(L('El periodo seleccionado es muy corto para animarlo', 'The selected period is too short to animate')); return; }
  goFrame(player, player.frame == null ? lo : player.frame);   // al terminar vuelve a empezar desde el inicio
  player.timer = setInterval(() => {
    const next = (player.frame ?? hi) + 1;
    goFrame(player, next);
    if (next >= hi) stopPlayer(player);
  }, PLAY_MS);
  syncPlayer(player);
}

function syncPlayer(player) {
  const el = player.el; if (!el) return;
  const { lo, hi } = frameRange(player), at = player.frame ?? hi;
  const slider = el.querySelector('input[type=range]');
  slider.min = lo; slider.max = hi; slider.value = at; slider.disabled = lo >= hi;
  el.querySelector('.tp-play').innerHTML = player.timer ? TP_PAUSE : TP_PLAY;
  el.querySelector('.tp-play').title = player.timer ? L('Pausar', 'Pause') : L('Reproducir mes a mes', 'Play month by month');
  el.querySelector('.tp-label').textContent = `${ymLabel(YM[frameFrom(player, at)])} → ${ymLabel(YM[at])}`;
  el.querySelector('.tp-live').style.visibility = player.frame == null ? 'hidden' : '';   // visibility (no hidden): no cambia el ancho de la barra
  el.classList.toggle('past', player.frame != null);
}

function setupTimePlayers() {
  Object.values(PLAYERS).forEach(player => {
    const anchor = player.id === 'cFrontier' ? document.getElementById('effKpis') : document.getElementById(player.id);
    const el = document.createElement('div');
    el.className = 'timeplay';
    el.innerHTML = `<button class="tp-play" type="button"></button>
      <input type="range" step="1" aria-label="${L('Mes', 'Month')}">
      <span class="tp-label"></span>
      <select class="tp-win" title="${L('Ventana de cada cuadro', 'Window for each frame')}"><option value="cum">${L('Acumulado', 'Cumulative')}</option><option value="12">${L('Últimos 12 m', 'Last 12 m')}</option></select>
      <button class="tp-live" type="button">↺ ${L('Periodo completo', 'Full period')}</button>`;
    anchor.parentNode.insertBefore(el, anchor);
    player.el = el;
    el.querySelector('.tp-play').onclick = () => togglePlay(player);
    el.querySelector('input[type=range]').oninput = event => { if (player.timer) stopPlayer(player); goFrame(player, +event.target.value); };
    el.querySelector('.tp-win').onchange = event => { player.win = event.target.value; if (player.frame != null) PLAY_RENDER[player.id](); syncPlayer(player); };
    el.querySelector('.tp-live').onclick = () => { stopPlayer(player); goFrame(player, Infinity); };
    syncPlayer(player);
  });
}
// Al cambiar el periodo (Desde/Hasta) los reproductores se ajustan al nuevo rango
function syncTimePlayers() { Object.values(PLAYERS).forEach(syncPlayer); }
