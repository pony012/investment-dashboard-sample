/* ============================== Formatting ============================== */
const nfMoney = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const MASK = '$ •••';
const money = value => value == null || !isFinite(value) ? '—' : state.hideAmt ? MASK : nfMoney.format(value);
const moneyC = value => {
  if (value == null || !isFinite(value)) return '—';
  if (state.hideAmt) return MASK;
  const absValue = Math.abs(value), sign = value < 0 ? '−' : '';
  if (absValue >= 1e6) return sign + '$' + (absValue / 1e6).toFixed(absValue >= 1e7 ? 1 : 2) + ' M';
  if (absValue >= 1e3) return sign + '$' + Math.round(absValue / 1e3) + ' k';
  return sign + '$' + Math.round(absValue);
};
const pct = (value, decimals = 1, sign = false) => value == null || !isFinite(value) ? '—' : (sign && value > 0 ? '+' : '') + (value * 100).toFixed(decimals) + '%';
const cls = value => value == null ? '' : value >= 0 ? 'up' : 'down';
const esc = str => String(str).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
// Celda con valor crudo en data-raw para poder ordenar aunque el texto esté formateado u oculto
const td = (value, html, className = '') => `<td${className ? ` class="${className}"` : ''} data-raw="${value == null || (typeof value === 'number' && !isFinite(value)) ? '' : esc(value)}">${html}</td>`;
const thead = cols => '<thead><tr>' + cols.map(([label, left]) => `<th${left ? ' class="l"' : ''}>${label}</th>`).join('') + '</tr></thead>';
const TSORT = LS.get('tsort', {});
Object.values(TSORT).forEach(sortState => { if (sortState.i != null && sortState.colIdx == null) { sortState.colIdx = sortState.i; delete sortState.i; } });   // formato guardado anterior
function applyTableSort(table, colIdx, dir) {
  const tb = table.tBodies[0]; if (!tb) return;
  const val = row => { const cell = row.cells[colIdx]; if (!cell) return null; const value = cell.dataset.raw ?? cell.textContent.trim(); if (value === '' || value === '—') return null; const numeric = Number(value); return isNaN(numeric) ? value : numeric; };
  [...tb.rows].sort((left, right) => { const leftValue = val(left), rightValue = val(right); if (leftValue == null) return 1; if (rightValue == null) return -1;
    return (typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue), 'es')) * dir; }).forEach(row => tb.appendChild(row));
  [...table.tHead.rows[0].cells].forEach((th, index) => { th.dataset.sort = index === colIdx ? (dir > 0 ? 'asc' : 'desc') : ''; });
}
function sortable(id) {
  const el = document.getElementById(id); if (!el || !el.tHead) return;
  el.classList.add('sortable');
  const st = TSORT[id]; if (st) applyTableSort(el, st.colIdx, st.dir);
}
document.addEventListener('click', event => {
  const th = event.target.closest('table.sortable thead th'); if (!th) return;
  const table = th.closest('table'), colIdx = th.cellIndex, cur = TSORT[table.id];
  const dir = cur && cur.colIdx === colIdx ? -cur.dir : (th.classList.contains('l') ? 1 : -1);
  TSORT[table.id] = { colIdx, dir }; LS.set('tsort', TSORT); applyTableSort(table, colIdx, dir);
});

/* ============================== Theme / chart helpers ============================== */
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
let TK = {};
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const cssVar = varName => cs.getPropertyValue(varName).trim();
  TK = {
    surface: cssVar('--surface'), surface2: cssVar('--surface-2'), ink: cssVar('--ink'), ink2: cssVar('--ink2'), muted: cssVar('--muted'), grid: cssVar('--grid'), axis: cssVar('--axis'),
    border: cssVar('--border-solid'), pos: cssVar('--pos'), neg: cssVar('--neg'), other: cssVar('--other'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map(slot => cssVar('--s' + slot)),
    div: ['--div-neg2', '--div-neg1', '--div-mid', '--div-pos1', '--div-pos2'].map(cssVar),
  };
}
function colorFor(dim, value) {
  const slot = DIMS[dim].values.indexOf(value);
  return slot >= 0 && slot < 8 ? TK.series[slot] : TK.other;
}
function hex2rgb(hex) { hex = hex.replace('#', ''); if (hex.length === 3) hex = hex.split('').map(char => char + char).join(''); return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)); }
function mix(c1, c2, ratio) { const rgbA = hex2rgb(c1), rgbB = hex2rgb(c2); return '#' + rgbA.map((channel, index) => Math.round(channel + (rgbB[index] - channel) * ratio).toString(16).padStart(2, '0')).join(''); }
const DIV_MAX = 0.08;
function divColor(value, max = DIV_MAX) {
  if (value == null || !isFinite(value)) return TK.surface2;
  const position = Math.max(-1, Math.min(1, value / max));
  const st = TK.div; // neg2, neg1, mid, pos1, pos2
  if (position < 0) return position < -0.5 ? mix(st[1], st[0], (-position - 0.5) * 2) : mix(st[2], st[1], -position * 2);
  return position > 0.5 ? mix(st[3], st[4], (position - 0.5) * 2) : mix(st[2], st[3], position * 2);
}
function inkOn(bg) { const [red, green, blue] = hex2rgb(bg); const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255; return luminance > 0.6 ? '#0b0b0b' : '#ffffff'; }
function rampLegend(el, max, label) {
  el.innerHTML = `<span>${label ? label + ' ' : ''}−${(max * 100).toFixed(0)}%</span><span class="bar" style="background:linear-gradient(90deg,${TK.div.join(',')})"></span><span>+${(max * 100).toFixed(0)}%</span>`;
}

const charts = {};
function chart(id) {
  const el = document.getElementById(id);
  let chartInst = charts[id];
  if (chartInst && chartInst.getDom() !== el) { chartInst.dispose(); chartInst = null; }
  if (!chartInst) {
    chartInst = echarts.init(el, null, { renderer: 'canvas' }); charts[id] = chartInst;
    // Lo que señala el mouse se resalta en negritas dentro del tooltip
    const isAxis = () => { const tooltipOpt = chartInst.getOption().tooltip; return tooltipOpt && tooltipOpt[0] && tooltipOpt[0].trigger === 'axis'; };
    const setHov = (event, on) => {
      const seriesName = on ? (event.seriesName || null) : null, itemName = on && !isAxis() ? (event.name || null) : null;
      if (HOV.series === seriesName && HOV.name === itemName) return;
      HOV.series = seriesName; HOV.name = itemName;
      if (event.event) { chartInst.dispatchAction({ type: 'hideTip' }); chartInst.dispatchAction({ type: 'showTip', x: event.event.offsetX, y: event.event.offsetY }); }
    };
    chartInst.on('mouseover', event => setHov(event, true));
    chartInst.on('mouseout', event => setHov(event, false));
    chartInst.on('globalout', () => { HOV.series = HOV.name = null; });
  }
  return chartInst;
}
const HOV = { series: null, name: null };
function isHov(name, head) {
  if (name == null) return false;
  const text = String(name);
  return [HOV.series, HOV.name].some(hovered => hovered && (hovered === text || hovered.startsWith(text) || text.startsWith(hovered) || (head && text.endsWith(hovered))));
}
function base(extra = {}) {
  if (Array.isArray(extra.series)) extra.series.forEach(seriesItem => { if (seriesItem.type === 'line') seriesItem.triggerLineEvent = true; });   // eventos al pasar sobre línea/área
  return Object.assign({
    animationDuration: 350,
    textStyle: { fontFamily: FONT, color: TK.ink2 },
    tooltip: {
      confine: true, backgroundColor: TK.surface, borderColor: TK.border, borderWidth: 1, padding: [8, 10],
      textStyle: { color: TK.ink, fontSize: 12, fontFamily: FONT },
      extraCssText: 'box-shadow:0 6px 20px rgba(0,0,0,.14);border-radius:8px;',
    },
  }, extra);
}
const legTop = top => window.innerWidth < 600 ? top + 24 : top;   // la leyenda ocupa dos renglones en pantallas angostas
const legend = (extra = {}) => Object.assign({ top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: { color: TK.ink2, fontSize: 12 } }, extra);
const catAxis = (data, extra = {}) => Object.assign({ type: 'category', data, axisLine: { lineStyle: { color: TK.axis } }, axisTick: { show: false }, axisLabel: { color: TK.muted, fontSize: 11, hideOverlap: true } }, extra);
const valAxis = (fmt, extra = {}) => Object.assign({ type: 'value', splitLine: { lineStyle: { color: TK.grid } }, axisLine: { show: false }, axisLabel: { color: TK.muted, fontSize: 11, formatter: fmt } }, extra);
const sw = color => `<span class="dot" style="background:${color}"></span>`;
const ttRow = (color, name, value) => { const on = isHov(name);
  return `<div style="display:flex;justify-content:space-between;gap:16px;${on ? `font-weight:700;color:${TK.ink}` : ''}"><span>${color ? sw(color) : ''}${esc(name)}</span><span style="font-weight:${on ? 700 : 500};font-variant-numeric:tabular-nums">${value}</span></div>`; };
const ttHead = text => { const on = isHov(text, true);
  return `<div style="color:${on ? TK.ink : TK.ink2};${on ? 'font-weight:700;' : ''}margin-bottom:4px">${esc(text)}</div>`; };

function htmlLegend(elId, chartId, items) {
  const el = document.getElementById(elId);
  el.innerHTML = items.map(item => `<button class="chip" data-name="${esc(item.name)}">${sw(item.color)}${esc(item.name)}</button>`).join('');
  el.onclick = event => { const chip = event.target.closest('.chip'); if (!chip) return; charts[chartId].dispatchAction({ type: 'legendToggleSelect', name: chip.dataset.name }); chip.classList.toggle('off'); };
}
const hiddenLegend = () => ({ show: false });
// Etiquetas del sunburst: cada una se orienta (tangencial o radial) según el espacio real de su segmento,
// se recorta con "…" si no cabe y se oculta si el segmento es demasiado chico (el tooltip sigue disponible).
const _mctx = document.createElement('canvas').getContext('2d');
function textWidth(text, size, weight) { _mctx.font = `${weight} ${size}px ${FONT}`; return _mctx.measureText(text).width; }
function fitArcLabel(text, ang, R0, R1, size, weight, color) {
  const pad = 8, lh = size + 4;
  const thick = R1 - R0 - pad, arc = ang * (R0 + R1) / 2 - pad;
  const width = textWidth(text, size, weight);
  let rot, avail;
  if (width <= arc && lh <= thick) { rot = 'tangential'; avail = arc; }
  else if (width <= thick && lh <= arc) { rot = 'radial'; avail = thick; }
  else {
    const opts = [['tangential', arc, thick], ['radial', thick, arc]].filter(option => option[2] >= lh).sort((left, right) => right[1] - left[1]);
    if (!opts.length || opts[0][1] < size * 2.6) return { show: false };
    [rot, avail] = opts[0];
  }
  return { show: true, rotate: rot, width: Math.floor(avail), overflow: 'truncate', ellipsis: '…', fontSize: size, fontWeight: weight, color, formatter: () => text };
}
