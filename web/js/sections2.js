/* ============================== Riesgo vs. rendimiento por perfil ============================== */
const RISK = DIMS.riesgo.values;
// Rendimiento mensual de cada perfil (sin efectivo) y su peso al cierre sobre lo invertido
function profileSeries(mm) {
  const groups = mm.groupBy('riesgo');
  const invested = mm.ranked.reduce((sum, it) => sum + Math.max(it.st.vEnd, 0), 0) || 1;
  return RISK.map(name => {
    const group = groups.find(item => item.name === name);
    const weight = group ? group.members.filter(it => !it.isCash).reduce((sum, it) => sum + Math.max(it.st.vEnd, 0), 0) / invested : 0;
    return { name, group, weight, rs: mm.retIdx.map(monthIdx => group ? group.ret[monthIdx] : null) };
  });
}
const portStats = mm => seriesStats(mm.retIdx.map(monthIdx => mm.R[monthIdx]));
function renderRisk() {
  document.getElementById('rfIn').value = (state.rf * 100).toFixed(2);
  const { MD, MP } = model.alt;
  const pD = profileSeries(MD), pP = profileSeries(MP), pM = profileSeries(model);
  const rows = pM.map((profile, index) => ({ name: profile.name, weight: profile.weight, sD: seriesStats(pD[index].rs), sP: seriesStats(pP[index].rs), stats: seriesStats(profile.rs) }));
  const total = { sD: portStats(MD), sP: portStats(MP), stats: portStats(model) };
  const cells = row => td(row.sD?.ann, pct(row.sD?.ann, 1, true), cls(row.sD?.ann)) + td(row.sP?.ann, pct(row.sP?.ann, 1, true)) + td(row.sD && row.sP ? row.sD.ann - row.sP.ann : null, row.sD && row.sP ? pct(row.sD.ann - row.sP.ann, 1, true) : '—') +
    td(row.stats?.vol, pct(row.stats?.vol, 1)) + td(row.stats?.mdd, pct(row.stats?.mdd, 1), 'down') + td(row.stats?.worst, pct(row.stats?.worst, 1, true), cls(row.stats?.worst)) +
    td(row.stats?.negPct, row.stats ? `${pct(row.stats.negPct, 0)} (${Math.round(row.stats.negPct * row.stats.count)}/${row.stats.count})` : '—') + td(row.stats?.sharpe, row.stats?.sharpe != null ? row.stats.sharpe.toFixed(2) : '—');
  document.getElementById('riskTbl').innerHTML = thead([['Perfil', 1], ['Peso hoy'], ['Rend. total anual'], ['Por precio'], ['Por dividendos'], ['Volatilidad'], ['Peor caída'], ['Peor mes'], ['Meses negativos'], ['Sharpe']]) + '<tbody>' +
    rows.filter(row => row.weight > 0 || row.stats).map(row => '<tr>' + td(row.name, sw(colorFor('riesgo', row.name)) + esc(row.name), 'l') + td(row.weight, pct(row.weight, 0)) + cells(row) + '</tr>').join('') + '</tbody>' +
    '<tfoot><tr>' + td('Portafolio total', 'Portafolio total (con efectivo)', 'l') + td(1, '100%') + cells(total) + '</tr></tfoot>';
  sortable('riskTbl');
  document.getElementById('riskNote').textContent = `Meses con rendimiento en el periodo: ${model.retIdx.length}. "Peso hoy" es sobre lo invertido (sin efectivo). "Rend. total" incluye dividendos netos; volatilidad, peor caída, peor mes y Sharpe siguen la casilla de dividendos (${state.incDiv ? 'incluidos' : 'sin dividendos'}). Sharpe = (rendimiento anual − ${pct(state.rf, 2)}) ÷ volatilidad.`;
  renderSim(pM);
  renderVolatility(pM);
  renderFrontier(pM);
}
const mixReturns = (pM, weights) => model.retIdx.map((monthIdx, pos) => pM.reduce((sum, profile) => sum + (weights[profile.name] || 0) * (profile.rs[pos] ?? 0), 0));
function renderSim(pM) {
  const tot = model.V[model.rangeEnd], sim = state.sim;
  ['simFrom', 'simTo'].forEach(id => { document.getElementById(id).innerHTML = RISK.map(profile => `<option${profile === (id === 'simFrom' ? sim.from : sim.to) ? ' selected' : ''}>${profile}</option>`).join(''); });
  document.getElementById('simPct').value = sim.pct; document.getElementById('simPctLbl').textContent = sim.pct + '%';
  const w0 = Object.fromEntries(pM.map(profile => [profile.name, profile.weight]));
  const moved = Math.min(sim.pct / 100, w0[sim.from] || 0);
  const w1 = { ...w0 }; if (sim.from !== sim.to) { w1[sim.from] -= moved; w1[sim.to] += moved; }
  const rA = mixReturns(pM, w0), rB = mixReturns(pM, w1), current = seriesStats(rA), simulated = seriesStats(rB);
  document.getElementById('simInfo').innerHTML = `Pesos: ${RISK.map(profile => `${esc(profile)} ${pct(w0[profile], 0)} → <b>${pct(w1[profile], 0)}</b>`).join(' · ')}` + (moved < sim.pct / 100 ? ` <span class="down">(sólo hay ${pct(w0[sim.from], 0)} en ${esc(sim.from)})</span>` : '') + ` · ${moneyC(moved * tot)} movidos`;
  if (!current || !simulated) { document.getElementById('simKpis').innerHTML = '<div class="kpi">Se necesitan al menos 3 meses.</div>'; return; }
  const arrow = (before, after, fmt, better) => { const delta = after - before; const good = better === 'up' ? delta > 0 : delta < 0; return `${fmt(before)} → <span class="${Math.abs(delta) < 1e-9 ? '' : good ? 'up' : 'down'}">${fmt(after)}</span>`; };
  const p1 = value => pct(value, 1), p1s = value => pct(value, 1, true);
  document.getElementById('simKpis').innerHTML = [
    { label: 'Rendimiento anual', value: arrow(current.ann, simulated.ann, p1s, 'up'), detail: `≈ ${(simulated.ann - current.ann) >= 0 ? '+' : '−'}${moneyC(Math.abs(simulated.ann - current.ann) * tot)} al año sobre ${moneyC(tot)}` },
    { label: 'Volatilidad', value: arrow(current.vol, simulated.vol, p1, 'down'), detail: 'anual, de rendimientos mensuales' },
    { label: 'Peor caída', value: arrow(current.mdd, simulated.mdd, p1, 'up'), detail: `≈ ${moneyC(Math.abs(simulated.mdd) * tot)} en el peor momento` },
    { label: 'Peor mes', value: arrow(current.worst, simulated.worst, p1s, 'up'), detail: `≈ ${moneyC(simulated.worst * tot)} en un mes` },
    { label: 'Meses negativos', value: arrow(current.negPct, simulated.negPct, value => pct(value, 0), 'down'), detail: `de ${current.count} meses` },
    { label: 'Sharpe', value: arrow(current.sharpe, simulated.sharpe, value => value == null ? '—' : value.toFixed(2), 'up'), detail: `con tasa libre de riesgo de ${pct(state.rf, 2)}` },
  ].map(tile => `<div class="kpi"><div class="k">${tile.label}</div><div class="v" style="font-size:20px">${tile.value}</div><div class="d">${tile.detail}</div></div>`).join('');
  const idxSeries = rs => { let level = 100, pk = 100; const iv = [100], dd = [0]; rs.forEach(ret => { level *= 1 + ret; pk = Math.max(pk, level); iv.push(level); dd.push(level / pk - 1); }); return { iv, dd }; };
  const currentPath = idxSeries(rA), simulatedPath = idxSeries(rB);
  const labels = [ymLabel(YM[model.retIdx[0] - 1]), ...model.retIdx.map(monthIdx => ymLabel(YM[monthIdx]))];
  const cA = TK.muted, cB = TK.series[0];
  chart('cSim').setOption(base({
    legend: legend({ data: ['Mezcla actual', 'Mezcla simulada'] }),
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [{ left: 8, right: 56, top: legTop(34), height: '50%', containLabel: true }, { left: 8, right: 56, top: '72%', bottom: 8, containLabel: true }],
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const pointIdx = ps[0].dataIndex; return ttHead(labels[pointIdx]) + ttRow(cA, 'Mezcla actual', `${currentPath.iv[pointIdx].toFixed(1)} · caída ${pct(currentPath.dd[pointIdx], 1)}`) + ttRow(cB, 'Mezcla simulada', `${simulatedPath.iv[pointIdx].toFixed(1)} · caída ${pct(simulatedPath.dd[pointIdx], 1)}`); } }),
    xAxis: [catAxis(labels, { gridIndex: 0, boundaryGap: false, axisLabel: { show: false } }), catAxis(labels, { gridIndex: 1, boundaryGap: false })],
    yAxis: [valAxis(value => value.toFixed(0), { gridIndex: 0, scale: true }), valAxis(value => (value * 100).toFixed(0) + '%', { gridIndex: 1, splitNumber: 2, max: 0 })],
    series: [
      { name: 'Mezcla actual', type: 'line', data: currentPath.iv, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: cA }, itemStyle: { color: cA }, endLabel: { show: true, formatter: param => param.value.toFixed(0), color: TK.ink2 } },
      { name: 'Mezcla simulada', type: 'line', data: simulatedPath.iv, showSymbol: false, symbol: 'circle', lineStyle: { width: 2.5, color: cB }, itemStyle: { color: cB }, endLabel: { show: true, formatter: param => param.value.toFixed(0), color: TK.ink, fontWeight: 600 } },
      { name: 'Caída actual', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: currentPath.dd, showSymbol: false, lineStyle: { width: 1.5, color: cA }, itemStyle: { color: cA } },
      { name: 'Caída simulada', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: simulatedPath.dd, showSymbol: false, lineStyle: { width: 1.5, color: cB }, itemStyle: { color: cB }, areaStyle: { color: cB + '22' } },
    ],
  }), true);
}

// σ anual = desviación estándar mensual × √12. Aporte de cada perfil = peso × cov(perfil, mezcla) ÷ varianza de la mezcla.
function volatilityBreakdown(pM) {
  const weights = pM.map(profile => profile.weight);
  const monthly = pM.map(profile => profile.rs.map(ret => ret ?? 0));
  const mix = model.retIdx.map((monthIdx, pos) => pM.reduce((sum, profile, idx) => sum + weights[idx] * monthly[idx][pos], 0));
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const covariance = (left, right) => { const ml = mean(left), mr = mean(right); return left.reduce((sum, value, idx) => sum + (value - ml) * (right[idx] - mr), 0) / (left.length - 1); };
  const mixVar = covariance(mix, mix), mixSd = Math.sqrt(mixVar);
  const rows = pM.map((profile, idx) => {
    const ownSd = Math.sqrt(covariance(monthly[idx], monthly[idx])), cov = covariance(monthly[idx], mix);
    return { name: profile.name, weight: weights[idx], vol: ownSd * Math.sqrt(12), corr: ownSd && mixSd ? cov / (ownSd * mixSd) : null, contribution: mixVar ? weights[idx] * cov / mixVar : null };
  });
  const corrPairs = [];
  for (let left = 0; left < pM.length; left++) for (let right = left + 1; right < pM.length; right++) {
    const denom = Math.sqrt(covariance(monthly[left], monthly[left]) * covariance(monthly[right], monthly[right]));
    corrPairs.push({ pair: `${pM[left].name}–${pM[right].name}`, corr: denom ? covariance(monthly[left], monthly[right]) / denom : null });
  }
  return { rows, corrPairs, mix, monthlySd: mixSd, annualVol: mixSd * Math.sqrt(12), meanMonth: mean(mix), labels: model.retIdx.map(monthIdx => ymLabel(YM[monthIdx])), total: model.V[model.rangeEnd] };
}
function renderVolatility(pM) {
  if (model.retIdx.length < 3) { document.getElementById('volKpis').innerHTML = '<div class="kpi">Se necesitan al menos 3 meses.</div>'; return; }
  const vb = volatilityBreakdown(pM);
  const annualReturn = Math.pow(1 + vb.meanMonth, 12) - 1;
  const worstIdx = vb.mix.indexOf(Math.min(...vb.mix));
  document.getElementById('volKpis').innerHTML = [
    { label: 'Volatilidad anual de tu mezcla', value: pct(vb.annualVol, 2), detail: `= ${pct(vb.monthlySd, 2)} mensual × √12 · ${vb.mix.length} meses` },
    { label: 'Un mes "normal" (±1σ)', value: `${pct(vb.meanMonth - vb.monthlySd, 1, true)} a ${pct(vb.meanMonth + vb.monthlySd, 1, true)}`, detail: `≈ 2 de cada 3 meses · ${moneyC((vb.meanMonth - vb.monthlySd) * vb.total)} a ${moneyC((vb.meanMonth + vb.monthlySd) * vb.total)}` },
    { label: 'Un año "normal" (±1σ)', value: `${pct(annualReturn - vb.annualVol, 1, true)} a ${pct(annualReturn + vb.annualVol, 1, true)}`, detail: `≈ 2 de cada 3 años, con ${pct(annualReturn, 1, true)} de promedio` },
    { label: 'Peor mes de la mezcla', value: pct(vb.mix[worstIdx], 2, true), detail: `${vb.labels[worstIdx]} · ≈ ${moneyC(vb.mix[worstIdx] * vb.total)} con tu saldo de hoy` },
  ].map(tile => `<div class="kpi"><div class="k">${tile.label}</div><div class="v" style="font-size:20px">${tile.value}</div><div class="d">${tile.detail}</div></div>`).join('');
  document.getElementById('volTbl').innerHTML = thead([['Perfil', 1], ['Peso'], ['Volatilidad propia'], ['Correlación con tu mezcla'], ['Aporte a la volatilidad']]) + '<tbody>' +
    vb.rows.map(row => '<tr>' + td(row.name, sw(colorFor('riesgo', row.name)) + esc(row.name), 'l') + td(row.weight, pct(row.weight, 1)) + td(row.vol, pct(row.vol, 2)) + td(row.corr, row.corr == null || !isFinite(row.corr) ? '—' : row.corr.toFixed(2)) + td(row.contribution, `<b>${pct(row.contribution, 1)}</b>`) + '</tr>').join('') +
    `</tbody><tfoot><tr><td class="l">Mezcla</td><td>100%</td><td>${pct(vb.annualVol, 2)}</td><td>1.00</td><td>100%</td></tr></tfoot>`;
  sortable('volTbl');
  const top = [...vb.rows].sort((left, right) => right.contribution - left.contribution)[0];
  const sumOwn = vb.rows.reduce((sum, row) => sum + row.weight * row.vol, 0);
  document.getElementById('volWhy').innerHTML = `
    <p style="margin:4px 0"><b style="color:var(--ink)">Cómo se calcula.</b> Tomo tus pesos de hoy por perfil (${vb.rows.map(row => `${esc(row.name)} ${pct(row.weight, 0)}`).join(', ')}) y los aplico a los rendimientos de cada perfil en cada mes. La desviación estándar de esos ${vb.mix.length} rendimientos es ${pct(vb.monthlySd, 2)} mensual; anualizada (× √12) da <b>${pct(vb.annualVol, 2)}</b>.</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">De dónde viene.</b> <b>${esc(top.name)}</b> pesa ${pct(top.weight, 0)} pero aporta <b>${pct(top.contribution, 0)}</b> del riesgo. Si los perfiles se movieran juntos, la volatilidad sería ~${pct(sumOwn, 1)}; la diferencia es la diversificación (correlaciones: ${vb.corrPairs.map(pair => `${esc(pair.pair)} ${pair.corr == null || !isFinite(pair.corr) ? '—' : pair.corr.toFixed(2)}`).join(', ')}).</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">Qué la cambia.</b> El periodo seleccionado, la casilla de dividendos, los instrumentos excluidos y la columna Riesgo de la tabla de instrumentos.</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">Cuidado.</b> Son pocos años y pueden no incluir una crisis fuerte. Como referencia general, las acciones globales suelen moverse 15–20% al año y un portafolio balanceado 8–12%; por eso en FIRE conviene revisar también las curvas de 10% y 15%. Los instrumentos en dólares también se mueven con el tipo de cambio.</p>`;
  const lower = vb.meanMonth - vb.monthlySd, upper = vb.meanMonth + vb.monthlySd;
  chart('cVol').setOption(base({
    grid: { left: 8, right: 70, top: 16, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
      formatter: params => { const idx = params[0].dataIndex, value = vb.mix[idx]; return ttHead(vb.labels[idx]) + ttRow(null, 'Rendimiento de la mezcla', pct(value, 2, true)) + ttRow(null, 'Desviación vs. promedio', `${((value - vb.meanMonth) / vb.monthlySd).toFixed(1)} σ`) + ttRow(null, 'Con tu saldo de hoy', money(value * vb.total)); } }),
    xAxis: catAxis(vb.labels), yAxis: valAxis(value => (value * 100).toFixed(0) + '%'),
    series: [{ type: 'bar', barMaxWidth: 14, data: vb.mix.map(value => ({ value, itemStyle: { color: value >= 0 ? TK.pos : TK.neg, borderRadius: value >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } })),
      markArea: { silent: true, itemStyle: { color: TK.series[0] + '14' }, label: { show: false }, data: [[{ yAxis: lower }, { yAxis: upper }]] },
      markLine: { symbol: 'none', silent: true, lineStyle: { color: TK.ink2, width: 1, type: 'solid' }, label: { color: TK.ink2, fontSize: 10, position: 'end', formatter: param => param.name },
        data: [{ yAxis: vb.meanMonth, name: `prom. ${pct(vb.meanMonth, 1)}` }, { yAxis: upper, name: '+1σ' }, { yAxis: lower, name: '−1σ' }] } }],
  }), true);
  document.getElementById('volNote').textContent = `Barras: rendimiento mensual de tu mezcla actual. Franja: promedio ± 1 desviación estándar (${pct(lower, 1)} a ${pct(upper, 1)}).`;
}

function efficientFrontier(pM) {
  const profiles = pM.filter(profile => profile.rs.some(ret => ret != null));
  const monthly = profiles.map(profile => profile.rs.map(ret => ret ?? 0));
  const count = monthly[0].length;
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const means = monthly.map(values => mean(values) * 12);
  const cov = monthly.map(left => monthly.map(right => { const ml = mean(left), mr = mean(right); return left.reduce((sum, value, idx) => sum + (value - ml) * (right[idx] - mr), 0) / (count - 1) * 12; }));
  const evaluate = weights => { let ret = 0, variance = 0; weights.forEach((weight, i) => { ret += weight * means[i]; weights.forEach((other, j) => { variance += weight * other * cov[i][j]; }); }); const vol = Math.sqrt(Math.max(variance, 0)); return { weights, ret, vol, sharpe: vol ? (ret - state.rf) / vol : null }; };
  const mixes = [];
  if (profiles.length === 3) { for (let first = 0; first <= 100; first++) for (let second = 0; second <= 100 - first; second++) mixes.push(evaluate([first / 100, second / 100, (100 - first - second) / 100])); }
  else if (profiles.length === 2) { for (let first = 0; first <= 100; first++) mixes.push(evaluate([first / 100, 1 - first / 100])); }
  else return null;
  const bucketsMap = new Map();
  mixes.forEach(mixItem => { const bucket = Math.round(mixItem.vol * 1000); const best = bucketsMap.get(bucket); if (!best || mixItem.ret > best.ret) bucketsMap.set(bucket, mixItem); });
  const minVar = mixes.reduce((best, mixItem) => mixItem.vol < best.vol ? mixItem : best);
  const upper = []; [...bucketsMap.values()].sort((left, right) => left.vol - right.vol).filter(mixItem => mixItem.vol >= minVar.vol - 1e-9).forEach(mixItem => { if (!upper.length || mixItem.ret > upper[upper.length - 1].ret) upper.push(mixItem); });
  const tangency = mixes.filter(mixItem => mixItem.sharpe != null).reduce((best, mixItem) => mixItem.sharpe > best.sharpe ? mixItem : best);
  const sumW = profiles.reduce((sum, profile) => sum + profile.weight, 0) || 1;
  const current = evaluate(profiles.map(profile => profile.weight / sumW));
  const sameVol = upper.reduce((best, mixItem) => mixItem.vol <= current.vol + 1e-9 && mixItem.ret > best.ret ? mixItem : best, upper[0]);
  const sameRet = upper.find(mixItem => mixItem.ret >= current.ret - 1e-9) || upper[upper.length - 1];
  return { profiles, mixes, upper, minVar, tangency, current, sameVol, sameRet, means, count };
}
function renderFrontier(pM) {
  const ef = model.retIdx.length >= 6 ? efficientFrontier(pM) : null;
  if (!ef) { document.getElementById('effKpis').innerHTML = '<div class="kpi">Se necesitan al menos 6 meses y 2 perfiles de riesgo con inversiones.</div>'; document.getElementById('effWhy').innerHTML = ''; chart('cFrontier').clear(); return; }
  const names = ef.profiles.map(profile => profile.name);
  const mixLabel = mixItem => names.map((name, i) => `${name.slice(0, 4)}. ${pct(mixItem.weights[i], 0)}`).join(' · ');
  const gapRet = ef.sameVol.ret - ef.current.ret, gapVol = ef.current.vol - ef.sameRet.vol;
  document.getElementById('effKpis').innerHTML = [
    { label: 'Tu mezcla actual', value: `${pct(ef.current.ret, 1)} · σ ${pct(ef.current.vol, 1)}`, detail: mixLabel(ef.current) },
    { label: 'Misma volatilidad, en la frontera', value: `${pct(ef.sameVol.ret, 1)} <span class="${gapRet > 0.0005 ? 'up' : ''}" style="font-size:14px">(${pct(gapRet, 1, true)})</span>`, detail: mixLabel(ef.sameVol) },
    { label: 'Mismo rendimiento, en la frontera', value: `σ ${pct(ef.sameRet.vol, 1)} <span style="font-size:14px">(−${pct(Math.max(gapVol, 0), 1)})</span>`, detail: mixLabel(ef.sameRet) },
    { label: 'Máximo Sharpe (tangente)', value: `${pct(ef.tangency.ret, 1)} · σ ${pct(ef.tangency.vol, 1)}`, detail: `${mixLabel(ef.tangency)} · Sharpe ${ef.tangency.sharpe.toFixed(2)} vs ${ef.current.sharpe != null ? ef.current.sharpe.toFixed(2) : '—'} tuyo` },
  ].map(tile => `<div class="kpi"><div class="k">${tile.label}</div><div class="v" style="font-size:20px">${tile.value}</div><div class="d">${tile.detail}</div></div>`).join('');
  const point = (mixItem, name, color, size) => ({ name, type: 'scatter', data: [[mixItem.vol, mixItem.ret]], symbolSize: size, itemStyle: { color, borderColor: TK.surface, borderWidth: 2 }, z: 5, label: { show: true, formatter: name, position: 'right', color: TK.ink, fontSize: 11, fontWeight: 600 } });
  const sample = ef.mixes.filter((_, idx) => idx % 3 === 0);
  chart('cFrontier').setOption(base({
    legend: legend({ data: ['Mezclas posibles', 'Frontera eficiente'] }),
    grid: { left: 8, right: 70, top: legTop(34), bottom: 26, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => { const mixItem = param.seriesName === 'Frontera eficiente' ? ef.upper[param.dataIndex] : param.seriesName === 'Mezclas posibles' ? sample[param.dataIndex] : ({ 'Tú': ef.current, 'Mín. varianza': ef.minVar, 'Máx. Sharpe': ef.tangency })[param.seriesName];
      return ttHead(param.seriesName) + ttRow(null, 'Rendimiento anual', pct(mixItem.ret, 2)) + ttRow(null, 'Volatilidad', pct(mixItem.vol, 2)) + ttRow(null, 'Sharpe', mixItem.sharpe == null ? '—' : mixItem.sharpe.toFixed(2)) + names.map((name, i) => ttRow(colorFor('riesgo', name), name, pct(mixItem.weights[i], 0))).join(''); } }),
    xAxis: valAxis(value => (value * 100).toFixed(0) + '%', { name: 'Volatilidad', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: TK.muted, fontSize: 11 }, scale: true }),
    yAxis: valAxis(value => (value * 100).toFixed(0) + '%', { scale: true }),
    series: [
      { name: 'Mezclas posibles', type: 'scatter', data: sample.map(mixItem => [mixItem.vol, mixItem.ret]), symbolSize: 3, itemStyle: { color: TK.axis, opacity: 0.6 } },
      { name: 'Frontera eficiente', type: 'line', data: ef.upper.map(mixItem => [mixItem.vol, mixItem.ret]), symbol: 'none', lineStyle: { width: 2.5, color: TK.series[0] }, itemStyle: { color: TK.series[0] } },
      point(ef.minVar, 'Mín. varianza', TK.series[2], 10), point(ef.tangency, 'Máx. Sharpe', TK.series[3], 12), point(ef.current, 'Tú', TK.ink, 14),
    ],
  }), true);
  const distance = gapRet > 0.01 || gapVol > 0.01 ? 'lejos' : gapRet > 0.002 || gapVol > 0.002 ? 'relativamente cerca' : 'prácticamente sobre ella';
  document.getElementById('effWhy').innerHTML = `
    <h3 style="color:var(--ink)">¿Qué tan lejos estás del óptimo?</h3>
    <p style="margin:6px 0"><b style="color:var(--ink)">La idea.</b> Markowitz (1952): para cada nivel de riesgo existe una mezcla que da el mayor rendimiento posible; la curva que las une es la <b>frontera eficiente</b>. Cualquier punto debajo de ella es "ineficiente": podrías ganar más con el mismo riesgo, o lo mismo con menos riesgo, sólo cambiando las proporciones.</p>
    <p style="margin:6px 0"><b style="color:var(--ink)">Tu caso.</b> Estás <b>${distance}</b> de la frontera: con tu misma volatilidad (${pct(ef.current.vol, 1)}) la mejor mezcla histórica rinde ${pct(ef.sameVol.ret, 1)} (${pct(gapRet, 1, true)}), y para tu mismo rendimiento bastaba ${pct(ef.sameRet.vol, 1)} de volatilidad. La mezcla de máximo Sharpe (${mixLabel(ef.tangency)}) es la que más rendimiento extra sobre CETES dio por unidad de riesgo.</p>
    <p style="margin:6px 0"><b style="color:var(--ink)">Cómo leerlo con cuidado.</b> Se basa en ${ef.count} meses: medias y correlaciones históricas cambian mucho y la frontera "óptima" del pasado rara vez lo es en el futuro. No incluye impuestos, comisiones ni tu horizonte. Úsalo como diagnóstico ("¿algo me está costando riesgo sin pagarme?"), no como receta. No es una recomendación de inversión.</p>`;
}

/* ============================== Dividendos ============================== */
function renderDividends() {
  const gbm = model.gbm, totals = gbm.tot;
  document.getElementById('divCoverage').textContent = `${ymLabel(P.first)} a ${ymLabel(P.last)}; en el periodo seleccionado ${totals.months} meses`;
  const years = totals.months / 12;
  document.getElementById('divKpis').innerHTML = totals.months ? kpiHtml([
    { label: 'Distribuciones brutas', value: money(totals.gross), detail: `${totals.pays} pagos · ${moneyC(years ? totals.gross / years : 0)} al año` },
    { label: 'ISR retenido', value: `<span class="down">${money(-totals.isr)}</span>`, detail: `${pct(totals.gross ? -totals.isr / totals.gross : null, 1)} de lo bruto` },
    { label: 'Distribuciones netas', value: `<span class="up">${money(totals.net)}</span>`, detail: `≈ ${moneyC(totals.months ? totals.net / totals.months : 0)} al mes` },
    { label: 'Yield neto anualizado', value: pct(totals.yieldNet, 2), detail: `bruto ${pct(totals.yieldGross, 2)} · sobre ${moneyC(totals.avgRV)} promedio` },
    { label: 'Comisiones + IVA', value: money(-totals.com), detail: `${pct(totals.avgRV && years ? -totals.com / totals.avgRV / years : null, 2)} anual del valor invertido` },
    { label: 'Rendimiento reportado por GBM', value: `<span class="${cls(totals.gbmAnn)}">${pct(totals.gbmAnn, 2, true)}</span>`, detail: `anual · acumulado ${pct(totals.gbmCum, 1, true)} en ${totals.gbmMonths} meses` },
  ]) : '<div class="kpi">No hay meses en el periodo seleccionado.</div>';

  setSeg('divGran', state.divGran);
  const bks = buckets(gbm.idx, state.divGran);
  const agg = arr => bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + arr[monthIdx], 0));
  const catColor = { div: TK.series[0], fibra: TK.series[1], roc: TK.series[2], frac: TK.series[3], isr: TK.neg };
  const cats = DIST_CATS.filter(cat => gbm.idx.some(monthIdx => gbm.byCat[cat][monthIdx])).concat(['isr']);
  const netB = agg(gbm.net);
  const series = cats.map(cat => ({ name: CAT_INFO[cat], type: 'bar', stack: 'd', barMaxWidth: 26, data: agg(gbm.byCat[cat]).map(value => value || null), itemStyle: { color: catColor[cat], borderColor: TK.surface, borderWidth: 1 }, emphasis: { focus: 'series' } }));
  series.push({ name: 'Neto', type: 'line', data: netB, symbol: 'circle', symbolSize: 5, showSymbol: bks.length < 30, lineStyle: { width: 2, color: TK.ink }, itemStyle: { color: TK.ink }, z: 5 });
  chart('cDiv');
  htmlLegend('lgDiv', 'cDiv', series.map(seriesItem => ({ name: seriesItem.name, color: seriesItem.type === 'line' ? TK.ink : seriesItem.itemStyle.color })));
  charts.cDiv.setOption(base({
    legend: hiddenLegend(),
    grid: { left: 8, right: 12, top: 12, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
      formatter: ps => { const bucketIdx = ps[0].dataIndex, bk = bks[bucketIdx]; const rvAvg = bk.idx.reduce((sum, monthIdx) => sum + gbm.rv[monthIdx], 0) / bk.idx.length;
        const tk = {}; bk.idx.forEach(monthIdx => gbm.tks.forEach(stat => { if (stat.byM[monthIdx]) tk[stat.tk] = (tk[stat.tk] || 0) + stat.byM[monthIdx]; }));
        return ttHead(bucketLabel(bk.key, state.divGran)) + ps.filter(param => param.value).map(param => ttRow(param.color, param.seriesName, money(param.value))).join('') +
          `<div style="border-top:1px solid ${TK.grid};margin-top:4px;padding-top:4px">` + Object.entries(tk).sort((left, right) => right[1] - left[1]).map(([key, value]) => ttRow(null, nameOf(key), money(value))).join('') +
          ttRow(null, 'Yield anualizado del periodo', pct(rvAvg ? netB[bucketIdx] / rvAvg * 12 / bk.idx.length : null, 2)) + '</div>'; } }),
    xAxis: catAxis(bks.map(bk => bucketLabel(bk.key, state.divGran))), yAxis: valAxis(moneyC), series,
  }), true);

  const ttmIdx = gbm.idx.filter(monthIdx => gbm.ttm[monthIdx]);
  chart('cTTM').setOption(base({
    legend: legend({ data: ['Yield neto', 'Yield bruto'] }),
    grid: { left: 8, right: 48, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } }, formatter: ps => ttHead('12 meses a ' + ymLabel(YM[ttmIdx[ps[0].dataIndex]])) + ps.map(param => ttRow(param.color, param.seriesName, pct(param.value, 2))).join('') }),
    xAxis: catAxis(ttmIdx.map(monthIdx => ymLabel(YM[monthIdx])), { boundaryGap: false }), yAxis: valAxis(value => (value * 100).toFixed(1) + '%'),
    series: [
      { name: 'Yield neto', type: 'line', data: ttmIdx.map(monthIdx => gbm.ttm[monthIdx].net), showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] }, areaStyle: { color: TK.series[0] + '1f' }, endLabel: { show: true, formatter: param => pct(param.value, 2), color: TK.ink, fontWeight: 600 } },
      { name: 'Yield bruto', type: 'line', data: ttmIdx.map(monthIdx => gbm.ttm[monthIdx].gross), showSymbol: false, symbol: 'circle', lineStyle: { width: 1.5, color: TK.muted }, itemStyle: { color: TK.muted } },
    ],
  }), true);

  setSeg('divMetric', state.divMetric);
  const metric = state.divMetric;
  const rows = gbm.tks.filter(stat => stat.gross > 0 && stat.tk !== 'EFEC' && (metric === 'net' || stat.yield != null)).sort((left, right) => (metric === 'net' ? left.net - right.net : left.yield - right.yield));
  document.getElementById('divTkHint').textContent = metric === 'net' ? 'Pesos netos de ISR recibidos en el periodo' : 'Distribuciones netas ÷ valor promedio mientras lo tuviste, anualizado. Atenuados: menos de 6 meses.';
  document.getElementById('cDivTk').style.height = Math.max(260, rows.length * 26 + 30) + 'px';
  chart('cDivTk').resize();
  charts.cDivTk.setOption(base({
    grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => { const stat = rows[param.dataIndex];
      return ttHead(`${stat.tk} · ${clsOf(stat.tk).nombre}`) + DIST_CATS.filter(cat => stat.cats[cat]).map(cat => ttRow(null, CAT_INFO[cat], money(stat.cats[cat]))).join('') + ttRow(null, 'ISR retenido', money(stat.isr)) + ttRow(null, 'Neto', money(stat.net)) +
        ttRow(null, 'Valor promedio', money(stat.avg)) + ttRow(null, 'Meses invertido', stat.months) + ttRow(null, 'Pagos al año', stat.perYear.toFixed(1)) + ttRow(null, 'Yield bruto / neto', `${pct(stat.yieldGross, 2)} / ${pct(stat.yield, 2)}`) + (stat.esp ? ttRow(null, 'En especie (ya en el valor)', money(stat.esp)) : ''); } }),
    xAxis: valAxis(metric === 'net' ? moneyC : value => (value * 100).toFixed(0) + '%'),
    yAxis: catAxis(rows.map(row => row.tk), { axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [{ type: 'bar', barMaxWidth: 14, data: rows.map(row => ({ value: metric === 'net' ? row.net : row.yield, itemStyle: { color: TK.series[0], opacity: row.months < 6 ? 0.4 : 1, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: TK.muted, fontSize: 10, formatter: param => metric === 'net' ? moneyC(param.value) : pct(param.value, 1) } }],
  }), true);

  const calGran = state.calGran, qs = buckets(gbm.idx, calGran);
  setSeg('calGran', calGran);
  document.getElementById('calHint').textContent = `Distribuciones netas por ${({ m: 'mes', q: 'trimestre', y: 'año' })[calGran]} calendario`;
  const calRows = gbm.tks.filter(stat => stat.gross > 0 && stat.tk !== 'EFEC').sort((left, right) => right.net - left.net);
  const cells = []; let maxV = 0;
  calRows.forEach((stat, rowIdx) => qs.forEach((bk, colIdx) => { const value = bk.idx.reduce((sum, monthIdx) => sum + stat.byM[monthIdx], 0); if (value) { cells.push([colIdx, rowIdx, value]); maxV = Math.max(maxV, value); } }));
  document.getElementById('cDivCal').style.height = Math.max(260, calRows.length * 26 + 50) + 'px';
  chart('cDivCal').resize();
  charts.cDivCal.setOption(base({
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => ttHead(`${calRows[param.value[1]].tk} · ${bucketLabel(qs[param.value[0]].key, calGran)}`) + ttRow(null, 'Neto', money(param.value[2])) }),
    xAxis: catAxis(qs.map(bk => bucketLabel(bk.key, calGran)), { position: 'top' }),
    yAxis: catAxis(calRows.map(stat => stat.tk), { inverse: true, axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [{ type: 'heatmap', itemStyle: { borderColor: TK.surface, borderWidth: 2, borderRadius: 3 },
      data: cells.map(([colIdx, rowIdx, amount]) => ({ value: [colIdx, rowIdx, amount], itemStyle: { color: amount > 0 ? mix(TK.surface2, TK.series[0], 0.15 + 0.85 * Math.sqrt(amount / (maxV || 1))) : TK.neg } })) }],
  }), true);

  // Rendimiento que reporta GBM (incluye meses previos al primer estado si el periodo empieza en el primero)
  const lo = state.from === 0 ? '0000-00' : YM[state.from], hi = YM[state.to];
  const rKeys = Object.keys(P.returns).filter(key => key >= lo && key <= hi).sort();
  const rets = rKeys.map(key => P.returns[key][1]);
  let ci = 100; const index = rets.map(ret => (ci *= 1 + ret));
  const labs = rKeys.map(ymLabel);
  chart('cGbmRet').setOption(base({
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [{ left: 8, right: 40, top: 12, height: '50%', containLabel: true }, { left: 8, right: 40, top: '68%', bottom: 8, containLabel: true }],
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const pos = ps[0].dataIndex, reported = P.returns[rKeys[pos]], own = model.R[YM.indexOf(rKeys[pos])];
        return ttHead(labs[pos]) + ttRow(null, 'Rendimiento neto (GBM)', pct(reported[1], 2, true)) + ttRow(null, 'Rendimiento bruto (GBM)', pct(reported[0], 2, true)) + (own != null ? ttRow(null, 'Calculado aquí', pct(own, 2, true)) : '') + ttRow(null, 'En pesos (neto)', money(reported[3])) + ttRow(null, 'Índice acumulado', index[pos].toFixed(1)); } }),
    xAxis: [catAxis(labs, { gridIndex: 0, axisLabel: { show: false } }), catAxis(labs, { gridIndex: 1 })],
    yAxis: [valAxis(value => value.toFixed(0), { gridIndex: 0, scale: true }), valAxis(value => (value * 100).toFixed(0) + '%', { gridIndex: 1, splitNumber: 2 })],
    series: [
      { name: 'Índice', type: 'line', data: index, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] }, areaStyle: { color: TK.series[0] + '1f' }, endLabel: { show: true, formatter: param => param.value.toFixed(0), color: TK.ink, fontWeight: 600 } },
      { name: 'Mensual', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 10, data: rets.map(ret => ({ value: ret, itemStyle: { color: ret >= 0 ? TK.pos : TK.neg } })) },
    ],
  }), true);

  const yrs = [...new Set(gbm.idx.map(monthIdx => YM[monthIdx].slice(0, 4)))];
  const byY = arr => yrs.map(year => gbm.idx.filter(monthIdx => YM[monthIdx].startsWith(year)).reduce((sum, monthIdx) => sum + arr[monthIdx], 0));
  chart('cCosts').setOption(base({
    legend: legend({ data: ['Comisiones + IVA', 'ISR retenido'] }),
    grid: { left: 8, right: 8, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } }, formatter: ps => ttHead(yrs[ps[0].dataIndex]) + ps.map(param => ttRow(param.color, param.seriesName, money(param.value))).join('') }),
    xAxis: catAxis(yrs), yAxis: valAxis(moneyC),
    series: [
      { name: 'Comisiones + IVA', type: 'bar', barMaxWidth: 22, data: byY(gbm.com).map(value => -value), itemStyle: { color: TK.series[1], borderRadius: [4, 4, 0, 0] } },
      { name: 'ISR retenido', type: 'bar', barMaxWidth: 22, data: byY(gbm.byCat.isr).map(value => -value), itemStyle: { color: TK.series[6], borderRadius: [4, 4, 0, 0] } },
    ],
  }), true);
  document.getElementById('costNote').textContent = `Premio cobrado por el efectivo en reporto en el periodo: ${money(totals.intr)}.`;

  const trs = gbm.tks.filter(stat => stat.gross || stat.isr).sort((left, right) => right.net - left.net);
  const cats2 = DIST_CATS.filter(cat => trs.some(stat => stat.cats[cat]));
  document.getElementById('divTbl').innerHTML = thead([['Instrumento', 1], ...cats2.map(cat => [CAT_INFO[cat]]), ['ISR retenido'], ['Neto'], ['Valor prom.'], ['Meses'], ['Pagos/año'], ['Yield bruto'], ['Yield neto'], ['En especie']]) + '<tbody>' +
    trs.map(stat => '<tr>' + td(stat.tk, `<b style="font-weight:600">${esc(nameOf(stat.tk))}</b>`, 'l') + cats2.map(cat => td(stat.cats[cat] || null, stat.cats[cat] ? money(stat.cats[cat]) : '—')).join('') +
      td(stat.isr, money(stat.isr), 'down') + td(stat.net, `<b>${money(stat.net)}</b>`) + td(stat.avg || null, stat.avg ? money(stat.avg) : '—') + td(stat.months || null, stat.months || '—') + td(stat.perYear || null, stat.perYear ? stat.perYear.toFixed(1) : '—') +
      td(stat.yieldGross, pct(stat.yieldGross, 2)) + td(stat.yield, pct(stat.yield, 2)) + td(stat.esp || null, stat.esp ? money(stat.esp) : '—') + '</tr>').join('') +
    `</tbody><tfoot><tr><td class="l">Total</td>` + cats2.map(cat => `<td>${money(gbm.idx.reduce((sum, monthIdx) => sum + gbm.byCat[cat][monthIdx], 0))}</td>`).join('') +
    `<td class="down">${money(totals.isr)}</td><td>${money(totals.net)}</td><td>${money(totals.avgRV)}</td><td>${totals.months}</td><td></td><td>${pct(totals.yieldGross, 2)}</td><td>${pct(totals.yieldNet, 2)}</td><td></td></tr></tfoot>`;
  sortable('divTbl');
  renderFrequency();
  renderUpcoming();
}

const FREQ_ORDER = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual', 'irregular', 'pocos datos', 'no paga'];
// Frecuencia observada de pago de cada instrumento, con los meses del año en que pagó (últimos 24 meses al cierre del periodo)
function paymentFrequency() {
  const end = model.rangeEnd, lastYm = YM[end], from12 = addMonths(lastYm, -11), from24 = addMonths(lastYm, -23);
  const tks = new Set(Object.keys(MONTHS[end].hold));
  MONTHS.forEach(month => Object.keys(month.flows).forEach(tk => { if (month.ym >= from24 && month.ym <= lastYm && distNetOf(month.flows[tk]) > 0) tks.add(tk); }));
  return [...tks].filter(tk => tk !== 'EFEC' && !state.excl.includes(tk)).map(tk => {
    const paid12 = new Set(), byMonth = new Array(12).fill(0); let net12 = 0, last = null, heldMonths = 0;
    MONTHS.forEach(month => {
      if (month.ym < from24 || month.ym > lastYm) return;
      if (month.ym >= from12 && month.hold[tk] && month.hold[tk][1] > 0) heldMonths++;
      const net = month.flows[tk] ? distNetOf(month.flows[tk]) : 0;
      if (net <= 0) return;
      byMonth[+month.ym.slice(5) - 1] += 1;
      if (month.ym >= from12) { paid12.add(month.ym); net12 += net; }
      last = { ym: month.ym, net };
    });
    const count = paid12.size;
    let freq = count >= 9 ? 'mensual' : count === 6 ? 'bimestral' : count >= 3 && count <= 5 ? 'trimestral' : count === 2 ? 'semestral' : count === 1 ? 'anual' : count ? 'irregular' : 'no paga';
    const cal = divCalOf(tk).dividendos;
    let source = 'historial';
    if (heldMonths < 12 && cal && cal.frecuencia) { freq = cal.frecuencia; source = count ? 'historial corto + IA' : 'IA'; }
    else if (heldMonths < 12) { freq = 'pocos datos'; source = `${heldMonths} meses de historial · usa “Completar con IA”`; }
    const aiMonths = cal && cal.meses_pago ? cal.meses_pago : [];
    return { tk, freq, count, byMonth, aiMonths, net12, last, source, held: !!(MONTHS[end].hold[tk] && MONTHS[end].hold[tk][1] > 0), cal };
  }).filter(row => row.count || row.cal || row.held)
    .sort((left, right) => FREQ_ORDER.indexOf(left.freq) - FREQ_ORDER.indexOf(right.freq) || right.net12 - left.net12);
}
function renderFrequency() {
  const rows = paymentFrequency();
  const groups = FREQ_ORDER.map(freq => [freq, rows.filter(row => row.freq === freq)]).filter(([, list]) => list.length);
  document.getElementById('freqHint').textContent = groups.map(([freq, list]) => `${freq[0].toUpperCase() + freq.slice(1)}: ${list.map(row => row.tk).join(', ')}`).join(' · ') || 'Sin pagos en los últimos 24 meses.';
  const strip = row => '<span class="mstrip">' + MES.map((name, idx) => {
    const paid = row.byMonth[idx], ai = row.aiMonths.includes(idx + 1);
    return `<i class="${paid ? 'p' : ai ? 'a' : ''}" title="${name}${paid ? `: pagó ${paid} vez/veces en 24 meses` : ai ? ': según el calendario importado' : ''}">${name[0].toUpperCase()}</i>`;
  }).join('') + '</span>';
  document.getElementById('freqTbl').innerHTML = thead([['Instrumento', 1], ['Frecuencia', 1], ['Meses en que paga', 1], ['Pagos en 12 m'], ['Neto 12 m'], ['Último pago'], ['Yield aprox. (IA)'], ['Fuente', 1]]) + '<tbody>' +
    rows.map(row => '<tr' + (row.held ? '' : ' class="closed"') + '>' + td(row.tk, `<b style="font-weight:600">${esc(row.tk)}</b> <span style="color:var(--muted)">${esc(clsOf(row.tk).nombre)}</span>`, 'l') +
      td(FREQ_ORDER.indexOf(row.freq), `<span class="freq f-${row.freq.replace(/ /g, '-')}">${row.freq}</span>`, 'l') + `<td class="l">${strip(row)}</td>` +
      td(row.count, row.count || '—') + td(row.net12, row.net12 ? money(row.net12) : '—') + td(row.last ? row.last.ym : null, row.last ? `${ymLabel(row.last.ym)} · ${money(row.last.net)}` : '—') +
      td(row.cal && row.cal.yield_anual_aprox != null ? row.cal.yield_anual_aprox : null, row.cal && row.cal.yield_anual_aprox != null ? pct(row.cal.yield_anual_aprox, 1) : '—') + td(row.source, row.source, 'l') + '</tr>').join('') + '</tbody>';
  sortable('freqTbl');
}

function upcomingDistributions() {
  const lastYm = P.last, windowStart = addMonths(lastYm, -11), today = new Date().toISOString().slice(0, 7);
  const netByTkYm = {};
  MONTHS.forEach(month => Object.entries(month.flows).forEach(([tk, flow]) => { if (tk === 'EFEC' || state.excl.includes(tk)) return; const net = distNetOf(flow); if (net) (netByTkYm[tk] = netByTkYm[tk] || {})[month.ym] = (netByTkYm[tk][month.ym] || 0) + net; }));
  const current = MONTHS[MONTHS.length - 1].hold;
  const rows = [];
  Object.entries(netByTkYm).forEach(([tk, byYm]) => {
    if (!(current[tk] && current[tk][1] > 0)) return;
    const recent = Object.entries(byYm).filter(([ym, net]) => ym >= windowStart && net > 0).sort();
    if (!recent.length) return;
    const lastPaid = recent[recent.length - 1];
    recent.forEach(([ym, net]) => {
      let next = addMonths(ym, 12); while (next <= lastYm) next = addMonths(next, 12);
      const then = MONTHS[YM.indexOf(ym)].hold[tk];
      const growth = then && then[1] ? Math.min(Math.max(current[tk][1] / then[1], 0.2), 5) : 1;
      rows.push({ tk, ym: next, estimate: net * growth, lastYm: lastPaid[0], lastNet: lastPaid[1], perYear: recent.length, overdue: next < today });
    });
  });
  // Instrumentos sin pagos recientes pero con calendario (de la IA o de private/instruments.json): valor × yield ÷ pagos
  const covered = new Set(rows.map(row => row.tk));
  Object.entries(current).forEach(([tk, holding]) => {
    if (covered.has(tk) || !(holding[1] > 0)) return;
    const cal = divCalOf(tk).dividendos;
    if (!cal || !cal.meses_pago || !cal.meses_pago.length || !cal.yield_anual_aprox) return;
    const isr = (P.instruments[tk] || {}).section === 'SIC' ? 0.10 : 0;     // ISR 10% de dividendos del SIC; FIBRAs: depende del resultado fiscal
    cal.meses_pago.forEach(monthNum => {
      let next = `${lastYm.slice(0, 4)}-${String(monthNum).padStart(2, '0')}`; while (next <= lastYm) next = addMonths(next, 12);
      rows.push({ tk, ym: next, estimate: holding[1] * cal.yield_anual_aprox / cal.meses_pago.length * (1 - isr), lastYm: null, lastNet: null, perYear: cal.meses_pago.length, fromCal: true });
    });
  });
  return rows.sort((left, right) => left.ym < right.ym ? -1 : left.ym > right.ym ? 1 : right.estimate - left.estimate);
}
function verifyLink(tk) {
  const info = P.instruments[tk] || {};
  if (info.section === 'SIC') return `<a href="https://www.nasdaq.com/market-activity/${clsOf(tk).tipo === 'ETF' ? 'etf' : 'stocks'}/${encodeURIComponent(tk.toLowerCase())}/dividend-history" target="_blank" rel="noopener">Historial (Nasdaq)</a>`;
  return '<a href="https://www.bmv.com.mx/" target="_blank" rel="noopener">BMV (eventos relevantes)</a>';
}
function renderUpcoming() {
  const rows = upcomingDistributions();
  const total12 = rows.reduce((sum, row) => sum + row.estimate, 0);
  document.getElementById('nextHint').textContent = `Con base en tus estados de cuenta hasta ${ymLabel(P.last)}. Próximos 12 meses estimados: ${money(total12)} netos.`;
  const byMonth = {}; rows.forEach(row => { byMonth[row.ym] = (byMonth[row.ym] || 0) + row.estimate; });
  document.getElementById('nextKpis').innerHTML = Object.keys(byMonth).sort().slice(0, 4).map(ym => `<div class="kpi"><div class="k">${ymLabel(ym)}</div><div class="v" style="font-size:20px">${money(byMonth[ym])}</div><div class="d">${rows.filter(row => row.ym === ym).map(row => esc(row.tk)).join(', ')}</div></div>`).join('');
  document.getElementById('nextTbl').innerHTML = thead([['Mes estimado', 1], ['Instrumento', 1], ['Monto neto estimado'], ['Pagos al año'], ['Último pago'], ['Dónde verificar', 1]]) + '<tbody>' +
    rows.map(row => '<tr>' + td(row.ym, ymLabel(row.ym), 'l') + td(row.tk, `<b style="font-weight:600">${esc(row.tk)}</b> <span style="color:var(--muted)">${esc(clsOf(row.tk).nombre)}</span>`, 'l') + td(row.estimate, money(row.estimate)) + td(row.perYear, row.perYear) + td(row.lastYm, row.fromCal ? '<span style="color:var(--muted)">sin pagos aún · calendario importado</span>' : `${ymLabel(row.lastYm)} · ${money(row.lastNet)}`) + `<td class="l">${verifyLink(row.tk)}</td></tr>`).join('') +
    `</tbody><tfoot><tr><td class="l">Total 12 meses</td><td></td><td>${money(total12)}</td><td></td><td></td><td></td></tr></tfoot>`;
  sortable('nextTbl');
}

/* ============================== Flujos ============================== */
function renderFlows() {
  const { retIdx, groupBy } = model;
  const dep = retIdx.reduce((sum, monthIdx) => sum + (MONTHS[monthIdx].ext.dep || 0), 0), wd = retIdx.reduce((sum, monthIdx) => sum + (MONTHS[monthIdx].ext.wd || 0), 0);
  const bought = model.ranked.reduce((sum, it) => sum + it.st.buys, 0), sold = model.ranked.reduce((sum, it) => sum + it.st.sells, 0);
  document.getElementById('flowKpis').innerHTML = kpiHtml([
    { label: 'Depósitos', value: `<span class="up">${money(dep)}</span>`, detail: `${retIdx.filter(monthIdx => MONTHS[monthIdx].ext.dep).length} meses con depósitos` },
    { label: 'Retiros', value: `<span class="down">${money(wd)}</span>`, detail: wd ? `${retIdx.filter(monthIdx => MONTHS[monthIdx].ext.wd).length} meses con retiros` : 'sin retiros' },
    { label: 'Ahorro neto', value: money(dep - wd), detail: `≈ ${moneyC(retIdx.length ? (dep - wd) / retIdx.length : 0)} al mes` },
    { label: 'Comprado / vendido', value: `${moneyC(bought)} / ${moneyC(sold)}`, detail: 'incluye fondos de inversión y eventos corporativos' },
  ]);
  setSeg('flowGran', state.flowGran); setSeg('flowBy', state.flowBy);
  const bks = buckets(retIdx, state.flowGran);
  const dimGroups = groupBy(state.dim).filter(group => group.members.some(it => !it.isCash));
  const byInst = state.flowBy === 'inst';
  const netOf = (tk, monthIdx) => model.rec[tk][monthIdx] ? model.rec[tk][monthIdx].buy - model.rec[tk][monthIdx].sell : 0;
  // Por instrumento: cada uno con un tono del color de su grupo (como en Composición)
  const groups = byInst ? dimGroups.flatMap(group => {
    const members = group.members.filter(it => !it.isCash && retIdx.some(monthIdx => netOf(it.tk, monthIdx)));
    const baseColor = colorFor(state.dim, group.name);
    return members.map((it, index) => ({ name: it.tk, color: members.length > 1 ? mix(baseColor, TK.surface, 0.6 * index / (members.length - 1)) : baseColor, flow: YM.map((ym, monthIdx) => netOf(it.tk, monthIdx)) }));
  }) : dimGroups.map(group => ({ name: group.name, color: colorFor(state.dim, group.name), flow: group.flow }));
  document.getElementById('flowHint').textContent = `Compras − ventas por ${byInst ? 'instrumento (color por ' + DIMS[state.dim].label.toLowerCase() + ')' : DIMS[state.dim].label.toLowerCase()}; la línea son tus depósitos − retiros`;
  const series = groups.map(group => ({ name: group.name, type: 'bar', stack: 'f', barMaxWidth: 24, itemStyle: { color: group.color, borderColor: TK.surface, borderWidth: 1 }, emphasis: { focus: 'series' },
    data: bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + group.flow[monthIdx], 0) || null) }));
  series.push({ name: 'Depósitos − retiros', type: 'line', data: bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + (MONTHS[monthIdx].ext.dep || 0) - (MONTHS[monthIdx].ext.wd || 0), 0)), symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: TK.ink }, itemStyle: { color: TK.ink }, z: 5 });
  chart('cFlows');
  htmlLegend('lgFlows', 'cFlows', series.map(seriesItem => ({ name: seriesItem.name, color: seriesItem.type === 'line' ? TK.ink : seriesItem.itemStyle.color })));
  charts.cFlows.setOption(base({
    legend: hiddenLegend(),
    grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
      formatter: ps => ttHead(bucketLabel(bks[ps[0].dataIndex].key, state.flowGran)) + ps.filter(param => param.value).sort((left, right) => right.value - left.value).map(param => ttRow(param.color, param.seriesName, money(param.value))).join('') }),
    xAxis: catAxis(bks.map(bk => bucketLabel(bk.key, state.flowGran))), yAxis: valAxis(moneyC), series,
  }), true);

  const rows = model.ranked.filter(it => it.st.buys > 0 || it.st.sells > 0).sort((left, right) => (left.st.buys + left.st.sells) - (right.st.buys + right.st.sells));
  document.getElementById('cInOut').style.height = Math.max(300, rows.length * 22 + 50) + 'px';
  const chartInst = chart('cInOut'); chartInst.resize();
  chartInst.setOption(base({
    legend: legend({ data: ['Comprado', 'Vendido'] }),
    grid: { left: 8, right: 16, top: legTop(32), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
      formatter: ps => { const it = rows[ps[0].dataIndex]; return ttHead(`${it.tk} · ${it.name}`) + ttRow(TK.pos, 'Comprado', money(it.st.buys)) + ttRow(TK.series[1], 'Vendido', money(it.st.sells)) + ttRow(null, 'Neto', money(it.st.net)) + ttRow(null, 'Ganancia', money(it.st.gain)); } }),
    xAxis: valAxis(moneyC), yAxis: catAxis(rows.map(it => it.tk), { axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [
      { name: 'Comprado', type: 'bar', stack: 'io', barMaxWidth: 14, itemStyle: { color: TK.pos, borderRadius: [0, 4, 4, 0] }, data: rows.map(it => it.st.buys || null) },
      { name: 'Vendido', type: 'bar', stack: 'io', barMaxWidth: 14, itemStyle: { color: TK.series[1], borderRadius: [4, 0, 0, 4] }, data: rows.map(it => it.st.sells ? -it.st.sells : null) },
    ],
  }), true);
}

/* ============================== Detalle ============================== */
const EVENT_LABEL = { compra: 'Compra', venta: 'Venta', div: 'Dividendo', fibra: 'Resultado fiscal', roc: 'Reembolso de capital', frac: 'Fracciones', isr: 'ISR', corp: 'Evento corporativo', especie: 'Dividendo en especie', especie_valor: 'Valor en especie', deposito_valores: 'Depósito de títulos', retiro_valores: 'Retiro de títulos', comision: 'Comisión', otro: 'Otro' };
function renderDetail() {
  const { idx, insts, rec, valOf } = model;
  const sel = document.getElementById('detSel');
  const sorted = [...insts].sort((left, right) => (right.active - left.active) || right.st.vEnd - left.st.vEnd);
  if (!state.detail || !insts.find(it => it.tk === state.detail)) state.detail = sorted[0].tk;
  sel.innerHTML = sorted.map(it => `<option value="${esc(it.tk)}"${it.tk === state.detail ? ' selected' : ''}>${esc(it.isCash ? it.name : `${it.tk} · ${it.name}`)}${it.active ? '' : ' (cerrado)'}</option>`).join('');
  const it = insts.find(inst => inst.tk === state.detail), st = it.st;
  document.getElementById('detTitle').textContent = it.isCash ? it.name : `${it.tk} ${it.serie} · ${it.name}`;
  document.getElementById('detHint').textContent = `${it.cls.tipo} · ${it.cls.clase} · ${it.cls.region} · ${it.cls.riesgo} · ${it.cls.moneda}` + (it.first ? ` · en tus estados desde ${ymLabel(it.first)}` : '');
  document.getElementById('detStats').innerHTML = [
    ['Valor al cierre', money(st.vEnd)], ['Títulos', st.tit != null ? st.tit.toLocaleString('es-MX') : '—'], ['Peso al cierre', pct(st.wEnd, 1)], ['Peso promedio', pct(st.wAvg, 1)],
    ['Anualizado', `<span class="${cls(st.ann)}">${pct(st.ann, 2, true)}</span>`], ['Acumulado', `<span class="${cls(st.cum)}">${pct(st.cum, 1, true)}</span>`],
    ['Ganancia $', `<span class="${cls(st.gain)}">${money(st.gain)}</span>`], ['Comprado', money(st.buys)], ['Vendido', money(st.sells)],
    ['Dividendos netos', st.dist ? money(st.dist) : '—'], ['Volatilidad anual', pct(st.vol, 1)],
    ['Mejor mes', st.best ? `${ymLabel(YM[st.best.monthIdx])} ${pct(st.best.ret, 1, true)}` : '—'], ['Peor mes', st.worst ? `${ymLabel(YM[st.worst.monthIdx])} ${pct(st.worst.ret, 1, true)}` : '—'],
  ].map(stat => `<div><div class="k">${stat[0]}</div><div class="v">${stat[1]}</div></div>`).join('');
  const labels = [], value = [], aport = [], rets = [];
  let ap = null;
  idx.forEach(monthIdx => {
    labels.push(ymLabel(YM[monthIdx])); value.push(valOf(it.tk, monthIdx));
    const entry = rec[it.tk][monthIdx];
    if (ap == null) ap = entry && !entry.base ? entry.ini : 0;
    if (entry) ap += entry.ing;
    aport.push(ap);
    rets.push(entry && !entry.base && !it.isCash ? monthReturn(entry) : null);
  });
  chart('cDetail').setOption(base({
    legend: legend({ data: ['Valor', 'Capital aportado neto'] }),
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [{ left: 8, right: 16, top: legTop(34), height: '52%', containLabel: true }, { left: 8, right: 16, top: '70%', bottom: 8, containLabel: true }],
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const offset = ps[0].dataIndex; return ttHead(labels[offset]) + ttRow(TK.series[0], 'Valor', money(value[offset])) + ttRow(TK.series[1], 'Capital aportado neto', money(aport[offset])) + (rets[offset] != null ? ttRow(null, 'Rendimiento del mes', pct(rets[offset], 2, true)) : ''); } }),
    xAxis: [catAxis(labels, { gridIndex: 0, axisLabel: { show: false } }), catAxis(labels, { gridIndex: 1 })],
    yAxis: [valAxis(moneyC, { gridIndex: 0 }), valAxis(value => (value * 100).toFixed(0) + '%', { gridIndex: 1, splitNumber: 2 })],
    series: [
      { name: 'Valor', type: 'line', data: value, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: TK.series[0] + '40' }, { offset: 1, color: TK.series[0] + '05' }]) } },
      { name: 'Capital aportado neto', type: 'line', data: aport, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[1] }, itemStyle: { color: TK.series[1] } },
      { name: 'Rendimiento', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 10, data: rets.map(ret => ({ value: ret, itemStyle: { color: ret == null ? TK.other : ret >= 0 ? TK.pos : TK.neg } })) },
    ],
  }), true);
  const lo = YM[model.rangeStart], hi = YM[model.rangeEnd];
  const moves = P.events.filter(event => event[2] === it.tk && event[0] >= lo && event[0] <= hi && event[3] !== 'especie').reverse();
  document.getElementById('detMoves').innerHTML = it.isCash ? '<tbody><tr><td class="l">El efectivo no tiene movimientos propios: recibe depósitos, ventas y dividendos y paga compras, retiros y comisiones.</td></tr></tbody>'
    : moves.length ? thead([['Fecha', 1], ['Movimiento', 1], ['Monto'], ['Descripción', 1]]) + '<tbody>' +
      moves.map(([ym, day, tk, cat, amt, desc]) => '<tr>' + td(`${ym}-${String(day).padStart(2, '0')}`, day ? `${String(day).padStart(2, '0')} ${ymLabel(ym)}` : ymLabel(ym), 'l') + td(cat, EVENT_LABEL[cat] || cat, 'l') +
        td(amt, `<span class="${amt >= 0 ? 'mv-in' : 'mv-out'}">${money(amt)}</span>`) + `<td class="l" style="color:var(--muted)">${esc(desc)}</td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td class="l">Sin movimientos en el periodo.</td></tr></tbody>';
}

/* ============================== Inflación ============================== */
const INPC_KEYS = Object.keys(INPC).sort();
const INPC_LAST = INPC_KEYS[INPC_KEYS.length - 1];
function inpc(ym) {
  if (INPC[ym]) return INPC[ym];
  if (ym > INPC_LAST) return INPC[INPC_LAST] * Math.pow(1 + state.inf, ymDiff(INPC_LAST, ym) / 12);
  return INPC[INPC_KEYS[0]];
}
function inflationSeries() {
  const { V, F, idx, rangeStart } = model;
  const pts = []; let nom = 0; const flows = [];
  idx.forEach((monthIdx, pos) => {
    const flow = pos === 0 ? (rangeStart > 0 ? V[rangeStart - 1] + F[monthIdx] : V[0]) : F[monthIdx];
    nom += flow; flows.push({ ym: YM[monthIdx], amount: flow });
    const inpcValue = inpc(YM[monthIdx]);
    pts.push({ monthIdx, ym: YM[monthIdx], value: V[monthIdx], nom, adj: flows.reduce((sum, item) => sum + item.amount * inpcValue / inpc(item.ym), 0), inpc: inpcValue });
  });
  return pts;
}
function renderInflation() {
  document.getElementById('infIn').value = (state.inf * 100).toFixed(2);
  setSeg('infMode', state.infMode);
  const pts = inflationSeries(), first = pts[0], last = pts[pts.length - 1];
  const Iend = last.inpc, Ist = first.inpc, months = ymDiff(first.ym, last.ym);
  const infCum = Iend / Ist - 1, infAnn = months ? Math.pow(Iend / Ist, 12 / months) - 1 : null;
  const realTWR = model.kp.ann != null && infAnn != null ? (1 + model.kp.ann) / (1 + infAnn) - 1 : null;
  const gainReal = last.value - last.adj;
  document.getElementById('infKpis').innerHTML = kpiHtml([
    { label: `Inflación acumulada (${ymLabel(first.ym)} → ${ymLabel(last.ym)})`, value: pct(infCum, 1), detail: `${pct(infAnn, 2)} anual promedio (INPC, INEGI${last.ym > INPC_LAST ? `; desde ${ymLabel(INPC_LAST)} estimado con ${pct(state.inf, 1)}` : ''})` },
    { label: `Tu portafolio de hoy en pesos de ${ymLabel(first.ym)}`, value: money(last.value / (1 + infCum)), detail: `${money(last.value)} nominales` },
    { label: 'Aportado neto, ajustado a pesos de hoy', value: money(last.adj), detail: `${money(last.nom)} nominales (+${moneyC(last.adj - last.nom)} por inflación)` },
    { label: 'Ganancia real (pesos de hoy)', value: `<span class="${cls(gainReal)}">${money(gainReal)}</span>`, detail: `vs. ${money(last.value - last.nom)} de ganancia nominal` },
    { label: 'Rendimiento real anual (TWR)', value: `<span class="${cls(realTWR)}">${pct(realTWR, 2, true)}</span>`, detail: `${pct(model.kp.ann, 2, true)} nominal − inflación ${pct(infAnn, 2)}` },
  ]);
  const real = state.infMode === 'real';
  const ser = real
    ? [{ name: 'Valor (pesos de hoy)', data: pts.map(point => point.value * Iend / point.inpc), color: TK.series[0], area: true }, { name: 'Aportado (pesos de hoy)', data: pts.map(point => point.adj * Iend / point.inpc), color: TK.series[1] }]
    : [{ name: 'Valor', data: pts.map(point => point.value), color: TK.series[0], area: true }, { name: 'Aportado nominal', data: pts.map(point => point.nom), color: TK.muted }, { name: 'Aportado + inflación', data: pts.map(point => point.adj), color: TK.series[1] }];
  document.getElementById('infHint').textContent = real ? `Todo expresado en pesos de ${ymLabel(last.ym)}: la distancia entre las líneas es tu ganancia real.` : 'Valor nominal vs. lo que aportaste, y lo que aportaste actualizado por inflación a cada fecha (lo mínimo para no perder poder adquisitivo).';
  chart('cInf').setOption(base({
    legend: legend({ data: ser.map(item => item.name) }),
    grid: { left: 8, right: 70, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const point = pts[ps[0].dataIndex]; return ttHead(ymLabel(point.ym)) + ps.map(param => ttRow(param.color, param.seriesName, money(param.value))).join('') + ttRow(null, 'Inflación acumulada', pct(point.inpc / Ist - 1, 1)); } }),
    xAxis: catAxis(pts.map(point => ymLabel(point.ym)), { boundaryGap: false }), yAxis: valAxis(moneyC),
    series: ser.map(item => ({ name: item.name, type: 'line', data: item.data, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: item.color }, itemStyle: { color: item.color },
      areaStyle: item.area ? { color: item.color + '1f' } : undefined, endLabel: { show: true, formatter: param => moneyC(param.value), color: TK.ink2 } })),
  }), true);
  renderTimeValue();
}
function renderTimeValue() {
  const tvState = state.tv, tot = model.V[model.rangeEnd], rate = tvState.rate ?? (model.kp.ann ?? 0.08);
  const values = { pastAmt: tvState.pastAmt ?? Math.round(tot), pastYm: tvState.pastYm ?? YM[0], futAmt: tvState.futAmt ?? Math.round(tot), years: tvState.years ?? 10, rate, goal: tvState.goal ?? 1000000, goalYears: tvState.goalYears ?? 10 };
  const box = document.getElementById('tvBox');
  if (!box.dataset.ready) {
    box.dataset.ready = 1;
    box.innerHTML = `
      <div class="card"><h3>Valor pasado</h3><p class="hint">Cuánto vale hoy un monto de otra fecha, y al revés (INPC real)</p>
        <div class="cfg" style="margin:8px 0">$ <input data-field="pastAmt" data-amt> de hoy vs. <input type="month" data-field="pastYm" min="${INPC_KEYS[0]}" max="${INPC_LAST}" style="width:140px"></div><div id="tvPast"></div></div>
      <div class="card"><h3>Valor futuro</h3><p class="hint">Cuánto tendrás si inviertes hoy, en pesos de entonces y de hoy</p>
        <div class="cfg" style="margin:8px 0">$ <input data-field="futAmt" data-amt> a <input class="rate" type="number" step="0.1" data-field="rate">% por <input class="rate" type="number" step="1" min="1" data-field="years"> años</div><div id="tvFut"></div></div>
      <div class="card"><h3>Valor presente</h3><p class="hint">Qué significa hoy una meta futura</p>
        <div class="cfg" style="margin:8px 0">Meta de $ <input data-field="goal" data-amt> dentro de <input class="rate" type="number" step="1" min="1" data-field="goalYears"> años</div><div id="tvPres"></div></div>`;
  }
  box.querySelectorAll('input').forEach(element => {
    if (element.hasAttribute('data-amt')) element.type = state.hideAmt ? 'password' : 'number';
    const key = element.dataset.field, val = values[key];
    if (document.activeElement !== element) element.value = key === 'rate' ? (val * 100).toFixed(2) : val;
  });
  const now = INPC_LAST, ratio = inpc(now) / inpc(values.pastYm);
  const line = (label, value) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--grid)"><span style="color:var(--ink2)">${label}</span><b style="font-variant-numeric:tabular-nums">${value}</b></div>`;
  document.getElementById('tvPast').innerHTML = line(`${money(values.pastAmt)} de hoy (${ymLabel(now)}) en pesos de ${ymLabel(values.pastYm)}`, money(values.pastAmt / ratio)) + line(`${money(values.pastAmt)} de ${ymLabel(values.pastYm)} en pesos de hoy`, money(values.pastAmt * ratio)) + line('Inflación acumulada entre ambas fechas', pct(ratio - 1, 1));
  const fvN = values.futAmt * Math.pow(1 + values.rate, values.years), fvR = fvN / Math.pow(1 + state.inf, values.years);
  document.getElementById('tvFut').innerHTML = line(`Valor en ${values.years} años (nominal)`, money(fvN)) + line(`En pesos de hoy (inflación ${pct(state.inf, 1)})`, money(fvR)) + line('Rendimiento real anual', pct((1 + values.rate) / (1 + state.inf) - 1, 2));
  const pvInf = values.goal / Math.pow(1 + state.inf, values.goalYears), pvRate = values.goal / Math.pow(1 + values.rate, values.goalYears);
  document.getElementById('tvPres').innerHTML = line(`${money(values.goal)} en ${values.goalYears} años equivalen hoy a`, money(pvInf)) + line(`Necesitas invertir hoy a ${pct(values.rate, 2)}`, money(pvRate)) +
    line('O ahorrar al mes (mismo rendimiento)', money(values.goal * (values.rate / 12) / (Math.pow(1 + values.rate / 12, values.goalYears * 12) - 1)));
}

/* ============================== Proyección de retiro ============================== */
// Ahorro neto mensual promedio de los últimos 12 meses (depósitos − retiros)
function avgMonthlySaving() {
  const last = model.retIdx.slice(-12);
  return last.length ? last.reduce((sum, monthIdx) => sum + (MONTHS[monthIdx].ext.dep || 0) - (MONTHS[monthIdx].ext.wd || 0), 0) / last.length : 0;
}
function retirementModel() {
  const retState = state.ret, tot = model.V[model.rangeEnd], avgAport = avgMonthlySaving();
  const inputs = { age: retState.age ?? 35, retAge: retState.retAge ?? 65, endAge: retState.endAge ?? 95, rate: retState.rate ?? (model.kp.ann ?? 0.08), saldo: retState.saldo ?? Math.round(tot),
    aport: retState.aport ?? Math.max(0, Math.round(avgAport / 100) * 100), aportGrow: retState.aportGrow ?? true, need: retState.need ?? 20000, avgAport };
  const rm = inputs.rate / 12, gm = Math.pow(1 + state.inf, 1 / 12) - 1;
  const n1 = Math.max(0, Math.round((inputs.retAge - inputs.age) * 12)), n2 = Math.max(1, Math.round((inputs.endAge - inputs.retAge) * 12));
  const path = []; let bal = inputs.saldo, ap = inputs.aport;
  for (let month = 0; month <= n1; month++) {
    if (month % 12 === 0) path.push({ age: inputs.age + month / 12, bal, real: bal / Math.pow(1 + gm, month) });
    if (month === n1) break;
    bal = bal * (1 + rm) + ap; if (inputs.aportGrow) ap *= 1 + gm;
  }
  const atRet = bal, defl = Math.pow(1 + gm, n1);
  const simple = atRet / n2;
  const fixed = rm ? atRet * rm / (1 - Math.pow(1 + rm, -n2)) : atRet / n2;
  const growing = Math.abs(rm - gm) < 1e-12 ? atRet / n2 * (1 + rm) : atRet * (rm - gm) / (1 - Math.pow((1 + gm) / (1 + rm), n2));
  let b2 = atRet, withdrawal = growing;
  for (let month = 1; month <= n2; month++) {
    b2 = b2 * (1 + rm) - withdrawal; withdrawal *= 1 + gm;
    if (month % 12 === 0) path.push({ age: inputs.retAge + month / 12, bal: Math.max(0, b2), real: Math.max(0, b2) / Math.pow(1 + gm, n1 + month) });
  }
  return { inputs, n1, n2, atRet, atRetReal: atRet / defl, simple, fixed, growing, growingReal: growing / defl, needAtRet: inputs.need * defl, needAtEnd: inputs.need * Math.pow(1 + gm, n1 + n2), path, defl };
}
function earliestRetirement(baseProj) {
  const keep = state.ret;
  for (let age = Math.ceil(baseProj.inputs.age) + 1; age < baseProj.inputs.endAge; age++) {
    state.ret = { ...keep, retAge: age };
    if (retirementModel().growingReal >= baseProj.inputs.need) { state.ret = keep; return age; }
  }
  state.ret = keep; return null;
}
function renderRetirement() {
  const projection = retirementModel(), inputs = projection.inputs;
  const box = document.getElementById('retCfg');
  if (!box.dataset.ready) {
    box.dataset.ready = 1;
    box.innerHTML = `<span>Edad actual <input class="rate" type="number" step="1" data-field="age"></span>
      <span>Retiro a los <input class="rate" type="number" step="1" data-field="retAge"></span>
      <span>Hasta los <input class="rate" type="number" step="1" data-field="endAge"></span>
      <span>Tasa anual <input class="rate" type="number" step="0.1" data-field="rate">%</span>
      <span>Saldo hoy $ <input data-field="saldo" data-amt></span>
      <span>Aportas al mes $ <input data-field="aport" data-amt></span>
      <span><label style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-field="aportGrow" style="width:auto"> crece con inflación</label></span>
      <span>Retiro deseado (pesos de hoy) $ <input data-field="need" data-amt></span>
      <button data-preset="8">Tasa 8% (conservadora)</button><button data-preset="twr">Mi TWR</button><button data-preset="reset">Valores por defecto</button>`;
  }
  box.querySelectorAll('input').forEach(element => {
    if (element.hasAttribute('data-amt')) element.type = state.hideAmt ? 'password' : 'number';
    const key = element.dataset.field; if (document.activeElement === element) return;
    if (element.type === 'checkbox') element.checked = !!inputs[key]; else element.value = key === 'rate' ? (inputs[key] * 100).toFixed(2) : inputs[key];
  });
  const early = earliestRetirement(projection);
  document.getElementById('retKpis').innerHTML = kpiHtml([
    { label: `Saldo a los ${inputs.retAge}`, value: money(projection.atRet), detail: `${money(projection.atRetReal)} en pesos de hoy` },
    { label: 'Retiro mensual simple', value: money(projection.simple), detail: `saldo ÷ ${projection.n2} meses, sin rendimientos en el retiro · ${money(projection.simple / projection.defl)} de hoy` },
    { label: 'Retiro mensual fijo (sigue invirtiendo)', value: money(projection.fixed), detail: `mismo monto nominal hasta los ${inputs.endAge} · ${money(projection.fixed / projection.defl)} de hoy al inicio` },
    { label: 'Retiro que crece con la inflación (pesos de hoy)', value: `<span class="up">${money(projection.growingReal)}</span>`, detail: `${money(projection.growing)} nominales al empezar, sube ${pct(state.inf, 1)} al año hasta los ${inputs.endAge}` },
    { label: `Se necesitarán (${pct(state.inf, 1)} de inflación)`, value: money(projection.needAtRet), detail: `al mes a los ${inputs.retAge} para igualar ${money(inputs.need)} de hoy` },
    { label: 'Cobertura', value: `${(projection.growingReal / inputs.need).toFixed(1)}×`, detail: early ? `con estos supuestos alcanzarías tu retiro deseado desde los ${early} años` : 'no alcanza el retiro deseado antes de la edad final' },
  ]);
  document.getElementById('retNote').innerHTML = `Tasa mensual = ${pct(inputs.rate, 2)} ÷ 12. Aportación por defecto: tu ahorro neto mensual promedio de los últimos 12 meses (${money(inputs.avgAport)}). La tasa por defecto es tu TWR del periodo seleccionado${state.incDiv ? ' con dividendos' : ''}. Es una proyección con supuestos constantes, no una garantía.`;
  chart('cRet').setOption(base({
    legend: legend({ data: ['Saldo nominal', 'Saldo en pesos de hoy'] }),
    grid: { left: 8, right: 70, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const point = projection.path[ps[0].dataIndex]; return ttHead(`${Math.round(point.age)} años` + (point.age > inputs.retAge ? ' · retirando' : point.age === inputs.retAge ? ' · retiro' : '')) + ps.map(param => ttRow(param.color, param.seriesName, money(param.value))).join(''); } }),
    xAxis: catAxis(projection.path.map(point => Math.round(point.age)), { boundaryGap: false }), yAxis: valAxis(moneyC),
    series: [
      { name: 'Saldo nominal', type: 'line', data: projection.path.map(point => point.bal), showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] }, areaStyle: { color: TK.series[0] + '1a' },
        markLine: { symbol: 'none', silent: true, lineStyle: { color: TK.axis, width: 1.5, type: 'solid' }, label: { formatter: `Retiro ${inputs.retAge}`, color: TK.ink2, position: 'insideEndTop' }, data: [{ xAxis: String(inputs.retAge) }] } },
      { name: 'Saldo en pesos de hoy', type: 'line', data: projection.path.map(point => point.real), showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[2] }, itemStyle: { color: TK.series[2] } },
    ],
  }), true);
}

/* ============================== FIRE ============================== */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let mixed = Math.imul(seed ^ seed >>> 15, 1 | seed); mixed = mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed) ^ mixed; return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296; }; }
function gauss(random) { let uniformA = 0, uniformB = 0; while (!uniformA) uniformA = random(); while (!uniformB) uniformB = random(); return Math.sqrt(-2 * Math.log(uniformA)) * Math.cos(2 * Math.PI * uniformB); }
function fireInputs() {
  const fireState = state.fire, tot = model.V[model.rangeEnd];
  const mixVol = (() => { const pM = profileSeries(model); const stats = seriesStats(mixReturns(pM, Object.fromEntries(pM.map(profile => [profile.name, profile.weight])))); return stats ? stats.vol : null; })();
  const inputs = { saldo: fireState.saldo ?? Math.round(tot), swr: fireState.swr ?? 0.04, rate: fireState.rate ?? (model.kp.ann ?? 0.08), vol: fireState.vol ?? (mixVol ?? 0.12), gasto: fireState.gasto ?? (state.ret.need ?? 20000), years: fireState.years ?? 50, mixVol };
  inputs.real = (1 + inputs.rate) / (1 + state.inf) - 1;
  return inputs;
}
// Retiro desde hoy, mes a mes (en términos reales): determinístico + Monte Carlo con semilla fija
function fireScenario(inputs, paths = 700) {
  const totalMonths = Math.round(inputs.years * 12);
  const mu = Math.pow(1 + inputs.real, 1 / 12) - 1, sd = inputs.vol / Math.sqrt(12), withdrawal = inputs.saldo * inputs.swr / 12;
  const det = [inputs.saldo]; let balance = inputs.saldo;
  for (let month = 1; month <= totalMonths; month++) { balance = balance * (1 + mu) - withdrawal; det.push(balance); }
  const random = rng(12345), snap = Array.from({ length: totalMonths + 1 }, () => new Float64Array(paths));
  let ok = 0;
  for (let pathIdx = 0; pathIdx < paths; pathIdx++) {
    let bal = inputs.saldo, alive = true; snap[0][pathIdx] = bal;
    for (let month = 1; month <= totalMonths; month++) {
      bal = bal * (1 + mu + sd * sd / 2 + sd * gauss(random)) - withdrawal;
      if (bal <= 0) { bal = 0; alive = false; }
      snap[month][pathIdx] = bal;
    }
    if (alive) ok++;
  }
  const quantile = (arr, fraction) => { const sorted = Array.from(arr).sort((left, right) => left - right); return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]; };
  return { totalMonths, det, band: snap.map(values => ({ p10: quantile(values, 0.1), p50: quantile(values, 0.5), p90: quantile(values, 0.9) })), success: ok / paths, withdrawal };
}
function swrSuccess(real, vol, years, swr, paths = 800, seed = 777) {
  const random = rng(seed); let ok = 0;
  for (let pathIdx = 0; pathIdx < paths; pathIdx++) { let balance = 1, alive = true;
    for (let year = 0; year < years; year++) { balance -= swr; if (balance <= 0) { alive = false; break; } balance *= 1 + real + vol * vol / 2 + vol * gauss(random); if (balance <= 0) { alive = false; break; } }
    if (alive) ok++; }
  return ok / paths;
}
function renderFire() {
  const inputs = fireInputs();
  const box = document.getElementById('fireCfg');
  if (!box.dataset.ready) {
    box.dataset.ready = 1;
    box.innerHTML = `<span>Saldo $ <input data-field="saldo" data-amt></span>
      <span>Tasa de retiro <input class="rate" type="number" step="0.1" min="0.5" data-field="swr">%</span>
      <span>Rendimiento nominal <input class="rate" type="number" step="0.1" data-field="rate">%</span>
      <span title="Por defecto: la volatilidad de tu mezcla actual (ver “¿De dónde sale la volatilidad?”)">Volatilidad <input class="rate" type="number" step="0.5" min="0" data-field="vol">%</span>
      <span>Gasto mensual $ <input data-field="gasto" data-amt></span>
      <span>Horizonte <input class="rate" type="number" step="5" min="5" data-field="years"> años</span>
      <button data-preset="reset">Valores por defecto</button>`;
  }
  box.querySelectorAll('input').forEach(element => {
    if (element.hasAttribute('data-amt')) element.type = state.hideAmt ? 'password' : 'number';
    const key = element.dataset.field; if (document.activeElement === element) return;
    element.value = ['swr', 'rate', 'vol'].includes(key) ? (inputs[key] * 100).toFixed(2) : Math.round(inputs[key]);
  });
  const sc = fireScenario(inputs);
  const fiNum = inputs.gasto * 12 / inputs.swr;
  let safe = null; for (let rate = 0.02; rate <= 0.08 + 1e-9; rate += 0.0025) { if (swrSuccess(inputs.real, inputs.vol, inputs.years, rate, 600) >= 0.95) safe = rate; }
  document.getElementById('fireKpis').innerHTML = kpiHtml([
    { label: 'Podrías retirar hoy', value: `<span class="up">${money(sc.withdrawal)}</span>/mes`, detail: `${pct(inputs.swr, 1)} anual de ${moneyC(inputs.saldo)}, ajustado cada año por inflación` },
    { label: 'Número FIRE', value: money(fiNum), detail: `gasto de ${money(inputs.gasto)}/mes ÷ ${pct(inputs.swr, 1)} · llevas ${pct(inputs.saldo / fiNum, 0)}${inputs.saldo >= fiNum ? ' ✓' : ` · te faltan ${moneyC(fiNum - inputs.saldo)}`}` },
    { label: 'Cobertura de tu gasto', value: `${(sc.withdrawal / inputs.gasto).toFixed(2)}×`, detail: sc.withdrawal >= inputs.gasto ? 'tu retiro sostenible cubre tu gasto' : `te faltan ${money(inputs.gasto - sc.withdrawal)}/mes` },
    { label: `Probabilidad de que dure ${inputs.years} años`, value: pct(sc.success, 0), detail: `Monte Carlo: 700 escenarios con ${pct(inputs.real, 1)} real y ${pct(inputs.vol, 1)} de volatilidad` },
    { label: 'Tasa con ≥95% de éxito', value: safe ? pct(safe, 2) : '< 2%', detail: `para ${inputs.years} años y tu volatilidad · con ella: ${safe ? money(inputs.saldo * safe / 12) : '—'}/mes` },
  ]);
  document.getElementById('fireHint').textContent = `Retiras ${pct(inputs.swr, 1)} del saldo de hoy (${money(sc.withdrawal)}/mes, ajustado por inflación) durante ${inputs.years} años. Banda = 80% de los escenarios simulados.`;
  const months = sc.det.map((detail, index) => index);
  const lab = month => month % 12 === 0 ? `Año ${month / 12}` : `Año ${Math.floor(month / 12)}, mes ${month % 12}`;
  const p10 = months.map(month => sc.band[month].p10), p90 = months.map(month => sc.band[month].p90 - sc.band[month].p10), p50 = months.map(month => sc.band[month].p50);
  const cB = TK.series[0];
  chart('cFire');
  htmlLegend('lgFire', 'cFire', [{ name: 'Saldo esperado', color: TK.ink }, { name: 'Mediana simulada', color: cB }, { name: 'Rango 10–90%', color: cB + '66' }]);
  charts.cFire.setOption(base({
    legend: hiddenLegend(),
    grid: { left: 8, right: 16, top: 12, bottom: 30, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const month = ps[0].dataIndex, bd = sc.band[month];
        return ttHead(lab(month)) + ttRow(TK.ink, 'Saldo esperado', money(Math.max(0, sc.det[month]))) + ttRow(cB, 'Mediana simulada', money(bd.p50)) + ttRow(null, 'Rango 10–90%', `${moneyC(bd.p10)} – ${moneyC(bd.p90)}`) + ttRow(null, 'Retirando al mes', money(sc.withdrawal)); } }),
    xAxis: catAxis(months, { boundaryGap: false, axisLabel: { color: TK.muted, fontSize: 11, interval: index => index % 60 === 0, formatter: value => `Año ${Math.round(value / 12)}` } }),
    yAxis: valAxis(moneyC),
    series: [
      { name: 'P10', type: 'line', data: p10, stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
      { name: 'Rango 10–90%', type: 'line', data: p90, stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: cB + '26' }, silent: true },
      { name: 'Mediana simulada', type: 'line', data: p50, symbol: 'none', lineStyle: { width: 1.5, color: cB } },
      { name: 'Saldo esperado', type: 'line', data: sc.det.map(detail => Math.max(0, detail)), symbol: 'none', lineStyle: { width: 2.5, color: TK.ink }, itemStyle: { color: TK.ink },
        markLine: { symbol: 'none', silent: true, lineStyle: { color: TK.series[3], width: 1.5, type: 'solid' }, label: { formatter: 'Número FIRE', color: TK.ink2, position: 'insideStartTop' }, data: [{ yAxis: fiNum }] } },
    ],
  }), true);

  const vols = [...new Set([inputs.vol, 0.10, 0.15].map(vol => Math.round(vol * 1000) / 1000))].sort((left, right) => left - right);
  const xs = []; for (let rate = 0.02; rate <= 0.0701; rate += 0.0025) xs.push(+rate.toFixed(4));
  const cols = [TK.series[0], TK.series[1], TK.series[4]];
  const volName = vol => `Volatilidad ${pct(vol, 1)}${Math.abs(vol - inputs.vol) < 1e-6 ? ' (tuya)' : ''}`;
  document.getElementById('swrHint').textContent = `Probabilidad de que el dinero dure ${inputs.years} años retirando cada año el % del saldo inicial (ajustado por inflación), con ${pct(inputs.real, 1)} de rendimiento real esperado.`;
  chart('cSwr').setOption(base({
    legend: legend({ data: vols.map(volName) }),
    grid: { left: 8, right: 16, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => ttHead(`Retirando ${pct(xs[ps[0].dataIndex], 2)} al año (${money(inputs.saldo * xs[ps[0].dataIndex] / 12)}/mes hoy)`) + ps.map(param => ttRow(param.color, param.seriesName, pct(param.value, 0))).join('') }),
    xAxis: catAxis(xs.map(rate => (rate * 100).toFixed(2).replace(/\.?0+$/, '') + '%'), { boundaryGap: false }),
    yAxis: valAxis(value => (value * 100).toFixed(0) + '%', { max: 1, min: 0 }),
    series: vols.map((vol, index) => ({ name: volName(vol), type: 'line', data: xs.map(rate => swrSuccess(inputs.real, vol, inputs.years, rate)), symbol: 'circle', symbolSize: 5, showSymbol: false,
      lineStyle: { width: Math.abs(vol - inputs.vol) < 1e-6 ? 2.5 : 1.5, color: cols[index] }, itemStyle: { color: cols[index] },
      markLine: index === 0 ? { symbol: 'none', silent: true, lineStyle: { color: TK.axis, width: 1, type: 'solid' }, label: { color: TK.ink2, fontSize: 10, formatter: param => param.name }, data: [{ yAxis: 0.95, name: '95%' }, { yAxis: 0.9, name: '90%' }, { xAxis: xs.reduce((bi, rate, idx) => Math.abs(rate - inputs.swr) < Math.abs(xs[bi] - inputs.swr) ? idx : bi, 0), name: 'tu tasa' }] } : undefined })),
  }), true);

  const realHist = model.kp.ann != null ? (1 + model.kp.ann) / (1 + state.inf) - 1 : null;
  document.getElementById('fireWhy').innerHTML = `<h3>¿Es adecuado el 4%?</h3>
    <p class="hint" style="margin-bottom:8px">Cómo saber si te aplica, con tus números</p>
    <div style="font-size:13px;line-height:1.55;color:var(--ink2)">
    <p style="margin:6px 0"><b style="color:var(--ink)">De dónde viene.</b> Bengen (1994) y el "Trinity study" (1998) probaron con datos de EE.UU. desde 1926: retirar 4% del saldo el primer año y luego ajustar ese monto por inflación sobrevivió ~95% de los periodos de <b>30 años</b> con 50–75% en acciones. Es una regla empírica para un contexto específico, no una ley.</p>
    <ol style="margin:4px 0 4px 18px;padding:0">
      <li><b>Horizonte.</b> Un retiro temprano puede durar 50–60 años, no 30. Para ${inputs.years} años y tu volatilidad, la tasa con ≥95% de éxito es <b>${safe ? pct(safe, 2) : '< 2%'}</b>.</li>
      <li><b>Rendimiento real esperado.</b> Tu rendimiento real histórico es ~${pct(realHist, 1)} (${pct(model.kp.ann, 1)} nominal − ${pct(state.inf, 1)} de inflación supuesta), pero son pocos años de datos.</li>
      <li><b>Riesgo de secuencia.</b> Unos malos años justo al empezar a retirar pesan mucho más que al final; eso es lo que mide la volatilidad en la simulación. Revisa también las curvas de 10% y 15%.</li>
      <li><b>Impuestos y costos.</b> El 4% es antes de impuestos: ISR retenido en dividendos (${pct(model.gbm.tot.gross ? -model.gbm.tot.isr / model.gbm.tot.gross : null, 0)} de lo que recibiste), ISR por ganancias al vender y comisiones (${pct(model.gbm.tot.avgRV && model.gbm.tot.months ? -model.gbm.tot.com / model.gbm.tot.avgRV / (model.gbm.tot.months / 12) : null, 2)} anual en tu cuenta). Réstalos de tu tasa.</li>
      <li><b>Moneda e inflación.</b> Tus gastos son en pesos; los instrumentos en dólares agregan riesgo cambiario (a favor o en contra).</li>
      <li><b>Flexibilidad e ingresos futuros.</b> Si puedes recortar gasto en años malos o vas a tener otros ingresos (pensión, rentas), puedes tolerar una tasa mayor; si no, conviene una menor.</li>
    </ol>
    <p style="margin:6px 0">Esto es una herramienta de análisis, no una recomendación de inversión.</p></div>`;
}

/* ============================== Todos los instrumentos ============================== */
const EDIT_DIMS = ['tipo', 'clase', 'region', 'riesgo', 'moneda'];
const COLS = [
  { key: 'tk', label: 'Ticker', left: true, get: it => it.tk },
  { key: 'name', label: 'Nombre', left: true, get: it => it.name },
  ...EDIT_DIMS.map(dim => ({ key: dim, label: DIMS[dim].label, left: true, edit: dim })),
  { key: 'valor', label: 'Valor al cierre', get: it => it.st.vEnd, format: money },
  { key: 'tit', label: 'Títulos', get: it => it.st.tit, format: value => value.toLocaleString('es-MX') },
  { key: 'wEnd', label: 'Peso', get: it => it.st.wEnd, format: value => pct(value, 1) },
  { key: 'wAvg', label: 'Peso prom.', get: it => it.st.wAvg, format: value => pct(value, 1) },
  { key: 'buys', label: 'Comprado', get: it => it.st.buys, format: money },
  { key: 'sells', label: 'Vendido', get: it => it.st.sells, format: money },
  { key: 'gain', label: 'Ganancia $', get: it => it.st.gain, format: value => `<span class="${cls(value)}">${money(value)}</span>` },
  { key: 'share', label: '% ganancias', get: it => it.st.gainShare, format: value => pct(value, 1) },
  { key: 'ann', label: 'Anualizado', get: it => it.isCash ? null : it.st.ann, format: value => `<span class="${cls(value)}">${pct(value, 1, true)}</span>` },
  { key: 'cum', label: 'Acumulado', get: it => it.isCash ? null : it.st.cum, format: value => `<span class="${cls(value)}">${pct(value, 1, true)}</span>` },
  { key: 'last', label: 'Último mes', get: it => it.isCash ? null : it.st.lastR, format: value => `<span class="${cls(value)}">${pct(value, 1, true)}</span>` },
  { key: 'vol', label: 'Volatilidad', get: it => it.isCash ? null : it.st.vol, format: value => pct(value, 1) },
  { key: 'eff', label: 'Eficiencia', get: it => it.st.eff, format: value => value.toFixed(1) + '×' },
  { key: 'div', label: 'Dividendos netos', get: it => it.st.dist || null, format: money },
  { key: 'cal', label: 'Calendario de pagos', left: true, get: it => it.isCash ? null : calLabel(it.tk), format: value => esc(value) },
  { key: 'dy', label: 'Yield div.', get: it => (model.gbm.tks.find(stat => stat.tk === it.tk) || {}).yield ?? null, format: value => pct(value, 2) },
  { key: 'pAnn', label: 'Rend. precio', get: it => it.isCash ? null : model.alt.MP.insts.find(inst => inst.tk === it.tk)?.st.ann ?? null, format: value => `<span class="${cls(value)}">${pct(value, 1, true)}</span>` },
  { key: 'dAnn', label: 'Rend. dividendos', get: it => { if (it.isCash) return null; const withDiv = model.alt.MD.insts.find(inst => inst.tk === it.tk)?.st.ann, priceOnly = model.alt.MP.insts.find(inst => inst.tk === it.tk)?.st.ann; return withDiv != null && priceOnly != null && Math.abs(withDiv - priceOnly) > 1e-6 ? withDiv - priceOnly : null; }, format: value => pct(value, 1, true) },
  { key: 'sharpe', label: 'Sharpe', get: it => it.isCash ? null : it.st.risk?.sharpe ?? null, format: value => value.toFixed(2) },
  { key: 'mdd', label: 'Peor caída', get: it => it.isCash ? null : it.st.risk?.mdd ?? null, format: value => `<span class="${value < 0 ? 'down' : ''}">${pct(value, 1)}</span>` },
  { key: 'negM', label: '% meses negativos', get: it => it.isCash ? null : it.st.risk?.negPct ?? null, format: value => pct(value, 0) },
  { key: 'nm', label: 'Meses', get: it => it.st.nm, format: value => value },
  { key: 'x', label: '', left: true, get: () => '' },
];
function renderTable() {
  const col = COLS.find(item => item.key === state.sort.col) || COLS.find(item => item.key === 'valor');
  const getter = col.get || (it => it.cls[col.edit]);
  const rows = [...model.insts].sort((left, right) => {
    const leftValue = getter(left), rightValue = getter(right);
    if (leftValue == null) return 1; if (rightValue == null) return -1;
    return (typeof leftValue === 'string' ? leftValue.localeCompare(rightValue, 'es') : leftValue - rightValue) * state.sort.dir;
  });
  const head = '<thead><tr>' + COLS.map(item => `<th class="${item.left ? 'l' : ''}" data-col="${item.key}">${item.label}${state.sort.col === item.key ? (state.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('') + '</tr></thead>';
  const body = '<tbody>' + rows.map(it => '<tr class="' + (it.active ? '' : 'closed') + '">' + COLS.map(item => {
    if (item.edit) {
      if (it.isCash) return `<td class="l">${sw(colorFor(item.edit, it.cls[item.edit]))}${esc(it.cls[item.edit])}</td>`;
      const vals = [...DIMS[item.edit].values]; if (!vals.includes(it.cls[item.edit])) vals.push(it.cls[item.edit]);
      return `<td class="l">${sw(colorFor(item.edit, it.cls[item.edit]))}<select data-key="${esc(it.tk)}" data-dim="${item.edit}">${vals.map(value => `<option${value === it.cls[item.edit] ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></td>`;
    }
    const value = item.get(it);
    if (item.key === 'x') return it.isCash ? '<td></td>' : `<td class="l"><button class="chip" data-excl="${esc(it.tk)}" title="Quitar de todos los cálculos">✕ Excluir</button></td>`;
    if (item.key === 'tk') return `<td class="l"><b style="font-weight:600">${esc(it.isCash ? 'Efectivo' : it.tk)}</b>${it.active ? '' : ' <span style="color:var(--muted)">(cerrado)</span>'}</td>`;
    return `<td class="${item.left ? 'l' : ''}">${item.format ? (value == null ? '—' : item.format(value)) : esc(value)}</td>`;
  }).join('') + '</tr>').join('') + '</tbody>';
  document.getElementById('tbl').innerHTML = head + body;
  document.getElementById('exclList').innerHTML = state.excl.length ? 'Excluidos de todos los cálculos: ' + state.excl.map(key => `<button class="chip" data-incl="${esc(key)}" title="Volver a incluir"><b style="color:var(--ink)">${esc(key)}</b> ↺ incluir</button>`).join(' ') : '';
}
