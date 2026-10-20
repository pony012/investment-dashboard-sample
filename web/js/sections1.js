/* ============================== KPIs, calidad de datos e insights ============================== */
const kpiHtml = tiles => tiles.map(tile => `<div class="kpi"><div class="k">${tile.label}</div><div class="v">${tile.value}</div><div class="d">${tile.detail || ''}</div></div>`).join('');

// Rendimiento acumulado (TWR) de una lista de índices de meses
function twr(idxs) {
  let cum = 1, nm = 0;
  idxs.forEach(monthIdx => { if (model.R[monthIdx] != null) { cum *= 1 + model.R[monthIdx]; nm++; } });
  return { cum: cum - 1, nm, ann: nm ? annualize(cum - 1, nm) : null };
}

function renderKPIs() {
  const { V, F, G, rangeStart, rangeEnd, retIdx, insts } = model;
  const prevTotal = rangeStart > 0 ? V[rangeStart - 1] : 0;
  const ahorro = retIdx.reduce((sum, monthIdx) => sum + F[monthIdx], 0) + (rangeStart === 0 ? V[0] : 0);
  const rend = retIdx.reduce((sum, monthIdx) => sum + (G[monthIdx] || 0), 0);
  const growth = V[rangeEnd] - prevTotal;
  const perf = twr(retIdx);
  const usd = insts.filter(it => it.cls.moneda === 'USD').reduce((sum, it) => sum + it.st.vEnd, 0) / V[rangeEnd];
  const cash = MONTHS[rangeEnd].cash / V[rangeEnd];
  model.kp = { prevTotal, ahorro, rend, growth, ann: perf.ann, cum: perf.cum, nm: perf.nm };
  const divNet = model.gbm.tot.net;
  document.getElementById('kpis').innerHTML = kpiHtml([
    { label: L(`Valor al cierre · ${ymLabel(YM[rangeEnd])}`, `Closing value · ${ymLabel(YM[rangeEnd])}`), value: money(V[rangeEnd]), detail: rangeStart > 0 ? L(`<span class="${cls(growth)}">${growth >= 0 ? '+' : '−'}${money(Math.abs(growth))}</span> desde ${ymLabel(YM[rangeStart - 1])}`, `<span class="${cls(growth)}">${growth >= 0 ? '+' : '−'}${money(Math.abs(growth))}</span> since ${ymLabel(YM[rangeStart - 1])}`) : L(`desde ${ymLabel(YM[0])} (primer estado de cuenta)`, `since ${ymLabel(YM[0])} (first statement)`) },
    { label: L('Aportado neto', 'Net contributed'), value: money(ahorro), detail: rangeStart === 0 ? L(`incluye ${moneyC(V[0])} que ya tenías en ${ymLabel(YM[0])}`, `includes ${moneyC(V[0])} you already had in ${ymLabel(YM[0])}`) : L('depósitos − retiros en el periodo', 'deposits − withdrawals in the period') },
    { label: state.incDiv ? L('Rendimientos (plusvalías + dividendos)', 'Returns (capital gains + dividends)') : L('Rendimientos (sólo plusvalías)', 'Returns (capital gains only)'), value: `<span class="${cls(rend)}">${money(rend)}</span>`,
      detail: state.incDiv ? L(`incluye ${moneyC(divNet)} de dividendos netos`, `includes ${moneyC(divNet)} of net dividends`) : L(`${moneyC(divNet)} de dividendos netos se cuentan como aportación`, `${moneyC(divNet)} of net dividends counted as contributions`) },
    { label: L('Rendimiento anualizado (TWR)', 'Annualized return (TWR)'), value: `<span class="${cls(perf.ann)}">${pct(perf.ann, 2, true)}</span>`, detail: L(`acumulado ${pct(perf.cum, 1, true)} en ${perf.nm} meses`, `cumulative ${pct(perf.cum, 1, true)} over ${perf.nm} months`) },
    { label: L('Exposición a dólares', 'Dollar exposure'), value: pct(usd, 0), detail: L('según la columna Moneda', 'per the Currency column') },
    { label: L('Efectivo sin invertir', 'Uninvested cash'), value: pct(cash, 1), detail: L(`${moneyC(MONTHS[rangeEnd].cash)} en efectivo y reporto`, `${moneyC(MONTHS[rangeEnd].cash)} in cash and repo`) },
  ]);
}

function renderDataQuality() {
  // issues: [{ym, level: 'info'|'revisar', msg, fix}] (portfolio.json reciente); warnings: texto (versiones anteriores)
  const issues = P.issues || (P.warnings || []).map(msg => ({ ym: null, level: 'revisar', msg, fix: '' }));
  const el = document.getElementById('dq');
  el.hidden = !issues.length;
  if (!issues.length) return;
  const review = issues.filter(item => item.level !== 'info'), fixed = issues.filter(item => item.level === 'info');
  const ocr = MONTHS.filter(month => month.mode === 'ocr').map(month => month.ym);
  document.getElementById('dqSummary').innerHTML = (review.length ? L(`<b class="down">${review.length} aviso(s) para revisar</b>`, `<b class="down">${review.length} warning(s) to review</b>`) : L('<b class="up">Nada que revisar</b>', '<b class="up">Nothing to review</b>')) +
    (fixed.length ? L(` · ${fixed.length} corregido(s) automáticamente`, ` · ${fixed.length} corrected automatically`) : '') +
    (ocr.length ? L(` · ${ocr.length} meses leídos con OCR (${ymLabel(ocr[0])}–${ymLabel(ocr[ocr.length - 1])})`, ` · ${ocr.length} months read with OCR (${ymLabel(ocr[0])}–${ymLabel(ocr[ocr.length - 1])})`) : '');
  const item = issue => `<li><b>${issue.ym ? ymLabel(issue.ym) : L('General', 'General')}</b>: ${esc(issue.msg)}${issue.fix ? `<div class="dq-fix">→ ${esc(issue.fix).replace(/`([^`]+)`/g, '<code>$1</code>')}</div>` : ''}</li>`;
  document.getElementById('dqList').innerHTML =
    (review.length ? `<li class="dq-head down">${L('Para revisar', 'To review')}</li>${review.map(item).join('')}` : '') +
    (fixed.length ? L(`<li class="dq-head">Corregidos automáticamente: el parser reconstruyó el valor y cuadra con el saldo del estado de cuenta. No tienes que hacer nada.</li>${fixed.map(item).join('')}`, `<li class="dq-head">Corrected automatically: the parser rebuilt the value and it matches the statement balance. Nothing to do.</li>${fixed.map(item).join('')}`) : '') +
    L('<li class="dq-head">Todos los avisos y qué hacer con cada uno: docs/estados-de-cuenta.md (sección "Avisos").</li>', '<li class="dq-head">Every warning and what to do about it: docs/estados-de-cuenta.md (section "Avisos").</li>');
}

function renderInsights() {
  const { V, rangeStart, rangeEnd, ranked, shown, retIdx, groupBy, R } = model;
  const kp = model.kp, out = [];
  const startValue = rangeStart > 0 ? V[rangeStart - 1] : 0;
  if (kp.growth > 0) {
    out.push({ title: L('Crecimiento', 'Growth'), body: startValue > 0
      ? L(`Pasaste de <b>${moneyC(startValue)}</b> a <b>${moneyC(V[rangeEnd])}</b> (${(V[rangeEnd] / startValue).toFixed(1)}×). <b>${pct((kp.ahorro) / kp.growth, 0)}</b> vino de tu ahorro y <b>${pct(kp.rend / kp.growth, 0)}</b> de rendimientos.`, `You went from <b>${moneyC(startValue)}</b> to <b>${moneyC(V[rangeEnd])}</b> (${(V[rangeEnd] / startValue).toFixed(1)}×). <b>${pct((kp.ahorro) / kp.growth, 0)}</b> came from your savings and <b>${pct(kp.rend / kp.growth, 0)}</b> from returns.`)
      : L(`Tu cuenta vale <b>${moneyC(V[rangeEnd])}</b>: aportaste <b>${moneyC(kp.ahorro)}</b> (contando lo que ya tenías en ${ymLabel(YM[0])}) y los rendimientos sumaron <b>${moneyC(kp.rend)}</b>.`, `Your account is worth <b>${moneyC(V[rangeEnd])}</b>: you contributed <b>${moneyC(kp.ahorro)}</b> (counting what you already had in ${ymLabel(YM[0])}) and returns added <b>${moneyC(kp.rend)}</b>.`) });
  }
  const rated = shown.filter(it => it.st.ann != null && it.st.nm >= 12).sort((left, right) => right.st.ann - left.st.ann);
  if (rated.length >= 3) {
    const top = rated.slice(0, 3).map(it => `<b>${esc(it.tk)}</b> (${pct(it.st.ann, 1, true)})`).join(', ');
    const bot = rated.slice(-2).reverse().map(it => `<b>${esc(it.tk)}</b> (${pct(it.st.ann, 1, true)})`).join(L(' y ', ' and '));
    out.push({ title: L('Mejores y peores (≥12 meses)', 'Best and worst (≥12 months)'), body: L(`Mejores anualizados: ${top}. Los más flojos: ${bot}.`, `Best annualized: ${top}. Weakest: ${bot}.`) });
  }
  if (model.totalGain) {
    const groups = groupBy(state.dim).map(group => {
      const members = group.members.filter(it => !it.isCash);
      const gain = members.reduce((sum, it) => sum + it.st.gain, 0), weight = members.reduce((sum, it) => sum + it.st.wAvg, 0);
      return { name: group.name, gain, weight, eff: weight > 0.005 ? (gain / model.totalGain) / weight : null };
    }).filter(group => group.eff != null).sort((left, right) => right.eff - left.eff);
    if (groups.length >= 2) {
      const best = groups[0], worst = groups[groups.length - 1];
      out.push({ title: L(`Eficiencia por ${DIMS[state.dim].label.toLowerCase()}`, `Efficiency by ${DIMS[state.dim].label.toLowerCase()}`), body: L(`<b>${esc(best.name)}</b> generó ${pct(best.gain / model.totalGain, 0)} de tus ganancias con ${pct(best.weight, 0)} de peso promedio (${best.eff.toFixed(1)}×). En cambio <b>${esc(worst.name)}</b> pesó ${pct(worst.weight, 0)} y aportó ${pct(worst.gain / model.totalGain, 0)} (${worst.eff.toFixed(1)}×).`, `<b>${esc(best.name)}</b> generated ${pct(best.gain / model.totalGain, 0)} of your gains with ${pct(best.weight, 0)} average weight (${best.eff.toFixed(1)}×). In contrast <b>${esc(worst.name)}</b> weighed ${pct(worst.weight, 0)} and contributed ${pct(worst.gain / model.totalGain, 0)} (${worst.eff.toFixed(1)}×).`) });
    }
    const topGain = [...shown].sort((left, right) => right.st.gain - left.st.gain)[0];
    if (topGain && topGain.st.gain > 0) out.push({ title: L('Mayor generador en $', 'Largest $ contributor'), body: L(`<b>${esc(topGain.tk)}</b> (${esc(topGain.name)}) generó <b>${money(topGain.st.gain)}</b>, el ${pct(topGain.st.gainShare, 0)} de todas las ganancias del periodo.`, `<b>${esc(topGain.tk)}</b> (${esc(topGain.name)}) generated <b>${money(topGain.st.gain)}</b>, ${pct(topGain.st.gainShare, 0)} of all gains in the period.`) });
  }
  const rs = retIdx.filter(monthIdx => R[monthIdx] != null).map(monthIdx => ({ monthIdx, ret: R[monthIdx] })).sort((left, right) => right.ret - left.ret);
  if (rs.length >= 2) out.push({ title: L('Meses extremos', 'Extreme months'), body: L(`Mejor: <b>${ymLabel(YM[rs[0].monthIdx])}</b> (${pct(rs[0].ret, 2, true)}). Peor: <b>${ymLabel(YM[rs[rs.length - 1].monthIdx])}</b> (${pct(rs[rs.length - 1].ret, 2, true)}). ${pct(rs.filter(item => item.ret < 0).length / rs.length, 0)} de los meses fueron negativos.`, `Best: <b>${ymLabel(YM[rs[0].monthIdx])}</b> (${pct(rs[0].ret, 2, true)}). Worst: <b>${ymLabel(YM[rs[rs.length - 1].monthIdx])}</b> (${pct(rs[rs.length - 1].ret, 2, true)}). ${pct(rs.filter(item => item.ret < 0).length / rs.length, 0)} of months were negative.`) });
  const gt = model.gbm.tot;
  if (gt.months && gt.gross) {
    const top = [...model.gbm.tks].filter(stat => stat.yield != null && stat.months >= 6 && stat.tk !== 'EFEC').sort((left, right) => right.yield - left.yield)[0];
    out.push({ title: L('Dividendos y distribuciones', 'Dividends and distributions'), body: L(`Recibiste <b>${money(gt.net)}</b> netos (${money(gt.gross)} brutos − ${money(-gt.isr)} de ISR) en ${gt.months} meses: un yield de <b>${pct(gt.yieldNet, 2)}</b> anual sobre lo invertido.`, `You received <b>${money(gt.net)}</b> net (${money(gt.gross)} gross − ${money(-gt.isr)} ISR) over ${gt.months} months: an annual yield of <b>${pct(gt.yieldNet, 2)}</b> on what you invested.`) + (top ? L(` El que más paga: <b>${esc(top.tk)}</b> (${pct(top.yield, 1)} neto).`, ` Top payer: <b>${esc(top.tk)}</b> (${pct(top.yield, 1)} net).`) : '') });
  }
  const cashAvg = retIdx.length ? retIdx.reduce((sum, monthIdx) => sum + (V[monthIdx] > 0 ? MONTHS[monthIdx].cash / V[monthIdx] : 0), 0) / retIdx.length : 0;
  const intr = model.gbm.tot.intr;
  if (cashAvg > 0.02) out.push({ title: L('Efectivo ocioso', 'Idle cash'), body: L(`En promedio tuviste <b>${pct(cashAvg, 1)}</b> del portafolio en efectivo y reporto, que generó ${money(intr)} de premio en el periodo. Revisa si ese dinero debería estar invertido.`, `On average you held <b>${pct(cashAvg, 1)}</b> of the portfolio in cash and repo, which earned ${money(intr)} in repo interest during the period. Check whether that money should be invested.`) });
  const closed = ranked.filter(it => !it.active && it.last >= YM[rangeStart] && it.last < YM[rangeEnd]);
  if (closed.length) out.push({ title: L('Posiciones cerradas', 'Closed positions'), body: L(`Cerraste ${closed.map(it => `<b>${esc(it.tk)}</b>`).join(', ')} durante el periodo.`, `You closed ${closed.map(it => `<b>${esc(it.tk)}</b>`).join(', ')} during the period.`) });
  document.getElementById('insights').innerHTML = out.map(item => `<div class="ins"><div class="t">${item.title}</div><div class="b">${item.body}</div></div>`).join('') || L('<div class="ins">Selecciona un periodo más amplio.</div>', '<div class="ins">Select a wider period.</div>');
}

/* ============================== Evolución ============================== */
function renderEvo() {
  const { V, F, R, G, rangeStart, rangeEnd, groupBy } = model;
  const idxs = model.idx;
  const chartInst = chart('cEvo');
  const titleEl = document.getElementById('evoTitle'), hintEl = document.getElementById('evoHint');
  setSeg('evoGran', state.evoGran);
  document.getElementById('evoGran').style.display = state.evoMode === 'rend' ? '' : 'none';
  const labels = idxs.map(monthIdx => ymLabel(YM[monthIdx]));
  if (state.evoMode === 'valor') {
    titleEl.textContent = L('Valor vs. aportado', 'Value vs. contributed');
    htmlLegend('lgEvo', 'cEvo', [{ name: L('Valor del portafolio', 'Portfolio value'), color: TK.series[0] }, { name: L('Aportado neto', 'Net contributed'), color: TK.series[1] }]);
    hintEl.textContent = L('La distancia entre las dos líneas es tu ganancia acumulada. Lo que ya tenías en el primer estado de cuenta cuenta como aportación.', 'The gap between the two lines is your cumulative gain. What you already held in the first statement counts as a contribution.');
    let ap = rangeStart > 0 ? V[rangeStart - 1] : 0;
    const value = [], aport = [];
    idxs.forEach(monthIdx => { ap += monthIdx === 0 ? V[0] : F[monthIdx]; value.push(V[monthIdx]); aport.push(ap); });
    chartInst.setOption(base({
      legend: hiddenLegend(),
      grid: { left: 8, right: 70, top: 12, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
        formatter: ps => { const offset = ps[0].dataIndex, monthIdx = idxs[offset];
          return ttHead(ymLabel(YM[monthIdx])) + ttRow(TK.series[0], L('Valor', 'Value'), money(value[offset])) + ttRow(TK.series[1], L('Aportado neto', 'Net contributed'), money(aport[offset])) +
            ttRow(null, L('Ganancia acumulada', 'Cumulative gain'), `<span class="${cls(value[offset] - aport[offset])}">${money(value[offset] - aport[offset])}</span>`) +
            (monthIdx > 0 ? ttRow(null, L('Flujo del mes', 'Month’s flow'), money(F[monthIdx])) + ttRow(null, L('Rendimiento del mes', 'Month’s return'), pct(R[monthIdx], 2, true)) : ''); } }),
      xAxis: catAxis(labels, { boundaryGap: false }), yAxis: valAxis(moneyC),
      series: [
        { name: L('Valor del portafolio', 'Portfolio value'), type: 'line', data: value, symbol: 'circle', symbolSize: 6, showSymbol: false, lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: TK.series[0] + '40' }, { offset: 1, color: TK.series[0] + '05' }]) },
          endLabel: { show: true, formatter: param => moneyC(param.value), color: TK.ink, fontWeight: 600 } },
        { name: L('Aportado neto', 'Net contributed'), type: 'line', data: aport, symbol: 'circle', symbolSize: 6, showSymbol: false, lineStyle: { width: 2, color: TK.series[1] }, itemStyle: { color: TK.series[1] },
          endLabel: { show: true, formatter: param => moneyC(param.value), color: TK.ink2 } },
      ],
    }), true);
  } else if (state.evoMode === 'indice') {
    titleEl.textContent = L('Índice de rendimiento (base 100)', 'Return index (base 100)');
    hintEl.textContent = L(`Portafolio total vs. cada ${DIMS[state.dim].label.toLowerCase()} (sin efectivo). Cada línea arranca en el nivel del portafolio el mes en que aparece.`, `Total portfolio vs. each ${DIMS[state.dim].label.toLowerCase()} (without cash). Each line starts at the portfolio level in the month it appears.`);
    const count = idxs.length, portIdx = new Array(count).fill(null);
    let level = 100;
    idxs.forEach((monthIdx, offset) => { if (offset === 0) { portIdx[0] = 100; return; } level *= 1 + (R[monthIdx] ?? 0); portIdx[offset] = level; });
    const series = [];
    groupBy(state.dim).forEach(group => {
      if (group.members.every(it => it.isCash)) return;
      const data = new Array(count).fill(null); let groupLevel = null;
      idxs.forEach((monthIdx, offset) => {
        const ret = group.ret[monthIdx];
        if (groupLevel == null) { if (ret == null) return; if (offset > 0) { data[offset - 1] = portIdx[offset - 1]; groupLevel = portIdx[offset - 1] * (1 + ret); } else groupLevel = 100; data[offset] = groupLevel; return; }
        groupLevel *= 1 + (ret ?? 0); data[offset] = groupLevel;
      });
      if (data.some(datum => datum != null)) series.push({ name: group.name, type: 'line', data, showSymbol: false, symbol: 'circle', symbolSize: 6, lineStyle: { width: 1.6, color: colorFor(state.dim, group.name) }, itemStyle: { color: colorFor(state.dim, group.name) }, emphasis: { focus: 'series' } });
    });
    series.unshift({ name: L('Portafolio', 'Portfolio'), type: 'line', data: portIdx, showSymbol: false, symbol: 'circle', symbolSize: 6, z: 5, lineStyle: { width: 3, color: TK.ink }, itemStyle: { color: TK.ink }, emphasis: { focus: 'series' },
      endLabel: { show: true, formatter: param => L('Portafolio ', 'Portfolio ') + (param.value != null ? param.value.toFixed(0) : ''), color: TK.ink, fontWeight: 600 } });
    htmlLegend('lgEvo', 'cEvo', series.map(seriesItem => ({ name: seriesItem.name, color: seriesItem.lineStyle.color })));
    chartInst.setOption(base({
      legend: hiddenLegend(),
      grid: { left: 8, right: 110, top: 12, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
        formatter: ps => ttHead(ymLabel(YM[idxs[ps[0].dataIndex]])) + ps.filter(param => param.value != null).sort((left, right) => right.value - left.value).map(param => ttRow(param.color, param.seriesName, param.value.toFixed(1))).join('') }),
      xAxis: catAxis(labels, { boundaryGap: false }), yAxis: valAxis(value => value.toFixed(0), { scale: true }), series,
    }), true);
  } else {
    const gran = state.evoGran, bks = buckets(model.retIdx, gran);
    titleEl.textContent = L(`Rendimiento del portafolio por ${({ m: 'mes', q: 'trimestre', y: 'año' })[gran]}`, `Portfolio return by ${({ m: 'month', q: 'quarter', y: 'year' })[gran]}`);
    hintEl.textContent = L('Meses encadenados dentro de cada periodo (TWR, no anualizado). El último periodo puede estar incompleto.', 'Months chained within each period (TWR, not annualized). The last period may be incomplete.');
    document.getElementById('lgEvo').innerHTML = '';
    const data = bks.map(bk => { let cum = 1, any = false; bk.idx.forEach(monthIdx => { if (R[monthIdx] != null) { cum *= 1 + R[monthIdx]; any = true; } }); return any ? cum - 1 : null; });
    chartInst.setOption(base({
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
        formatter: ps => { const bk = bks[ps[0].dataIndex]; return ttHead(bucketLabel(bk.key, gran)) + ttRow(null, L('Rendimiento', 'Return'), pct(data[ps[0].dataIndex], 2, true)) + ttRow(null, L('Generado', 'Generated'), money(bk.idx.reduce((sum, monthIdx) => sum + (G[monthIdx] || 0), 0))) + ttRow(null, L('Meses', 'Months'), bk.idx.length); } }),
      xAxis: catAxis(bks.map(bk => bucketLabel(bk.key, gran))), yAxis: valAxis(value => (value * 100).toFixed(1) + '%'),
      series: [{ type: 'bar', barMaxWidth: 26, data: data.map(datum => ({ value: datum, itemStyle: { color: datum == null ? TK.other : datum >= 0 ? TK.pos : TK.neg, borderRadius: datum >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })) }],
    }), true);
  }
}

function renderGrowth() {
  const gran = model.retIdx.length > 36 ? 'q' : 'm';
  const bks = buckets(model.retIdx, gran);
  document.getElementById('growthHint').textContent = L(`Ahorro neto (depósitos − retiros) vs. rendimientos, por ${gran === 'q' ? 'trimestre' : 'mes'}`, `Net savings (deposits − withdrawals) vs. returns, by ${gran === 'q' ? 'quarter' : 'month'}`);
  const sav = bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + model.F[monthIdx], 0));
  const ren = bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + (model.G[monthIdx] || 0), 0));
  chart('cGrowth').setOption(base({
    legend: legend(),
    grid: { left: 8, right: 8, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
      formatter: ps => ttHead(bucketLabel(bks[ps[0].dataIndex].key, gran)) + ps.map(param => ttRow(param.color, param.seriesName, money(param.value))).join('') }),
    xAxis: catAxis(bks.map(bk => bucketLabel(bk.key, gran))), yAxis: valAxis(moneyC),
    series: [
      { name: L('Ahorro neto', 'Net savings'), type: 'bar', stack: 'g', data: sav, itemStyle: { color: TK.series[1], borderColor: TK.surface, borderWidth: 1 }, barMaxWidth: 24 },
      { name: L('Rendimientos', 'Returns'), type: 'bar', stack: 'g', data: ren, itemStyle: { color: TK.series[2], borderColor: TK.surface, borderWidth: 1 }, barMaxWidth: 24 },
    ],
  }), true);
}

function renderYears() {
  const { V, F, G, R } = model;
  const years = buckets(model.idx, 'y');
  const rows = years.map(bk => {
    const months = bk.idx.filter(monthIdx => monthIdx > 0);
    const first = bk.idx[0], last = bk.idx[bk.idx.length - 1];
    const start = first > 0 ? V[first - 1] : 0;
    let cum = 1, cumGbm = 1, nGbm = 0;
    months.forEach(monthIdx => { if (R[monthIdx] != null) cum *= 1 + R[monthIdx]; const reported = P.returns[YM[monthIdx]]; if (reported) { cumGbm *= 1 + reported[1]; nGbm++; } });
    return { year: bk.key, start, end: V[last], flow: months.reduce((sum, monthIdx) => sum + F[monthIdx], 0) + (first === 0 ? V[0] : 0), gain: months.reduce((sum, monthIdx) => sum + (G[monthIdx] || 0), 0),
      ret: months.length ? cum - 1 : null, gbm: nGbm ? cumGbm - 1 : null, months: bk.idx.length };
  });
  document.getElementById('yearTbl').innerHTML = thead([[L('Año', 'Year'), 1], [L('Valor inicial', 'Starting value')], [L('Aportado neto', 'Net contributed')], [L('Ganancia', 'Gain')], [L('Valor final', 'Ending value')], [L('Rend. (TWR)', 'Return (TWR)')], [L('Reportado GBM', 'Reported by GBM')]]) + '<tbody>' +
    rows.map(row => '<tr>' + td(row.year, row.year + (row.months < 12 ? ` <span style="color:var(--muted)">(${row.months} m)</span>` : ''), 'l') + td(row.start, money(row.start)) + td(row.flow, money(row.flow)) +
      td(row.gain, `<span class="${cls(row.gain)}">${money(row.gain)}</span>`) + td(row.end, money(row.end)) + td(row.ret, `<span class="${cls(row.ret)}">${pct(row.ret, 1, true)}</span>`) + td(row.gbm, pct(row.gbm, 1, true)) + '</tr>').join('') + '</tbody>';
  sortable('yearTbl');
}

/* ============================== Composición ============================== */
function renderComp() {
  const { V, rangeStart, rangeEnd, idx } = model;
  const byInst = state.compBy === 'inst';
  const dimGroups = model.groupBy(state.dim);
  const groups = byInst ? dimGroups.flatMap(group => {
    const mem = group.members.map(it => ({ it, value: YM.map((ym, monthIdx) => model.valOf(it.tk, monthIdx)) }))
      .filter(inst => inst.value.slice(rangeStart, rangeEnd + 1).some(value => value > 0))
      .sort((left, right) => (right.value[rangeEnd] - left.value[rangeEnd]) || (Math.max(...right.value) - Math.max(...left.value)));
    const baseColor = colorFor(state.dim, group.name);
    return mem.map((inst, index) => ({ name: inst.it.tk === CASH ? CASH_CLS.nombre : inst.it.tk, group: group.name, value: inst.value, color: mem.length > 1 ? mix(baseColor, TK.surface, 0.6 * index / (mem.length - 1)) : baseColor }));
  }) : dimGroups.map(group => ({ name: group.name, value: group.value, color: colorFor(state.dim, group.name) }));
  const labels = idx.map(monthIdx => ymLabel(YM[monthIdx]));
  const isPct = state.compMode === 'pct';
  setSeg('compBy', state.compBy); setSeg('compMode', state.compMode);
  const dl = DIMS[state.dim].label.toLowerCase();
  document.getElementById('compHint').textContent = byInst ? L(`${isPct ? L('% del portafolio', '% of portfolio') : L('Monto', 'Amount')} por instrumento · color por ${dl}, un tono por instrumento`, `${isPct ? '% of portfolio' : 'Amount'} by instrument · color by ${dl}, one shade per instrument`) : (isPct ? L(`% del portafolio por ${dl}`, `% of portfolio by ${dl}`) : L(`Monto por ${dl}`, `Amount by ${dl}`));
  const series = groups.map(group => ({
    name: group.name, type: 'line', stack: 'c', symbol: 'none', lineStyle: { width: byInst ? 0.6 : 1, color: TK.surface }, areaStyle: { color: group.color, opacity: 0.92 }, itemStyle: { color: group.color },
    emphasis: { focus: 'series' }, data: idx.map(monthIdx => isPct ? (V[monthIdx] ? Math.max(group.value[monthIdx], 0) / V[monthIdx] : 0) : group.value[monthIdx]),
  }));
  chart('cComp');
  htmlLegend('lgComp', 'cComp', groups.map(group => ({ name: group.name, color: group.color })));
  charts.cComp.setOption(base({
    legend: hiddenLegend(),
    grid: { left: 8, right: 12, top: 12, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const monthIdx = idx[ps[0].dataIndex];
        const rows = ps.filter(param => groups[param.seriesIndex].value[monthIdx]).sort((left, right) => groups[right.seriesIndex].value[monthIdx] - groups[left.seriesIndex].value[monthIdx]);
        return ttHead(ymLabel(YM[monthIdx])) + rows.map(row => { const group = groups[row.seriesIndex]; return ttRow(row.color, row.seriesName, `${pct(group.value[monthIdx] / V[monthIdx], 1)} · ${moneyC(group.value[monthIdx])}`); }).join(''); } }),
    xAxis: catAxis(labels, { boundaryGap: false }),
    yAxis: valAxis(isPct ? value => (value * 100).toFixed(0) + '%' : moneyC, isPct ? { max: 1 } : {}),
    series,
  }), true);

  const tot = V[rangeEnd];
  document.getElementById('donutHint').textContent = `${ymLabel(YM[rangeEnd])} · ${money(tot)}`;
  const data = groups.map(group => ({ name: group.name, value: group.value[rangeEnd], itemStyle: { color: group.color } })).filter(group => group.value > 0);
  chart('cDonut').setOption(base({
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => ttRow(param.color, param.name, `${pct(param.value / tot, 1)} · ${money(param.value)}`) }),
    series: [{ type: 'pie', radius: ['56%', '84%'], center: ['50%', '50%'], data, avoidLabelOverlap: true, itemStyle: { borderColor: TK.surface, borderWidth: 2, borderRadius: 4 }, label: { show: false } }],
    graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text: moneyC(tot), fill: TK.ink, font: `600 18px ${FONT}`, textAlign: 'center' } }],
  }), true);
  const list = document.getElementById('donutList');
  list.style.maxHeight = byInst ? '300px' : ''; list.style.overflowY = byInst ? 'auto' : '';
  list.innerHTML = data.sort((left, right) => right.value - left.value).map(datum => `<div><span>${sw(datum.itemStyle.color)}${esc(datum.name)}</span><b>${pct(datum.value / tot, 1)}</b><span>${moneyC(datum.value)}</span></div>`).join('');
}

function renderSunburst() {
  const { insts, rangeEnd } = model;
  const d1 = state.sb1, d2 = state.sb2;
  const tot = model.V[rangeEnd];
  const full = [];
  const v1 = [...DIMS[d1].values]; insts.forEach(it => { if (!v1.includes(it.cls[d1])) v1.push(it.cls[d1]); });
  v1.forEach(level1Value => {
    const mem = insts.filter(it => it.cls[d1] === level1Value && it.st.vEnd > 0);
    if (!mem.length) return;
    const col = colorFor(d1, level1Value);
    const v2 = [...DIMS[d2].values]; mem.forEach(it => { if (!v2.includes(it.cls[d2])) v2.push(it.cls[d2]); });
    const children = v2.map(level2Value => {
      const m2 = mem.filter(it => it.cls[d2] === level2Value); if (!m2.length) return null;
      return { name: valueLabel(level2Value), color: mix(col, TK.surface, 0.3), value: m2.reduce((sum, it) => sum + it.st.vEnd, 0),
        children: m2.sort((left, right) => right.st.vEnd - left.st.vEnd).map(it => ({ name: it.isCash ? L('Efectivo', 'Cash') : it.tk, value: it.st.vEnd, color: mix(col, TK.surface, 0.55), leaf: true })) };
    }).filter(Boolean);
    full.push({ name: valueLabel(level1Value), color: col, value: children.reduce((sum, child) => sum + child.value, 0), children });
  });
  let view = full, focus = null;
  // En un mes animado el grupo enfocado puede no existir todavía: se muestra todo sin perder el enfoque elegido
  let path = state.sbPath || [];
  for (const name of path) { const node = view.find(item => item.name === name); if (!node || !node.children) { if (FRAME == null) state.sbPath = []; path = []; view = full; focus = null; break; } focus = node; view = node.children; }
  const depth = nodes => nodes.length && nodes[0].children ? 1 + depth(nodes[0].children) : 1;
  const nRings = depth(view);
  const hole = path.length ? 26 : 12;
  const radii = nRings === 3 ? [hole, 40, 64, 96] : nRings === 2 ? [hole, 58, 96] : [hole, 96];
  const chartInst = chart('cSun');
  const Rpx = Math.min(chartInst.getWidth(), chartInst.getHeight()) / 2;
  const viewTotal = view.reduce((sum, node) => sum + node.value, 0) || 1;
  const build = (nodes, lvl) => nodes.map(node => {
    const ang = node.value / viewTotal * Math.PI * 2;
    const R0 = radii[lvl] / 100 * Rpx, R1 = radii[lvl + 1] / 100 * Rpx;
    const isTop = lvl === 0;
    const label = Rpx > 0 ? fitArcLabel(node.name, ang, R0, R1, node.leaf ? 10 : 11, isTop ? 600 : 400, isTop ? inkOn(node.color) : TK.ink) : { show: false };
    const nodeOut = { name: node.name, value: node.value, itemStyle: { color: node.color }, label };
    if (node.children) nodeOut.children = build(node.children, lvl + 1);
    return nodeOut;
  });
  const data = build(view, 0);
  document.getElementById('sunHint').textContent = path.length ? L(`${[L('Todo', 'All'), ...path].join(' › ')} · clic en el centro para regresar`, `${['All', ...path].join(' › ')} · click the center to go back`) : L('Anillo interior → medio → instrumento · clic en un segmento para enfocarlo', 'Inner ring → middle → instrument · click a segment to focus it');
  const graphic = focus ? [{
    type: 'group', left: 'center', top: 'middle', onclick: () => { state.sbPath = path.slice(0, -1); renderSunburst(); },
    children: [
      { type: 'circle', shape: { r: hole / 100 * Rpx - 4 }, style: { fill: mix(focus.color, TK.surface, 0.15) }, cursor: 'pointer', left: 'center', top: 'middle' },
      { type: 'text', left: 'center', top: 'middle', cursor: 'pointer', style: { text: `↩\n${focus.name}\n${moneyC(focus.value)}`, fill: inkOn(mix(focus.color, TK.surface, 0.15)), font: `600 11px ${FONT}`, textAlign: 'center', lineHeight: 15, width: 2 * (hole / 100 * Rpx) - 16, overflow: 'truncate' } },
    ],
  }] : [];
  chartInst.off('click');
  chartInst.on('click', event => {
    if (!event.treePathInfo || event.componentType !== 'series') return;
    const abs = [...path, ...event.treePathInfo.slice(1).map(pathItem => pathItem.name)];
    let nodes = full, node = null; for (const name of abs) { node = nodes.find(item => item.name === name); nodes = node && node.children ? node.children : []; }
    if (node && node.children) { state.sbPath = abs; renderSunburst(); }
  });
  chartInst.setOption(base({
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => ttHead([...path, ...param.treePathInfo.slice(1).map(pathItem => pathItem.name)].join(' › ')) + ttRow(null, L('Valor', 'Value'), money(param.value)) + ttRow(null, L('Peso en el portafolio', 'Weight in portfolio'), pct(param.value / tot, 1)) + (focus ? ttRow(null, `Peso dentro de ${focus.name}`, pct(param.value / viewTotal, 1)) : '') }),
    graphic,
    series: [{
      type: 'sunburst', data, radius: [hole + '%', '96%'], sort: null, nodeClick: false,
      itemStyle: { borderColor: TK.surface, borderWidth: 2, borderRadius: 3 },
      levels: [{}, ...radii.slice(0, -1).map((r0, index) => ({ r0: r0 + '%', r: radii[index + 1] + '%', itemStyle: index === nRings - 1 && nRings > 1 ? { borderWidth: 1 } : {} }))],
    }],
  }), true);
}

function renderTreemap() {
  const metric = state.tmMetric;
  const groups = model.groupBy(state.dim);
  const tot = model.V[model.rangeEnd];
  const max = metric === 'last' ? 0.05 : 0.15;
  setSeg('tmMetric', metric);
  rampLegend(document.getElementById('tmLegend'), max, metric === 'last' ? L('Último mes', 'Last month') : L('Anualizado', 'Annualized'));
  const data = groups.map(group => ({
    name: group.name,
    children: group.members.filter(it => it.st.vEnd > 0).map(it => {
      const metricValue = it.isCash ? null : metric === 'last' ? it.st.lastR : it.st.ann;
      const col = divColor(metricValue, max);
      return { name: it.isCash ? L('Efectivo', 'Cash') : it.tk, value: it.st.vEnd, metric: metricValue, itemStyle: { color: col }, label: { color: inkOn(col) } };
    }),
  })).filter(group => group.children.length);
  chart('cTree').setOption(base({
    tooltip: Object.assign(base().tooltip, { formatter: param => {
      const head = ttHead(param.name) + ttRow(null, L('Valor', 'Value'), money(param.value)) + ttRow(null, L('Peso', 'Weight'), pct(param.value / tot, 1));
      return !param.data || param.data.metric === undefined ? head : head + ttRow(null, metric === 'last' ? L('Último mes', 'Last month') : L('Anualizado', 'Annualized'), pct(param.data.metric, 2, true)); } }),
    series: [{
      type: 'treemap', data, roam: false, nodeClick: false, breadcrumb: { show: false }, left: 0, right: 0, top: 0, bottom: 0, squareRatio: 1.2,
      upperLabel: { show: true, height: 20, color: TK.ink2, fontSize: 11, fontWeight: 600, backgroundColor: 'transparent' },
      label: { show: true, fontSize: 11, formatter: param => `${param.name}\n${param.data.metric != null ? pct(param.data.metric, 1, true) : '—'}`, overflow: 'truncate' },
      levels: [
        { itemStyle: { borderWidth: 0, gapWidth: 4, borderColor: TK.surface }, upperLabel: { show: false } },
        { itemStyle: { borderColor: TK.surface2, borderWidth: 0, gapWidth: 2, color: TK.surface2 } },
        { itemStyle: { borderColor: TK.surface, borderWidth: 0, gapWidth: 2, borderRadius: 3 } },
      ],
    }],
  }), true);
}

/* ============================== Rendimiento por instrumento ============================== */
function renderOutliers() {
  const flagged = model.ranked.filter(it => it.outlier);
  document.getElementById('hideOut').checked = !!state.hideOut;
  document.getElementById('outList').innerHTML = flagged.length
    ? (state.hideOut ? L('Ocultos: ', 'Hidden: ') : L('Atípicos (visibles): ', 'Outliers (visible): ')) + flagged.map(it => `<button class="chip" data-unout="${esc(it.tk)}" title="${L('Dejar de tratarlo como atípico', 'Stop treating it as an outlier')}"><b style="color:var(--ink)">${esc(it.tk)}</b> (${esc(it.outlierWhy)}) ↺</button>`).join(' ')
    : L('Ningún instrumento marcado como atípico.', 'No instrument marked as an outlier.');
}

/* Menú al hacer clic en un instrumento de las gráficas de rendimiento: ocultarlo como atípico (o mostrarlo) y ver detalle */
const CLICK_HINT = () => L(`<div style="color:${TK.muted};margin-top:4px">Clic: ocultar o ver detalle</div>`, `<div style="color:${TK.muted};margin-top:4px">Click: hide or see detail</div>`);
function closeInstMenu() { const menu = document.getElementById('instMenu'); if (menu) menu.hidden = true; }
function openInstMenu(tk, clientX, clientY) {
  const it = model.ranked.find(inst => inst.tk === tk); if (!it) return;
  let menu = document.getElementById('instMenu');
  if (!menu) { menu = document.createElement('div'); menu.id = 'instMenu'; menu.className = 'inst-menu'; document.body.appendChild(menu); }
  const hidden = it.outlier && state.hideOut;
  menu.innerHTML = `<div class="im-head"><b>${esc(it.tk)}</b> ${esc(it.name)}</div>` +
    (it.outlier
      ? `<button data-act="unout">↺ ${hidden ? L('Mostrar de nuevo', 'Show again') : L('Dejar de marcar como atípico', 'Stop marking as outlier')}</button>`
      : L(`<button data-act="out">Ocultar de estas gráficas (atípico)</button>`, `<button data-act="out">Hide from these charts (outlier)</button>`)) +
    L(`<button data-act="detail">Ver detalle</button>`, `<button data-act="detail">See detail</button>`) +
    L(`<div class="im-note">Ocultar no lo quita de los totales del portafolio.</div>`, `<div class="im-note">Hiding does not remove it from portfolio totals.</div>`);
  menu.hidden = false;
  const width = 250, height = menu.offsetHeight || 120;
  menu.style.left = Math.max(8, Math.min(clientX + 8, window.innerWidth - width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(clientY + 8, window.innerHeight - height - 8)) + 'px';
  menu.onclick = event => {
    const act = event.target.closest('button[data-act]'); if (!act) return;
    closeInstMenu();
    if (act.dataset.act === 'detail') {
      state.detail = tk; renderDetail();
      const sec = document.getElementById('detTitle').closest('section');
      if (sec.classList.contains('collapsed')) setCollapsed(sec, false);
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const markOut = act.dataset.act === 'out';
    state.outOvr = { ...state.outOvr, [tk]: markOut }; LS.set('outOvr', state.outOvr);
    if (markOut && !state.hideOut) { state.hideOut = true; LS.set('hideOut', true); }
    toast(markOut ? L(`${tk} oculto como atípico (sigue en los totales). Para mostrarlo: ↺ arriba del ranking`, `${tk} hidden as an outlier (still in totals). To show it again: ↺ above the ranking`) : L(`${tk} visible de nuevo`, `${tk} visible again`));
    rerenderSafe();
  };
}
// Conecta el clic en barras/puntos/celdas y en las etiquetas del eje con el menú del instrumento
function bindInstClicks(chartInst, tkOf) {
  chartInst.off('click');
  chartInst.on('click', event => {
    const tk = event.componentType === 'yAxis' ? event.value : tkOf(event);
    const native = event.event && event.event.event;
    if (tk && native) { native.stopPropagation(); openInstMenu(tk, native.clientX, native.clientY); }
  });
}
document.addEventListener('click', event => { const menu = document.getElementById('instMenu'); if (menu && !menu.hidden && !menu.contains(event.target)) closeInstMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeInstMenu(); });
window.addEventListener('scroll', closeInstMenu, { passive: true });

function renderRank() {
  const metric = state.rankMetric;
  setSeg('rankMetric', metric);
  const get = it => metric === 'ann' ? it.st.ann : metric === 'gain' ? it.st.gain : it.st.eff;
  const rows = model.shown.filter(it => get(it) != null && (metric !== 'eff' || it.st.wAvg > 0.002)).map(it => ({ it, value: get(it) })).sort((left, right) => right.value - left.value);
  document.getElementById('rankHint').textContent = { ann: L('Rendimiento anualizado en el periodo', 'Annualized return in the period'), gain: L('Pesos generados en el periodo', 'Pesos generated in the period'), eff: L('% de las ganancias ÷ peso promedio. >1× = rindió más que su peso', '% of gains ÷ average weight. >1× = returned more than its weight') }[metric];
  document.getElementById('retBasis').textContent = state.incDiv ? L('Incluye dividendos y distribuciones netas de ISR.', 'Includes dividends and distributions net of ISR.') : L('Sólo plusvalías/minusvalías (sin dividendos).', 'Capital gains/losses only (no dividends).');
  const el = document.getElementById('cRank'); const needH = Math.max(300, rows.length * 22 + 40); el.style.height = (FRAME == null ? needH : Math.max(needH, el.clientHeight)) + 'px';   // al animar sólo crece, para que no brinque
  const chartInst = chart('cRank'); chartInst.resize();
  const fmt = metric === 'gain' ? moneyC : metric === 'eff' ? (value => value.toFixed(1) + '×') : (value => pct(value, 1, true));
  const ref = metric === 'eff' ? 1 : 0;
  chartInst.setOption(base({
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => { const it = rows[rows.length - 1 - param.dataIndex].it; return ttHead(`${it.tk} · ${it.name}`) + ttRow(null, L('Anualizado', 'Annualized'), pct(it.st.ann, 2, true)) + ttRow(null, L('Acumulado', 'Cumulative'), pct(it.st.cum, 1, true)) + ttRow(null, L('Ganancia', 'Gain'), money(it.st.gain)) + ttRow(null, L('Peso promedio', 'Average weight'), pct(it.st.wAvg, 1)) + ttRow(null, L('% de las ganancias', '% of gains'), pct(it.st.gainShare, 1)) + ttRow(null, L('Meses', 'Months'), it.st.nm) + CLICK_HINT(); } }),
    xAxis: valAxis(metric === 'gain' ? moneyC : metric === 'eff' ? (value => value + '×') : (value => (value * 100).toFixed(0) + '%')),
    yAxis: catAxis(rows.map(row => row.it.tk).reverse(), { triggerEvent: true, axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [{
      type: 'bar', barMaxWidth: 14, cursor: 'pointer',
      data: rows.map(row => ({ value: row.value, itemStyle: { color: row.value >= ref ? TK.pos : TK.neg, opacity: row.it.st.nm < 12 ? 0.4 : 1, borderRadius: row.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })).reverse(),
      label: { show: true, position: 'right', color: TK.muted, fontSize: 10, formatter: param => fmt(param.value) },
      markLine: metric === 'eff' ? { symbol: 'none', silent: true, lineStyle: { color: TK.axis, type: 'solid' }, label: { show: false }, data: [{ xAxis: 1 }] } : { data: [] },
    }],
  }), true);
  bindInstClicks(chartInst, event => event.componentType === 'series' ? rows[rows.length - 1 - event.dataIndex].it.tk : null);
}

function renderScatter() {
  const pts = model.shown.filter(it => it.st.vol != null && it.st.ann != null);
  const tot = model.V[model.rangeEnd];
  const maxV = Math.max(...pts.map(it => Math.max(it.st.vEnd, it.st.wAvg * tot)), 1);
  const series = DIMS.riesgo.values.map(rv => ({
    name: valueLabel(rv), type: 'scatter', labelLayout: { hideOverlap: true },
    itemStyle: { color: colorFor('riesgo', rv), borderColor: TK.surface, borderWidth: 2, opacity: 0.9 },
    data: pts.filter(it => it.cls.riesgo === rv).map(it => {
      const size = Math.max(it.st.vEnd, it.st.wAvg * tot);
      return { value: [it.st.vol, it.st.ann], name: it.tk, it, symbolSize: 10 + 34 * Math.sqrt(size / maxV), label: { show: true, formatter: it.tk, position: 'right', color: TK.ink2, fontSize: 10 } };
    }),
  }));
  chart('cScatter').setOption(base({
    legend: legend(),
    grid: { left: 8, right: 24, top: document.getElementById('cScatter').clientWidth < 480 ? 58 : 36, bottom: 26, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => { const it = param.data.it; return ttHead(`${it.tk} · ${it.name}`) + ttRow(null, L('Anualizado', 'Annualized'), pct(it.st.ann, 2, true)) + ttRow(null, L('Volatilidad anual', 'Annual volatility'), pct(it.st.vol, 1)) + ttRow(null, L('Valor al cierre', 'Closing value'), money(it.st.vEnd)) + ttRow(null, L('Meses', 'Months'), it.st.nm) + CLICK_HINT(); } }),
    xAxis: valAxis(value => (value * 100).toFixed(0) + '%', { name: L('Volatilidad', 'Volatility'), nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: TK.muted, fontSize: 11 } }),
    yAxis: valAxis(value => (value * 100).toFixed(0) + '%'),
    series,
  }), true);
  bindInstClicks(charts.cScatter, event => event.componentType === 'series' && event.data && event.data.it ? event.data.it.tk : null);
}

function renderHeat() {
  const gran = state.heatGran, qs = buckets(model.retIdx, gran);
  const heatMax = { m: 0.05, q: DIV_MAX, y: 0.25 }[gran];
  setSeg('heatGran', gran);
  document.getElementById('heatHint').textContent = L(`Rendimiento de cada instrumento en cada ${({ m: 'mes', q: 'trimestre', y: 'año' })[gran]}`, `Return of each instrument in each ${({ m: 'month', q: 'quarter', y: 'year' })[gran]}`) + (gran === 'm' ? '' : L(' (meses encadenados; el último periodo puede estar incompleto)', ' (months chained; the last period may be incomplete)'));
  rampLegend(document.getElementById('heatLegend'), heatMax, '');
  const qRet = (it, bk) => { let cum = 1, any = false; bk.idx.forEach(monthIdx => { const ret = monthReturn(model.rec[it.tk][monthIdx]); if (ret != null) { cum *= 1 + ret; any = true; } }); return any ? cum - 1 : null; };
  const rows = model.shown.filter(it => qs.some(bk => qRet(it, bk) != null))
    .sort((left, right) => DIMS.tipo.values.indexOf(left.cls.tipo) - DIMS.tipo.values.indexOf(right.cls.tipo) || right.st.vEnd - left.st.vEnd);
  const el = document.getElementById('cHeat'); el.style.height = Math.max(260, rows.length * 22 + 50) + 'px';
  const chartInst = chart('cHeat'); chartInst.resize();
  const data = [];
  rows.forEach((it, rowIdx) => qs.forEach((bk, colIdx) => {
    const ret = qRet(it, bk); if (ret == null) return;
    const col = divColor(ret, heatMax);
    data.push({ name: it.tk, value: [colIdx, rowIdx, ret], itemStyle: { color: col }, label: { color: inkOn(col) } });
  }));
  chartInst.setOption(base({
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => { const it = rows[param.value[1]], bk = qs[param.value[0]];
      const gen = bk.idx.reduce((sum, monthIdx) => sum + (model.rec[it.tk][monthIdx] ? model.rec[it.tk][monthIdx].gen : 0), 0);
      return ttHead(`${it.tk} · ${bucketLabel(bk.key, gran)}`) + ttRow(null, L('Rendimiento', 'Return'), pct(param.value[2], 2, true)) + ttRow(null, L('Generado', 'Generated'), money(gen)) + ttRow(null, L('Valor al cierre', 'Closing value'), money(model.valOf(it.tk, bk.idx[bk.idx.length - 1]))) + CLICK_HINT(); } }),
    xAxis: catAxis(qs.map(bk => bucketLabel(bk.key, gran)), { position: 'top', splitArea: { show: false } }),
    yAxis: catAxis(rows.map(it => it.tk), { inverse: true, triggerEvent: true, axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [{ type: 'heatmap', data, cursor: 'pointer', itemStyle: { borderColor: TK.surface, borderWidth: gran === 'm' ? 1 : 2, borderRadius: gran === 'm' ? 2 : 3 },
      label: { show: window.innerWidth > 900 && qs.length <= 26, fontSize: 9, formatter: param => (param.value[2] * 100).toFixed(1) },
      emphasis: { itemStyle: { borderColor: TK.ink, borderWidth: 1 } } }],
  }), true);
  bindInstClicks(chartInst, event => event.componentType === 'series' ? rows[event.value[1]].tk : null);
}
