/* ============================== Datos ============================== */
const P = DATA.portfolio;
const MONTHS = P.months;
const YM = MONTHS.map(month => month.ym);
const INPC = DATA.inpc || {};
const CASH = 'EFECTIVO';
const isNum = value => typeof value === 'number' && isFinite(value);

/* ============================== Clasificación ============================== */
const DIMS = {
  tipo:   { label: L('Tipo', 'Type'), values: ['ETF', 'Acción individual', 'FIBRA', 'Fondo de inversión', 'Deuda / bonos', 'Efectivo y reporto', 'Otro'] },
  clase:  { label: L('Clase de activo', 'Asset class'), values: ['Renta variable', 'Renta fija', 'Bienes raíces', 'Alternativos', 'Efectivo'] },
  region: { label: L('Región', 'Region'), values: ['EE.UU.', 'México', 'Internacional desarrollado', 'Mercados emergentes', 'Global'] },
  riesgo: { label: L('Riesgo', 'Risk'), values: ['Conservador', 'Moderado', 'Agresivo'] },
  moneda: { label: L('Moneda', 'Currency'), values: ['MXN', 'USD'] },
};
const CASH_CLS = { nombre: 'Efectivo y reporto', tipo: 'Efectivo y reporto', clase: 'Efectivo', region: 'México', riesgo: 'Conservador', moneda: 'MXN' };

/* ============================== Estado ============================== */
const LS_PREFIX = DATA.demo ? 'gbmdemo.' : 'gbmdash.';
const LS = {
  get(key, fallback) { try { const raw = localStorage.getItem(LS_PREFIX + key); return raw ? JSON.parse(raw) : fallback; } catch (err) { return fallback; } },
  set(key, value) { try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (err) {} },
  del(key) { try { localStorage.removeItem(LS_PREFIX + key); } catch (err) {} },
};
const state = {
  from: 0, to: MONTHS.length - 1, dim: LS.get('dim', 'tipo'), incDiv: LS.get('incDiv', true),
  evoMode: 'valor', evoGran: 'm', compMode: 'pct', compBy: LS.get('compBy', 'grupo'), sb1: 'clase', sb2: 'tipo', sbPath: [], tmMetric: 'ann', rankMetric: 'ann',
  divGran: 'q', divMetric: 'yield', flowGran: 'q', flowBy: LS.get('flowBy', 'grupo'), heatGran: LS.get('heatGran', 'q'), calGran: LS.get('calGran', 'q'), detail: null, hideAmt: LS.get('hideAmt', false), theme: LS.get('theme', 'auto'),
  rf: LS.get('rf', 0.07), inf: LS.get('inf', 0.04), infMode: 'nom', sim: LS.get('sim', { from: 'Conservador', to: 'Moderado', pct: 10 }),
  ret: LS.get('ret', {}), fire: LS.get('fire', {}), tv: LS.get('tv', {}), excl: LS.get('excl', []), sort: { col: 'valor', dir: -1 }, ovr: LS.get('cls', {}), divCal: LS.get('divcal', {}), hideOut: LS.get('hideOut', true), outOvr: LS.get('outOvr', {}),
};
let model = null;
let FRAME = null;   // mes que se está dibujando en una animación en el tiempo (timeplay.js); null = periodo completo

function clsOf(tk) {
  if (tk === CASH) return { ...CASH_CLS };
  const base = DATA.cls[tk] || { nombre: tk, tipo: 'Otro', clase: 'Renta variable', region: 'México', riesgo: 'Moderado', moneda: 'MXN' };
  return { ...base, ...(state.ovr[tk] || {}) };
}
const nameOf = tk => tk === CASH ? valueLabel(CASH_CLS.nombre) : tk === 'EFEC' ? L('ISR / cargos sin emisora', 'ISR / charges with no issuer') : tk;

/* ============================== Utilidades de periodos ============================== */
const MES = EN ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ymLabel = ym => `${MES[+ym.slice(5) - 1]} ${ym.slice(2, 4)}`;
const ymQuarter = ym => `${ym.slice(2, 4)}${L('T', 'Q')}${Math.ceil(+ym.slice(5) / 3)}`;
const bucketOf = (ym, gran) => gran === 'm' ? ym : gran === 'q' ? ymQuarter(ym) : ym.slice(0, 4);
const bucketLabel = (key, gran) => gran === 'm' ? ymLabel(key) : key;
const ymDiff = (fromYm, toYm) => (+toYm.slice(0, 4) - +fromYm.slice(0, 4)) * 12 + (+toYm.slice(5) - +fromYm.slice(5));
const addMonths = (ym, delta) => { let [year, month] = ym.split('-').map(Number); month += delta; while (month > 12) { month -= 12; year++; } while (month < 1) { month += 12; year--; } return `${year}-${String(month).padStart(2, '0')}`; };
const std = values => { if (values.length < 2) return null; const mean = values.reduce((sum, value) => sum + value, 0) / values.length; return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)); };
const annualize = (cum, months) => months > 0 ? Math.pow(1 + cum, 12 / months) - 1 : null;
// Buckets (mes / trimestre / año) de un rango de índices de meses
function buckets(idxs, gran) {
  const out = [], pos = {};
  idxs.forEach(monthIdx => { const key = bucketOf(YM[monthIdx], gran); if (!(key in pos)) { pos[key] = out.length; out.push({ key, idx: [] }); } out[pos[key]].idx.push(monthIdx); });
  return out;
}

/* ============================== Modelo ============================== */
const DIST_CATS = ['div', 'fibra', 'roc', 'frac'];
const OUTLIER_MONTHS = 6, OUTLIER_ANN = 0.5;
const CAT_INFO = { div: L('Dividendos (ETFs y acciones)', 'Dividends (ETFs and stocks)'), fibra: L('Resultado fiscal FIBRAs', 'FIBRA taxable result'), roc: L('Reembolso de capital FIBRAs', 'FIBRA return of capital'), frac: L('Pago de fracciones', 'Fractional payments'), isr: L('ISR retenido', 'ISR withheld') };
const distNetOf = flow => DIST_CATS.reduce((sum, cat) => sum + (flow[cat] || 0), 0) + (flow.isr || 0);

// Capital promedio del mes (Modified Dietz con flujos a mitad de mes). En el mes de apertura se asume que
// el dinero estuvo todo el mes (supuesto conservador).
function dietzDen(rec) {
  if (!rec || (rec.ini <= 0 && rec.ing <= 0 && rec.fin <= 0)) return 0;
  if (rec.ini <= 0) return Math.max(rec.ing, rec.fin, 0);
  return Math.max(rec.ini + rec.ing / 2, 0.5 * Math.max(rec.ini, rec.fin), 0);
}
const monthReturn = rec => { const den = dietzDen(rec); return den > 0 ? rec.gen / den : null; };

/*
 * Por mes y por instrumento: ini (valor al cierre del mes anterior), fin, ing (flujo neto hacia el instrumento) y gen = fin − ini − ing.
 *   ing = compras − ventas − efectivo de eventos corporativos + traspasos de títulos
 *         − distribuciones netas      (si se incluyen dividendos: el dividendo es rendimiento del instrumento que lo pagó)
 *         + dividendos en especie     (si no se incluyen: los títulos recibidos se tratan como aportación)
 * El flujo externo del portafolio es depósitos − retiros (+ traspasos de títulos; + distribuciones netas si no se cuentan como rendimiento).
 * "Efectivo y reporto" recibe el resto, así que la suma de flujos siempre cuadra con el flujo externo; su "rendimiento"
 * es el premio del reporto menos comisiones administrativas e ISR sin emisora.
 */
function buildModel() {
  const ex = new Set(state.excl);
  const tks = [...Object.keys(P.instruments), CASH];
  const n = MONTHS.length;
  const rec = {}; tks.forEach(tk => { rec[tk] = new Array(n).fill(null); });
  const V = new Array(n).fill(0), F = new Array(n).fill(0), G = new Array(n).fill(null), R = new Array(n).fill(null);
  const valOf = (tk, monthIdx) => monthIdx < 0 ? 0 : tk === CASH ? MONTHS[monthIdx].cash : (MONTHS[monthIdx].hold[tk] ? MONTHS[monthIdx].hold[tk][1] : 0);
  for (let monthIdx = 0; monthIdx < n; monthIdx++) {
    const month = MONTHS[monthIdx];
    let ingSum = 0, extFlow = (month.ext.dep || 0) - (month.ext.wd || 0), exIng = 0;
    Object.entries(month.flows).forEach(([tk, flow]) => {
      extFlow += flow.transfer || 0;
      if (!state.incDiv && !ex.has(tk)) extFlow += distNetOf(flow) + (tk === 'EFEC' ? 0 : flow.especie || 0);
    });
    tks.forEach(tk => {
      if (tk === CASH) return;
      const flow = month.flows[tk] || {};
      const ini = valOf(tk, monthIdx - 1), fin = valOf(tk, monthIdx);
      let ing = (flow.buy || 0) - (flow.sell || 0) - (flow.corp || 0) + (flow.transfer || 0);
      ing += state.incDiv ? -distNetOf(flow) : (flow.especie || 0);
      if (!ini && !fin && !ing && !distNetOf(flow)) return;
      const entry = { ini, fin, ing, gen: fin - ini - ing, dist: distNetOf(flow), buy: flow.buy || 0, sell: (flow.sell || 0) + (flow.corp || 0) };
      if (monthIdx === 0) { entry.ing = fin; entry.ini = 0; entry.gen = 0; entry.base = true; }   // apertura: se toma como aportación
      if (ex.has(tk)) { exIng += entry.ing; return; }
      rec[tk][monthIdx] = entry; ingSum += entry.ing;
    });
    // Excluidos: su valor sale del portafolio y sus flujos cuentan como externos
    V[monthIdx] = tks.reduce((sum, tk) => sum + (ex.has(tk) ? 0 : valOf(tk, monthIdx)), 0);
    if (monthIdx === 0) { F[0] = V[0]; rec[CASH][0] = { ini: 0, fin: month.cash, ing: month.cash, gen: 0, base: true }; continue; }
    F[monthIdx] = extFlow - exIng;
    const cashIng = F[monthIdx] - ingSum;
    rec[CASH][monthIdx] = { ini: valOf(CASH, monthIdx - 1), fin: month.cash, ing: cashIng, gen: month.cash - valOf(CASH, monthIdx - 1) - cashIng, dist: 0, buy: 0, sell: 0 };
    G[monthIdx] = V[monthIdx] - V[monthIdx - 1] - F[monthIdx];
    const den = V[monthIdx - 1] + F[monthIdx] / 2;
    R[monthIdx] = den > 0 ? G[monthIdx] / den : null;
  }

  const rangeStart = state.from, rangeEnd = state.to;
  const idx = []; for (let monthIdx = rangeStart; monthIdx <= rangeEnd; monthIdx++) idx.push(monthIdx);
  const retIdx = idx.filter(monthIdx => monthIdx > 0);          // meses con rendimiento (el primero es la apertura)

  // Estadísticas por instrumento
  const insts = tks.filter(tk => !ex.has(tk) && rec[tk].some(Boolean)).map(tk => {
    const cls = clsOf(tk), info = P.instruments[tk] || {};
    let cum = 1, nm = 0, gain = 0, buys = 0, sells = 0, dist = 0, wsum = 0, lastR = null, best = null, worst = null;
    const rs = [];
    retIdx.forEach(monthIdx => {
      const entry = rec[tk][monthIdx];
      if (V[monthIdx] > 0) wsum += valOf(tk, monthIdx) / V[monthIdx];
      if (!entry) return;
      gain += entry.gen; buys += entry.buy || 0; sells += entry.sell || 0; dist += entry.dist || 0;
      const ret = monthReturn(entry);
      if (ret == null) return;
      cum *= 1 + ret; nm++; lastR = ret; rs.push({ ret, monthIdx });
      if (!best || ret > best.ret) best = { ret, monthIdx }; if (!worst || ret < worst.ret) worst = { ret, monthIdx };
    });
    const vEnd = valOf(tk, rangeEnd);
    return { key: tk, tk, cls, name: tk === CASH ? valueLabel(CASH_CLS.nombre) : (cls.nombre || tk), serie: info.serie || '', section: info.section || 'efectivo', first: info.first, last: info.last, isCash: tk === CASH,
      st: { cum: nm ? cum - 1 : null, ann: nm ? annualize(cum - 1, nm) : null, nm, gain, buys, sells, net: buys - sells, dist, lastR, best, worst,
        vol: rs.length >= 3 ? std(rs.map(item => item.ret)) * Math.sqrt(12) : null, wAvg: retIdx.length ? wsum / retIdx.length : 0, vEnd,
        wEnd: V[rangeEnd] > 0 ? vEnd / V[rangeEnd] : 0, tit: tk === CASH ? null : (MONTHS[rangeEnd].hold[tk] || [0])[0], rs, risk: seriesStats(rs.map(item => item.ret)) },
      active: vEnd !== 0 };
  });
  const ranked = insts.filter(it => !it.isCash);
  // Atípicos: se ocultan de las vistas por instrumento (ranking, riesgo vs. rendimiento, mapa de calor, insights)
  // pero siguen contando en los totales del portafolio. Automático: menos de OUTLIER_MONTHS meses con un anualizado
  // extremo (el anualizado de pocos meses no significa nada); el usuario puede marcar o desmarcar cualquiera.
  ranked.forEach(it => {
    const auto = it.st.nm > 0 && it.st.nm < OUTLIER_MONTHS && it.st.ann != null && Math.abs(it.st.ann) > OUTLIER_ANN;
    const manual = state.outOvr[it.tk];
    it.outlier = manual != null ? manual : auto;
    it.outlierWhy = manual === true ? L('marcado por ti', 'marked by you') : manual === false ? null : auto ? L(`${it.st.nm} ${it.st.nm === 1 ? 'mes' : 'meses'} con ${pct(it.st.ann, 0, true)} anualizado`, `${it.st.nm} ${it.st.nm === 1 ? 'month' : 'months'} at ${pct(it.st.ann, 0, true)} annualized`) : null;
  });
  const shown = ranked.filter(it => !(state.hideOut && it.outlier));
  const totalGain = ranked.reduce((sum, it) => sum + it.st.gain, 0);
  insts.forEach(it => { it.st.gainShare = !it.isCash && totalGain ? it.st.gain / totalGain : null; it.st.eff = it.st.wAvg > 0.001 && it.st.gainShare != null ? it.st.gainShare / it.st.wAvg : null; });

  const groupBy = dim => {
    const vals = [...DIMS[dim].values];
    insts.forEach(it => { const value = it.cls[dim]; if (value && !vals.includes(value)) vals.push(value); });
    return vals.map(dimValue => {
      const members = insts.filter(it => it.cls[dim] === dimValue);
      const value = YM.map((ym, monthIdx) => members.reduce((sum, it) => sum + valOf(it.tk, monthIdx), 0));
      const flow = YM.map((ym, monthIdx) => members.reduce((sum, it) => sum + (rec[it.tk][monthIdx] ? rec[it.tk][monthIdx].buy - rec[it.tk][monthIdx].sell : 0), 0));
      const ret = YM.map((ym, monthIdx) => { if (!monthIdx) return null; let gen = 0, den = 0;
        members.forEach(it => { if (it.isCash) return; const entry = rec[it.tk][monthIdx]; const capital = dietzDen(entry); if (capital > 0) { gen += entry.gen; den += capital; } });
        return den > 0 ? gen / den : null; });
      return { key: dimValue, name: valueLabel(dimValue), members, value, flow, ret };
    }).filter(group => group.members.length);
  };

  return { n, tks, rec, V, F, G, R, valOf, rangeStart, rangeEnd, idx, retIdx, insts, ranked, shown, totalGain, groupBy, gbm: buildDividends(idx, ex) };
}

// Estadísticas de una serie de rendimientos mensuales en orden cronológico
function seriesStats(rets) {
  const valid = rets.filter(isNum); if (valid.length < 2) return null;
  let cum = 1, peak = 1, mdd = 0, worst = Infinity, neg = 0;
  valid.forEach(ret => { cum *= 1 + ret; peak = Math.max(peak, cum); mdd = Math.min(mdd, cum / peak - 1); worst = Math.min(worst, ret); if (ret < 0) neg++; });
  const ann = annualize(cum - 1, valid.length), vol = valid.length >= 3 ? std(valid) * Math.sqrt(12) : null;
  return { ann, vol, mdd, worst, negPct: neg / valid.length, count: valid.length, sharpe: vol ? (ann - state.rf) / vol : null, cum: cum - 1 };
}

/* ============================== Dividendos e impuestos ============================== */
function buildDividends(idx, ex) {
  const n = MONTHS.length, zeros = () => new Array(n).fill(0);
  const byCat = { div: zeros(), fibra: zeros(), roc: zeros(), frac: zeros(), isr: zeros() };
  const com = zeros(), intr = zeros();
  const inR = new Array(n).fill(false); idx.forEach(monthIdx => { inR[monthIdx] = true; });
  const tks = {};
  const statFor = tk => tks[tk] || (tks[tk] = { tk, gross: 0, isr: 0, esp: 0, cats: { div: 0, fibra: 0, roc: 0, frac: 0 }, pays: new Set(), byM: zeros() });
  MONTHS.forEach((month, monthIdx) => {
    com[monthIdx] = (month.fees || 0) - (month.trade_fees || 0); intr[monthIdx] = month.interest || 0;
    Object.entries(month.flows).forEach(([tk, flow]) => {
      if (ex.has(tk)) return;
      [...DIST_CATS, 'isr'].forEach(cat => {
        const amt = flow[cat]; if (!amt) return;
        byCat[cat][monthIdx] += amt;
        if (!inR[monthIdx]) return;
        const stat = statFor(tk);
        if (cat === 'isr') stat.isr += amt; else { stat.gross += amt; stat.cats[cat] += amt; if (amt > 0) stat.pays.add(month.ym); }
        stat.byM[monthIdx] += amt;
      });
      if (flow.especie && inR[monthIdx]) statFor(tk).esp += flow.especie;
    });
  });
  const rv = MONTHS.map(month => Object.entries(month.hold).reduce((sum, [tk, holding]) => sum + (ex.has(tk) ? 0 : holding[1]), 0));
  const gross = MONTHS.map((month, monthIdx) => DIST_CATS.reduce((sum, cat) => sum + byCat[cat][monthIdx], 0));
  const net = gross.map((grossValue, monthIdx) => grossValue + byCat.isr[monthIdx]);
  const ttm = MONTHS.map((month, monthIdx) => { if (monthIdx < 11) return null; let netSum = 0, grossSum = 0, valueSum = 0; for (let back = monthIdx - 11; back <= monthIdx; back++) { netSum += net[back]; grossSum += gross[back]; valueSum += rv[back]; } return valueSum ? { net: netSum / (valueSum / 12), gross: grossSum / (valueSum / 12) } : null; });
  Object.values(tks).forEach(stat => {
    let valueSum = 0, held = 0; idx.forEach(monthIdx => { const holding = MONTHS[monthIdx].hold[stat.tk]; if (holding && holding[1] > 0) { valueSum += holding[1]; held++; } });
    stat.months = held; stat.avg = held ? valueSum / held : 0; stat.net = stat.gross + stat.isr;
    stat.yield = held && stat.avg ? stat.net / stat.avg * 12 / held : null;
    stat.yieldGross = held && stat.avg ? stat.gross / stat.avg * 12 / held : null;
    stat.perYear = held ? stat.pays.size / held * 12 : 0;
  });
  const sum = arr => idx.reduce((total, monthIdx) => total + arr[monthIdx], 0);
  const count = idx.length, avgRV = count ? sum(rv) / count : 0;
  // com: comisiones + IVA como monto negativo (cargos administrativos + las cobradas dentro de compras y ventas)
  const tot = { gross: sum(gross), isr: sum(byCat.isr), net: sum(net), com: sum(com), intr: sum(intr), months: count, avgRV };
  tot.yieldNet = count && avgRV ? tot.net / avgRV * 12 / count : null;
  tot.yieldGross = count && avgRV ? tot.gross / avgRV * 12 / count : null;
  tot.pays = Object.values(tks).reduce((total, stat) => total + stat.pays.size, 0);
  let cum = 1, rn = 0; idx.forEach(monthIdx => { const reported = P.returns[YM[monthIdx]]; if (reported) { cum *= 1 + reported[1]; rn++; } });
  tot.gbmCum = rn ? cum - 1 : null; tot.gbmAnn = rn ? Math.pow(cum, 12 / rn) - 1 : null; tot.gbmMonths = rn;
  return { idx, byCat, com, intr, rv, gross, net, ttm, tks: Object.values(tks), tot };
}
