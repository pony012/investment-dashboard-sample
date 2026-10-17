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
    { label: `Valor al cierre · ${ymLabel(YM[rangeEnd])}`, value: money(V[rangeEnd]), detail: rangeStart > 0 ? `<span class="${cls(growth)}">${growth >= 0 ? '+' : '−'}${money(Math.abs(growth))}</span> desde ${ymLabel(YM[rangeStart - 1])}` : `desde ${ymLabel(YM[0])} (primer estado de cuenta)` },
    { label: 'Aportado neto', value: money(ahorro), detail: rangeStart === 0 ? `incluye ${moneyC(V[0])} que ya tenías en ${ymLabel(YM[0])}` : 'depósitos − retiros en el periodo' },
    { label: state.incDiv ? 'Rendimientos (plusvalías + dividendos)' : 'Rendimientos (sólo plusvalías)', value: `<span class="${cls(rend)}">${money(rend)}</span>`,
      detail: state.incDiv ? `incluye ${moneyC(divNet)} de dividendos netos` : `${moneyC(divNet)} de dividendos netos se cuentan como aportación` },
    { label: 'Rendimiento anualizado (TWR)', value: `<span class="${cls(perf.ann)}">${pct(perf.ann, 2, true)}</span>`, detail: `acumulado ${pct(perf.cum, 1, true)} en ${perf.nm} meses` },
    { label: 'Exposición a dólares', value: pct(usd, 0), detail: 'según la columna Moneda' },
    { label: 'Efectivo sin invertir', value: pct(cash, 1), detail: `${moneyC(MONTHS[rangeEnd].cash)} en efectivo y reporto` },
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
  document.getElementById('dqSummary').innerHTML = (review.length ? `<b class="down">${review.length} aviso(s) para revisar</b>` : '<b class="up">Nada que revisar</b>') +
    (fixed.length ? ` · ${fixed.length} corregido(s) automáticamente` : '') +
    (ocr.length ? ` · ${ocr.length} meses leídos con OCR (${ymLabel(ocr[0])}–${ymLabel(ocr[ocr.length - 1])})` : '');
  const item = issue => `<li><b>${issue.ym ? ymLabel(issue.ym) : 'General'}</b>: ${esc(issue.msg)}${issue.fix ? `<div class="dq-fix">→ ${esc(issue.fix).replace(/`([^`]+)`/g, '<code>$1</code>')}</div>` : ''}</li>`;
  document.getElementById('dqList').innerHTML =
    (review.length ? `<li class="dq-head down">Para revisar</li>${review.map(item).join('')}` : '') +
    (fixed.length ? `<li class="dq-head">Corregidos automáticamente: el parser reconstruyó el valor y cuadra con el saldo del estado de cuenta. No tienes que hacer nada.</li>${fixed.map(item).join('')}` : '') +
    '<li class="dq-head">Todos los avisos y qué hacer con cada uno: docs/estados-de-cuenta.md (sección "Avisos").</li>';
}

function renderInsights() {
  const { V, rangeStart, rangeEnd, ranked, retIdx, groupBy, R } = model;
  const kp = model.kp, out = [];
  const startValue = rangeStart > 0 ? V[rangeStart - 1] : 0;
  if (kp.growth > 0) {
    out.push({ title: 'Crecimiento', body: startValue > 0
      ? `Pasaste de <b>${moneyC(startValue)}</b> a <b>${moneyC(V[rangeEnd])}</b> (${(V[rangeEnd] / startValue).toFixed(1)}×). <b>${pct((kp.ahorro) / kp.growth, 0)}</b> vino de tu ahorro y <b>${pct(kp.rend / kp.growth, 0)}</b> de rendimientos.`
      : `Tu cuenta vale <b>${moneyC(V[rangeEnd])}</b>: aportaste <b>${moneyC(kp.ahorro)}</b> (contando lo que ya tenías en ${ymLabel(YM[0])}) y los rendimientos sumaron <b>${moneyC(kp.rend)}</b>.` });
  }
  const rated = ranked.filter(it => it.st.ann != null && it.st.nm >= 12).sort((left, right) => right.st.ann - left.st.ann);
  if (rated.length >= 3) {
    const top = rated.slice(0, 3).map(it => `<b>${esc(it.tk)}</b> (${pct(it.st.ann, 1, true)})`).join(', ');
    const bot = rated.slice(-2).reverse().map(it => `<b>${esc(it.tk)}</b> (${pct(it.st.ann, 1, true)})`).join(' y ');
    out.push({ title: 'Mejores y peores (≥12 meses)', body: `Mejores anualizados: ${top}. Los más flojos: ${bot}.` });
  }
  if (model.totalGain) {
    const groups = groupBy(state.dim).map(group => {
      const members = group.members.filter(it => !it.isCash);
      const gain = members.reduce((sum, it) => sum + it.st.gain, 0), weight = members.reduce((sum, it) => sum + it.st.wAvg, 0);
      return { name: group.name, gain, weight, eff: weight > 0.005 ? (gain / model.totalGain) / weight : null };
    }).filter(group => group.eff != null).sort((left, right) => right.eff - left.eff);
    if (groups.length >= 2) {
      const best = groups[0], worst = groups[groups.length - 1];
      out.push({ title: `Eficiencia por ${DIMS[state.dim].label.toLowerCase()}`, body: `<b>${esc(best.name)}</b> generó ${pct(best.gain / model.totalGain, 0)} de tus ganancias con ${pct(best.weight, 0)} de peso promedio (${best.eff.toFixed(1)}×). En cambio <b>${esc(worst.name)}</b> pesó ${pct(worst.weight, 0)} y aportó ${pct(worst.gain / model.totalGain, 0)} (${worst.eff.toFixed(1)}×).` });
    }
    const topGain = [...ranked].sort((left, right) => right.st.gain - left.st.gain)[0];
    if (topGain && topGain.st.gain > 0) out.push({ title: 'Mayor generador en $', body: `<b>${esc(topGain.tk)}</b> (${esc(topGain.name)}) generó <b>${money(topGain.st.gain)}</b>, el ${pct(topGain.st.gainShare, 0)} de todas las ganancias del periodo.` });
  }
  const rs = retIdx.filter(monthIdx => R[monthIdx] != null).map(monthIdx => ({ monthIdx, ret: R[monthIdx] })).sort((left, right) => right.ret - left.ret);
  if (rs.length >= 2) out.push({ title: 'Meses extremos', body: `Mejor: <b>${ymLabel(YM[rs[0].monthIdx])}</b> (${pct(rs[0].ret, 2, true)}). Peor: <b>${ymLabel(YM[rs[rs.length - 1].monthIdx])}</b> (${pct(rs[rs.length - 1].ret, 2, true)}). ${pct(rs.filter(item => item.ret < 0).length / rs.length, 0)} de los meses fueron negativos.` });
  const gt = model.gbm.tot;
  if (gt.months && gt.gross) {
    const top = [...model.gbm.tks].filter(stat => stat.yield != null && stat.months >= 6 && stat.tk !== 'EFEC').sort((left, right) => right.yield - left.yield)[0];
    out.push({ title: 'Dividendos y distribuciones', body: `Recibiste <b>${money(gt.net)}</b> netos (${money(gt.gross)} brutos − ${money(-gt.isr)} de ISR) en ${gt.months} meses: un yield de <b>${pct(gt.yieldNet, 2)}</b> anual sobre lo invertido.` + (top ? ` El que más paga: <b>${esc(top.tk)}</b> (${pct(top.yield, 1)} neto).` : '') });
  }
  const cashAvg = retIdx.length ? retIdx.reduce((sum, monthIdx) => sum + (V[monthIdx] > 0 ? MONTHS[monthIdx].cash / V[monthIdx] : 0), 0) / retIdx.length : 0;
  const intr = model.gbm.tot.intr;
  if (cashAvg > 0.02) out.push({ title: 'Efectivo ocioso', body: `En promedio tuviste <b>${pct(cashAvg, 1)}</b> del portafolio en efectivo y reporto, que generó ${money(intr)} de premio en el periodo. Revisa si ese dinero debería estar invertido.` });
  const closed = ranked.filter(it => !it.active && it.last >= YM[rangeStart] && it.last < YM[rangeEnd]);
  if (closed.length) out.push({ title: 'Posiciones cerradas', body: `Cerraste ${closed.map(it => `<b>${esc(it.tk)}</b>`).join(', ')} durante el periodo.` });
  document.getElementById('insights').innerHTML = out.map(item => `<div class="ins"><div class="t">${item.title}</div><div class="b">${item.body}</div></div>`).join('') || '<div class="ins">Selecciona un periodo más amplio.</div>';
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
    titleEl.textContent = 'Valor vs. aportado';
    htmlLegend('lgEvo', 'cEvo', [{ name: 'Valor del portafolio', color: TK.series[0] }, { name: 'Aportado neto', color: TK.series[1] }]);
    hintEl.textContent = 'La distancia entre las dos líneas es tu ganancia acumulada. Lo que ya tenías en el primer estado de cuenta cuenta como aportación.';
    let ap = rangeStart > 0 ? V[rangeStart - 1] : 0;
    const value = [], aport = [];
    idxs.forEach(monthIdx => { ap += monthIdx === 0 ? V[0] : F[monthIdx]; value.push(V[monthIdx]); aport.push(ap); });
    chartInst.setOption(base({
      legend: hiddenLegend(),
      grid: { left: 8, right: 70, top: 12, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
        formatter: ps => { const offset = ps[0].dataIndex, monthIdx = idxs[offset];
          return ttHead(ymLabel(YM[monthIdx])) + ttRow(TK.series[0], 'Valor', money(value[offset])) + ttRow(TK.series[1], 'Aportado neto', money(aport[offset])) +
            ttRow(null, 'Ganancia acumulada', `<span class="${cls(value[offset] - aport[offset])}">${money(value[offset] - aport[offset])}</span>`) +
            (monthIdx > 0 ? ttRow(null, 'Flujo del mes', money(F[monthIdx])) + ttRow(null, 'Rendimiento del mes', pct(R[monthIdx], 2, true)) : ''); } }),
      xAxis: catAxis(labels, { boundaryGap: false }), yAxis: valAxis(moneyC),
      series: [
        { name: 'Valor del portafolio', type: 'line', data: value, symbol: 'circle', symbolSize: 6, showSymbol: false, lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: TK.series[0] + '40' }, { offset: 1, color: TK.series[0] + '05' }]) },
          endLabel: { show: true, formatter: param => moneyC(param.value), color: TK.ink, fontWeight: 600 } },
        { name: 'Aportado neto', type: 'line', data: aport, symbol: 'circle', symbolSize: 6, showSymbol: false, lineStyle: { width: 2, color: TK.series[1] }, itemStyle: { color: TK.series[1] },
          endLabel: { show: true, formatter: param => moneyC(param.value), color: TK.ink2 } },
      ],
    }), true);
  } else if (state.evoMode === 'indice') {
    titleEl.textContent = 'Índice de rendimiento (base 100)';
    hintEl.textContent = `Portafolio total vs. cada ${DIMS[state.dim].label.toLowerCase()} (sin efectivo). Cada línea arranca en el nivel del portafolio el mes en que aparece.`;
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
    series.unshift({ name: 'Portafolio', type: 'line', data: portIdx, showSymbol: false, symbol: 'circle', symbolSize: 6, z: 5, lineStyle: { width: 3, color: TK.ink }, itemStyle: { color: TK.ink }, emphasis: { focus: 'series' },
      endLabel: { show: true, formatter: param => 'Portafolio ' + (param.value != null ? param.value.toFixed(0) : ''), color: TK.ink, fontWeight: 600 } });
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
    titleEl.textContent = `Rendimiento del portafolio por ${({ m: 'mes', q: 'trimestre', y: 'año' })[gran]}`;
    hintEl.textContent = 'Meses encadenados dentro de cada periodo (TWR, no anualizado). El último periodo puede estar incompleto.';
    document.getElementById('lgEvo').innerHTML = '';
    const data = bks.map(bk => { let cum = 1, any = false; bk.idx.forEach(monthIdx => { if (R[monthIdx] != null) { cum *= 1 + R[monthIdx]; any = true; } }); return any ? cum - 1 : null; });
    chartInst.setOption(base({
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
        formatter: ps => { const bk = bks[ps[0].dataIndex]; return ttHead(bucketLabel(bk.key, gran)) + ttRow(null, 'Rendimiento', pct(data[ps[0].dataIndex], 2, true)) + ttRow(null, 'Generado', money(bk.idx.reduce((sum, monthIdx) => sum + (G[monthIdx] || 0), 0))) + ttRow(null, 'Meses', bk.idx.length); } }),
      xAxis: catAxis(bks.map(bk => bucketLabel(bk.key, gran))), yAxis: valAxis(value => (value * 100).toFixed(1) + '%'),
      series: [{ type: 'bar', barMaxWidth: 26, data: data.map(datum => ({ value: datum, itemStyle: { color: datum == null ? TK.other : datum >= 0 ? TK.pos : TK.neg, borderRadius: datum >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })) }],
    }), true);
  }
}

function renderGrowth() {
  const gran = model.retIdx.length > 36 ? 'q' : 'm';
  const bks = buckets(model.retIdx, gran);
  document.getElementById('growthHint').textContent = `Ahorro neto (depósitos − retiros) vs. rendimientos, por ${gran === 'q' ? 'trimestre' : 'mes'}`;
  const sav = bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + model.F[monthIdx], 0));
  const ren = bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + (model.G[monthIdx] || 0), 0));
  chart('cGrowth').setOption(base({
    legend: legend(),
    grid: { left: 8, right: 8, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
      formatter: ps => ttHead(bucketLabel(bks[ps[0].dataIndex].key, gran)) + ps.map(param => ttRow(param.color, param.seriesName, money(param.value))).join('') }),
    xAxis: catAxis(bks.map(bk => bucketLabel(bk.key, gran))), yAxis: valAxis(moneyC),
    series: [
      { name: 'Ahorro neto', type: 'bar', stack: 'g', data: sav, itemStyle: { color: TK.series[1], borderColor: TK.surface, borderWidth: 1 }, barMaxWidth: 24 },
      { name: 'Rendimientos', type: 'bar', stack: 'g', data: ren, itemStyle: { color: TK.series[2], borderColor: TK.surface, borderWidth: 1 }, barMaxWidth: 24 },
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
  document.getElementById('yearTbl').innerHTML = thead([['Año', 1], ['Valor inicial'], ['Aportado neto'], ['Ganancia'], ['Valor final'], ['Rend. (TWR)'], ['Reportado GBM']]) + '<tbody>' +
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
  document.getElementById('compHint').textContent = byInst ? `${isPct ? '% del portafolio' : 'Monto'} por instrumento · color por ${dl}, un tono por instrumento` : (isPct ? `% del portafolio por ${dl}` : `Monto por ${dl}`);
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
      return { name: level2Value, color: mix(col, TK.surface, 0.3), value: m2.reduce((sum, it) => sum + it.st.vEnd, 0),
        children: m2.sort((left, right) => right.st.vEnd - left.st.vEnd).map(it => ({ name: it.isCash ? 'Efectivo' : it.tk, value: it.st.vEnd, color: mix(col, TK.surface, 0.55), leaf: true })) };
    }).filter(Boolean);
    full.push({ name: level1Value, color: col, value: children.reduce((sum, child) => sum + child.value, 0), children });
  });
  let view = full, focus = null;
  for (const name of (state.sbPath || [])) { const node = view.find(item => item.name === name); if (!node || !node.children) { state.sbPath = []; view = full; focus = null; break; } focus = node; view = node.children; }
  const depth = nodes => nodes.length && nodes[0].children ? 1 + depth(nodes[0].children) : 1;
  const nRings = depth(view);
  const hole = state.sbPath.length ? 26 : 12;
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
  document.getElementById('sunHint').textContent = state.sbPath.length ? `${['Todo', ...state.sbPath].join(' › ')} · clic en el centro para regresar` : 'Anillo interior → medio → instrumento · clic en un segmento para enfocarlo';
  const graphic = focus ? [{
    type: 'group', left: 'center', top: 'middle', onclick: () => { state.sbPath = state.sbPath.slice(0, -1); renderSunburst(); },
    children: [
      { type: 'circle', shape: { r: hole / 100 * Rpx - 4 }, style: { fill: mix(focus.color, TK.surface, 0.15) }, cursor: 'pointer', left: 'center', top: 'middle' },
      { type: 'text', left: 'center', top: 'middle', cursor: 'pointer', style: { text: `↩\n${focus.name}\n${moneyC(focus.value)}`, fill: inkOn(mix(focus.color, TK.surface, 0.15)), font: `600 11px ${FONT}`, textAlign: 'center', lineHeight: 15, width: 2 * (hole / 100 * Rpx) - 16, overflow: 'truncate' } },
    ],
  }] : [];
  chartInst.off('click');
  chartInst.on('click', event => {
    if (!event.treePathInfo || event.componentType !== 'series') return;
    const abs = [...state.sbPath, ...event.treePathInfo.slice(1).map(pathItem => pathItem.name)];
    let nodes = full, node = null; for (const name of abs) { node = nodes.find(item => item.name === name); nodes = node && node.children ? node.children : []; }
    if (node && node.children) { state.sbPath = abs; renderSunburst(); }
  });
  chartInst.setOption(base({
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => ttHead([...state.sbPath, ...param.treePathInfo.slice(1).map(pathItem => pathItem.name)].join(' › ')) + ttRow(null, 'Valor', money(param.value)) + ttRow(null, 'Peso en el portafolio', pct(param.value / tot, 1)) + (focus ? ttRow(null, `Peso dentro de ${focus.name}`, pct(param.value / viewTotal, 1)) : '') }),
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
  rampLegend(document.getElementById('tmLegend'), max, metric === 'last' ? 'Último mes' : 'Anualizado');
  const data = groups.map(group => ({
    name: group.name,
    children: group.members.filter(it => it.st.vEnd > 0).map(it => {
      const metricValue = it.isCash ? null : metric === 'last' ? it.st.lastR : it.st.ann;
      const col = divColor(metricValue, max);
      return { name: it.isCash ? 'Efectivo' : it.tk, value: it.st.vEnd, metric: metricValue, itemStyle: { color: col }, label: { color: inkOn(col) } };
    }),
  })).filter(group => group.children.length);
  chart('cTree').setOption(base({
    tooltip: Object.assign(base().tooltip, { formatter: param => {
      const head = ttHead(param.name) + ttRow(null, 'Valor', money(param.value)) + ttRow(null, 'Peso', pct(param.value / tot, 1));
      return !param.data || param.data.metric === undefined ? head : head + ttRow(null, metric === 'last' ? 'Último mes' : 'Anualizado', pct(param.data.metric, 2, true)); } }),
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
function renderRank() {
  const metric = state.rankMetric;
  setSeg('rankMetric', metric);
  const get = it => metric === 'ann' ? it.st.ann : metric === 'gain' ? it.st.gain : it.st.eff;
  const rows = model.ranked.filter(it => get(it) != null && (metric !== 'eff' || it.st.wAvg > 0.002)).map(it => ({ it, value: get(it) })).sort((left, right) => right.value - left.value);
  document.getElementById('rankHint').textContent = { ann: 'Rendimiento anualizado en el periodo', gain: 'Pesos generados en el periodo', eff: '% de las ganancias ÷ peso promedio. >1× = rindió más que su peso' }[metric];
  document.getElementById('retBasis').textContent = state.incDiv ? 'Incluye dividendos y distribuciones netas de ISR.' : 'Sólo plusvalías/minusvalías (sin dividendos).';
  const el = document.getElementById('cRank'); el.style.height = Math.max(300, rows.length * 22 + 40) + 'px';
  const chartInst = chart('cRank'); chartInst.resize();
  const fmt = metric === 'gain' ? moneyC : metric === 'eff' ? (value => value.toFixed(1) + '×') : (value => pct(value, 1, true));
  const ref = metric === 'eff' ? 1 : 0;
  chartInst.setOption(base({
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => { const it = rows[rows.length - 1 - param.dataIndex].it; return ttHead(`${it.tk} · ${it.name}`) + ttRow(null, 'Anualizado', pct(it.st.ann, 2, true)) + ttRow(null, 'Acumulado', pct(it.st.cum, 1, true)) + ttRow(null, 'Ganancia', money(it.st.gain)) + ttRow(null, 'Peso promedio', pct(it.st.wAvg, 1)) + ttRow(null, '% de las ganancias', pct(it.st.gainShare, 1)) + ttRow(null, 'Meses', it.st.nm); } }),
    xAxis: valAxis(metric === 'gain' ? moneyC : metric === 'eff' ? (value => value + '×') : (value => (value * 100).toFixed(0) + '%')),
    yAxis: catAxis(rows.map(row => row.it.tk).reverse(), { axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [{
      type: 'bar', barMaxWidth: 14,
      data: rows.map(row => ({ value: row.value, itemStyle: { color: row.value >= ref ? TK.pos : TK.neg, opacity: row.it.st.nm < 12 ? 0.4 : 1, borderRadius: row.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })).reverse(),
      label: { show: true, position: 'right', color: TK.muted, fontSize: 10, formatter: param => fmt(param.value) },
      markLine: metric === 'eff' ? { symbol: 'none', silent: true, lineStyle: { color: TK.axis, type: 'solid' }, label: { show: false }, data: [{ xAxis: 1 }] } : undefined,
    }],
  }), true);
}

function renderScatter() {
  const pts = model.ranked.filter(it => it.st.vol != null && it.st.ann != null);
  const tot = model.V[model.rangeEnd];
  const maxV = Math.max(...pts.map(it => Math.max(it.st.vEnd, it.st.wAvg * tot)), 1);
  const series = DIMS.riesgo.values.map(rv => ({
    name: rv, type: 'scatter', labelLayout: { hideOverlap: true },
    itemStyle: { color: colorFor('riesgo', rv), borderColor: TK.surface, borderWidth: 2, opacity: 0.9 },
    data: pts.filter(it => it.cls.riesgo === rv).map(it => {
      const size = Math.max(it.st.vEnd, it.st.wAvg * tot);
      return { value: [it.st.vol, it.st.ann], name: it.tk, it, symbolSize: 10 + 34 * Math.sqrt(size / maxV), label: { show: true, formatter: it.tk, position: 'right', color: TK.ink2, fontSize: 10 } };
    }),
  }));
  chart('cScatter').setOption(base({
    legend: legend(),
    grid: { left: 8, right: 24, top: document.getElementById('cScatter').clientWidth < 480 ? 58 : 36, bottom: 26, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => { const it = param.data.it; return ttHead(`${it.tk} · ${it.name}`) + ttRow(null, 'Anualizado', pct(it.st.ann, 2, true)) + ttRow(null, 'Volatilidad anual', pct(it.st.vol, 1)) + ttRow(null, 'Valor al cierre', money(it.st.vEnd)) + ttRow(null, 'Meses', it.st.nm); } }),
    xAxis: valAxis(value => (value * 100).toFixed(0) + '%', { name: 'Volatilidad', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: TK.muted, fontSize: 11 } }),
    yAxis: valAxis(value => (value * 100).toFixed(0) + '%'),
    series,
  }), true);
}

function renderHeat() {
  const gran = state.heatGran, qs = buckets(model.retIdx, gran);
  const heatMax = { m: 0.05, q: DIV_MAX, y: 0.25 }[gran];
  setSeg('heatGran', gran);
  document.getElementById('heatHint').textContent = `Rendimiento de cada instrumento en cada ${({ m: 'mes', q: 'trimestre', y: 'año' })[gran]}` + (gran === 'm' ? '' : ' (meses encadenados; el último periodo puede estar incompleto)');
  rampLegend(document.getElementById('heatLegend'), heatMax, '');
  const qRet = (it, bk) => { let cum = 1, any = false; bk.idx.forEach(monthIdx => { const ret = monthReturn(model.rec[it.tk][monthIdx]); if (ret != null) { cum *= 1 + ret; any = true; } }); return any ? cum - 1 : null; };
  const rows = model.ranked.filter(it => qs.some(bk => qRet(it, bk) != null))
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
      return ttHead(`${it.tk} · ${bucketLabel(bk.key, gran)}`) + ttRow(null, 'Rendimiento', pct(param.value[2], 2, true)) + ttRow(null, 'Generado', money(gen)) + ttRow(null, 'Valor al cierre', money(model.valOf(it.tk, bk.idx[bk.idx.length - 1]))); } }),
    xAxis: catAxis(qs.map(bk => bucketLabel(bk.key, gran)), { position: 'top', splitArea: { show: false } }),
    yAxis: catAxis(rows.map(it => it.tk), { inverse: true, axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [{ type: 'heatmap', data, itemStyle: { borderColor: TK.surface, borderWidth: gran === 'm' ? 1 : 2, borderRadius: gran === 'm' ? 2 : 3 },
      label: { show: window.innerWidth > 900 && qs.length <= 26, fontSize: 9, formatter: param => (param.value[2] * 100).toFixed(1) },
      emphasis: { itemStyle: { borderColor: TK.ink, borderWidth: 1 } } }],
  }), true);
}
