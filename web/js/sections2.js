/* ============================== Riesgo vs. rendimiento por perfil ============================== */
const RISK = DIMS.riesgo.values;
// Rendimiento mensual de cada perfil (sin efectivo) y su peso al cierre sobre lo invertido
function profileSeries(mm) {
  const groups = mm.groupBy('riesgo');
  const invested = mm.ranked.reduce((sum, it) => sum + Math.max(it.st.vEnd, 0), 0) || 1;
  return RISK.map(name => {
    const group = groups.find(item => item.key === name);
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
  document.getElementById('riskTbl').innerHTML = thead([[L('Perfil', 'Profile'), 1], [L('Peso hoy', 'Weight today')], [L('Rend. total anual', 'Total annual return')], [L('Por precio', 'From price')], [L('Por dividendos', 'From dividends')], [L('Volatilidad', 'Volatility')], [L('Peor caída', 'Max drawdown')], [L('Peor mes', 'Worst month')], [L('Meses negativos', 'Negative months')], ['Sharpe']]) + '<tbody>' +
    rows.filter(row => row.weight > 0 || row.stats).map(row => '<tr>' + td(row.name, sw(colorFor('riesgo', row.name)) + esc(valueLabel(row.name)), 'l') + td(row.weight, pct(row.weight, 0)) + cells(row) + '</tr>').join('') + '</tbody>' +
    '<tfoot><tr>' + td(L('Portafolio total', 'Total portfolio'), L('Portafolio total (con efectivo)', 'Total portfolio (with cash)'), 'l') + td(1, '100%') + cells(total) + '</tr></tfoot>';
  sortable('riskTbl');
  document.getElementById('riskNote').textContent = L(`Meses con rendimiento en el periodo: ${model.retIdx.length}. "Peso hoy" es sobre lo invertido (sin efectivo). "Rend. total" incluye dividendos netos; volatilidad, peor caída, peor mes y Sharpe siguen la casilla de dividendos (${state.incDiv ? 'incluidos' : L('sin dividendos', 'without dividends')}). Sharpe = (rendimiento anual − ${pct(state.rf, 2)}) ÷ volatilidad.`, `Months with returns in the period: ${model.retIdx.length}. "Weight today" is over what is invested (without cash). "Total return" includes net dividends; volatility, max drawdown, worst month and Sharpe follow the dividends checkbox (${state.incDiv ? 'included' : 'excluded'}). Sharpe = (annual return − ${pct(state.rf, 2)}) ÷ volatility.`);
  renderSim(pM);
  renderVolatility(pM);
  renderFrontier(pM);
}
const mixReturns = (pM, weights) => model.retIdx.map((monthIdx, pos) => pM.reduce((sum, profile) => sum + (weights[profile.name] || 0) * (profile.rs[pos] ?? 0), 0));
function renderSim(pM) {
  const tot = model.V[model.rangeEnd], sim = state.sim;
  ['simFrom', 'simTo'].forEach(id => { document.getElementById(id).innerHTML = RISK.map(profile => `<option value="${profile}"${profile === (id === 'simFrom' ? sim.from : sim.to) ? ' selected' : ''}>${valueLabel(profile)}</option>`).join(''); });
  document.getElementById('simPct').value = sim.pct; document.getElementById('simPctLbl').textContent = sim.pct + '%';
  const w0 = Object.fromEntries(pM.map(profile => [profile.name, profile.weight]));
  const moved = Math.min(sim.pct / 100, w0[sim.from] || 0);
  const w1 = { ...w0 }; if (sim.from !== sim.to) { w1[sim.from] -= moved; w1[sim.to] += moved; }
  const rA = mixReturns(pM, w0), rB = mixReturns(pM, w1), current = seriesStats(rA), simulated = seriesStats(rB);
  document.getElementById('simInfo').innerHTML = L(`Pesos: ${RISK.map(profile => `${esc(profile)} ${pct(w0[profile], 0)} → <b>${pct(w1[profile], 0)}</b>`).join(' · ')}`, `Weights: ${RISK.map(profile => `${esc(valueLabel(profile))} ${pct(w0[profile], 0)} → <b>${pct(w1[profile], 0)}</b>`).join(' · ')}`) + (moved < sim.pct / 100 ? L(` <span class="down">(sólo hay ${pct(w0[sim.from], 0)} en ${esc(sim.from)})</span>`, ` <span class="down">(there is only ${pct(w0[sim.from], 0)} in ${esc(valueLabel(sim.from))})</span>`) : '') + L(` · ${moneyC(moved * tot)} movidos`, ` · ${moneyC(moved * tot)} moved`);
  if (!current || !simulated) { document.getElementById('simKpis').innerHTML = L('<div class="kpi">Se necesitan al menos 3 meses.</div>', '<div class="kpi">At least 3 months are needed.</div>'); return; }
  const arrow = (before, after, fmt, better) => { const delta = after - before; const good = better === 'up' ? delta > 0 : delta < 0; return `${fmt(before)} → <span class="${Math.abs(delta) < 1e-9 ? '' : good ? 'up' : 'down'}">${fmt(after)}</span>`; };
  const p1 = value => pct(value, 1), p1s = value => pct(value, 1, true);
  document.getElementById('simKpis').innerHTML = [
    { label: L('Rendimiento anual', 'Annual return'), value: arrow(current.ann, simulated.ann, p1s, 'up'), detail: L(`≈ ${(simulated.ann - current.ann) >= 0 ? '+' : '−'}${moneyC(Math.abs(simulated.ann - current.ann) * tot)} al año sobre ${moneyC(tot)}`, `≈ ${(simulated.ann - current.ann) >= 0 ? '+' : '−'}${moneyC(Math.abs(simulated.ann - current.ann) * tot)} per year on ${moneyC(tot)}`) },
    { label: L('Volatilidad', 'Volatility'), value: arrow(current.vol, simulated.vol, p1, 'down'), detail: L('anual, de rendimientos mensuales', 'annual, from monthly returns') },
    { label: L('Peor caída', 'Max drawdown'), value: arrow(current.mdd, simulated.mdd, p1, 'up'), detail: L(`≈ ${moneyC(Math.abs(simulated.mdd) * tot)} en el peor momento`, `≈ ${moneyC(Math.abs(simulated.mdd) * tot)} at the worst point`) },
    { label: L('Peor mes', 'Worst month'), value: arrow(current.worst, simulated.worst, p1s, 'up'), detail: L(`≈ ${moneyC(simulated.worst * tot)} en un mes`, `≈ ${moneyC(simulated.worst * tot)} in one month`) },
    { label: L('Meses negativos', 'Negative months'), value: arrow(current.negPct, simulated.negPct, value => pct(value, 0), 'down'), detail: L(`de ${current.count} meses`, `out of ${current.count} months`) },
    { label: 'Sharpe', value: arrow(current.sharpe, simulated.sharpe, value => value == null ? '—' : value.toFixed(2), 'up'), detail: L(`con tasa libre de riesgo de ${pct(state.rf, 2)}`, `with a risk-free rate of ${pct(state.rf, 2)}`) },
  ].map(tile => `<div class="kpi"><div class="k">${tile.label}</div><div class="v" style="font-size:20px">${tile.value}</div><div class="d">${tile.detail}</div></div>`).join('');
  const idxSeries = rs => { let level = 100, pk = 100; const iv = [100], dd = [0]; rs.forEach(ret => { level *= 1 + ret; pk = Math.max(pk, level); iv.push(level); dd.push(level / pk - 1); }); return { iv, dd }; };
  const currentPath = idxSeries(rA), simulatedPath = idxSeries(rB);
  const labels = [ymLabel(YM[model.retIdx[0] - 1]), ...model.retIdx.map(monthIdx => ymLabel(YM[monthIdx]))];
  const cA = TK.muted, cB = TK.series[0];
  chart('cSim').setOption(base({
    legend: legend({ data: [L('Mezcla actual', 'Current mix'), L('Mezcla simulada', 'Simulated mix')] }),
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [{ left: 8, right: 56, top: legTop(34), height: '50%', containLabel: true }, { left: 8, right: 56, top: '72%', bottom: 8, containLabel: true }],
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const pointIdx = ps[0].dataIndex; return ttHead(labels[pointIdx]) + ttRow(cA, L('Mezcla actual', 'Current mix'), L(`${currentPath.iv[pointIdx].toFixed(1)} · caída ${pct(currentPath.dd[pointIdx], 1)}`, `${currentPath.iv[pointIdx].toFixed(1)} · drawdown ${pct(currentPath.dd[pointIdx], 1)}`)) + ttRow(cB, L('Mezcla simulada', 'Simulated mix'), L(`${simulatedPath.iv[pointIdx].toFixed(1)} · caída ${pct(simulatedPath.dd[pointIdx], 1)}`, `${simulatedPath.iv[pointIdx].toFixed(1)} · drawdown ${pct(simulatedPath.dd[pointIdx], 1)}`)); } }),
    xAxis: [catAxis(labels, { gridIndex: 0, boundaryGap: false, axisLabel: { show: false } }), catAxis(labels, { gridIndex: 1, boundaryGap: false })],
    yAxis: [valAxis(value => value.toFixed(0), { gridIndex: 0, scale: true }), valAxis(value => (value * 100).toFixed(0) + '%', { gridIndex: 1, splitNumber: 2, max: 0 })],
    series: [
      { name: L('Mezcla actual', 'Current mix'), type: 'line', data: currentPath.iv, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: cA }, itemStyle: { color: cA }, endLabel: { show: true, formatter: param => param.value.toFixed(0), color: TK.ink2 } },
      { name: L('Mezcla simulada', 'Simulated mix'), type: 'line', data: simulatedPath.iv, showSymbol: false, symbol: 'circle', lineStyle: { width: 2.5, color: cB }, itemStyle: { color: cB }, endLabel: { show: true, formatter: param => param.value.toFixed(0), color: TK.ink, fontWeight: 600 } },
      { name: L('Caída actual', 'Current drawdown'), type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: currentPath.dd, showSymbol: false, lineStyle: { width: 1.5, color: cA }, itemStyle: { color: cA } },
      { name: L('Caída simulada', 'Simulated drawdown'), type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: simulatedPath.dd, showSymbol: false, lineStyle: { width: 1.5, color: cB }, itemStyle: { color: cB }, areaStyle: { color: cB + '22' } },
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
  if (model.retIdx.length < 3) { document.getElementById('volKpis').innerHTML = L('<div class="kpi">Se necesitan al menos 3 meses.</div>', '<div class="kpi">At least 3 months are needed.</div>'); return; }
  const vb = volatilityBreakdown(pM);
  const annualReturn = Math.pow(1 + vb.meanMonth, 12) - 1;
  const worstIdx = vb.mix.indexOf(Math.min(...vb.mix));
  document.getElementById('volKpis').innerHTML = [
    { label: L('Volatilidad anual de tu mezcla', 'Annual volatility of your mix'), value: pct(vb.annualVol, 2), detail: L(`= ${pct(vb.monthlySd, 2)} mensual × √12 · ${vb.mix.length} meses`, `= ${pct(vb.monthlySd, 2)} monthly × √12 · ${vb.mix.length} months`) },
    { label: L('Un mes "normal" (±1σ)', 'A "normal" month (±1σ)'), value: L(`${pct(vb.meanMonth - vb.monthlySd, 1, true)} a ${pct(vb.meanMonth + vb.monthlySd, 1, true)}`, `${pct(vb.meanMonth - vb.monthlySd, 1, true)} to ${pct(vb.meanMonth + vb.monthlySd, 1, true)}`), detail: L(`≈ 2 de cada 3 meses · ${moneyC((vb.meanMonth - vb.monthlySd) * vb.total)} a ${moneyC((vb.meanMonth + vb.monthlySd) * vb.total)}`, `≈ 2 out of 3 months · ${moneyC((vb.meanMonth - vb.monthlySd) * vb.total)} to ${moneyC((vb.meanMonth + vb.monthlySd) * vb.total)}`) },
    { label: L('Un año "normal" (±1σ)', 'A "normal" year (±1σ)'), value: L(`${pct(annualReturn - vb.annualVol, 1, true)} a ${pct(annualReturn + vb.annualVol, 1, true)}`, `${pct(annualReturn - vb.annualVol, 1, true)} to ${pct(annualReturn + vb.annualVol, 1, true)}`), detail: L(`≈ 2 de cada 3 años, con ${pct(annualReturn, 1, true)} de promedio`, `≈ 2 out of 3 years, averaging ${pct(annualReturn, 1, true)}`) },
    { label: L('Peor mes de la mezcla', 'Worst month of the mix'), value: pct(vb.mix[worstIdx], 2, true), detail: L(`${vb.labels[worstIdx]} · ≈ ${moneyC(vb.mix[worstIdx] * vb.total)} con tu saldo de hoy`, `${vb.labels[worstIdx]} · ≈ ${moneyC(vb.mix[worstIdx] * vb.total)} with today’s balance`) },
  ].map(tile => `<div class="kpi"><div class="k">${tile.label}</div><div class="v" style="font-size:20px">${tile.value}</div><div class="d">${tile.detail}</div></div>`).join('');
  document.getElementById('volTbl').innerHTML = thead([[L('Perfil', 'Profile'), 1], [L('Peso', 'Weight')], [L('Volatilidad propia', 'Own volatility')], [L('Correlación con tu mezcla', 'Correlation with your mix')], [L('Aporte a la volatilidad', 'Contribution to volatility')]]) + '<tbody>' +
    vb.rows.map(row => '<tr>' + td(row.name, sw(colorFor('riesgo', row.name)) + esc(valueLabel(row.name)), 'l') + td(row.weight, pct(row.weight, 1)) + td(row.vol, pct(row.vol, 2)) + td(row.corr, row.corr == null || !isFinite(row.corr) ? '—' : row.corr.toFixed(2)) + td(row.contribution, `<b>${pct(row.contribution, 1)}</b>`) + '</tr>').join('') +
    L(`</tbody><tfoot><tr><td class="l">Mezcla</td><td>100%</td><td>${pct(vb.annualVol, 2)}</td><td>1.00</td><td>100%</td></tr></tfoot>`, `</tbody><tfoot><tr><td class="l">Mix</td><td>100%</td><td>${pct(vb.annualVol, 2)}</td><td>1.00</td><td>100%</td></tr></tfoot>`);
  sortable('volTbl');
  const top = [...vb.rows].sort((left, right) => right.contribution - left.contribution)[0];
  const sumOwn = vb.rows.reduce((sum, row) => sum + row.weight * row.vol, 0);
  document.getElementById('volWhy').innerHTML = L(`
    <p style="margin:4px 0"><b style="color:var(--ink)">Cómo se calcula.</b> Tomo tus pesos de hoy por perfil (${vb.rows.map(row => `${esc(row.name)} ${pct(row.weight, 0)}`).join(', ')}) y los aplico a los rendimientos de cada perfil en cada mes. La desviación estándar de esos ${vb.mix.length} rendimientos es ${pct(vb.monthlySd, 2)} mensual; anualizada (× √12) da <b>${pct(vb.annualVol, 2)}</b>.</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">De dónde viene.</b> <b>${esc(top.name)}</b> pesa ${pct(top.weight, 0)} pero aporta <b>${pct(top.contribution, 0)}</b> del riesgo. Si los perfiles se movieran juntos, la volatilidad sería ~${pct(sumOwn, 1)}; la diferencia es la diversificación (correlaciones: ${vb.corrPairs.map(pair => `${esc(pair.pair)} ${pair.corr == null || !isFinite(pair.corr) ? '—' : pair.corr.toFixed(2)}`).join(', ')}).</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">Qué la cambia.</b> El periodo seleccionado, la casilla de dividendos, los instrumentos excluidos y la columna Riesgo de la tabla de instrumentos.</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">Cuidado.</b> Son pocos años y pueden no incluir una crisis fuerte. Como referencia general, las acciones globales suelen moverse 15–20% al año y un portafolio balanceado 8–12%; por eso en FIRE conviene revisar también las curvas de 10% y 15%. Los instrumentos en dólares también se mueven con el tipo de cambio.</p>`, `
    <p style="margin:4px 0"><b style="color:var(--ink)">How it’s computed.</b> I take your current weights by profile (${vb.rows.map(row => `${esc(valueLabel(row.name))} ${pct(row.weight, 0)}`).join(', ')}) and apply them to each profile’s return in each month. The standard deviation of those ${vb.mix.length} returns is ${pct(vb.monthlySd, 2)} monthly; annualized (× √12) it is <b>${pct(vb.annualVol, 2)}</b>.</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">Where it comes from.</b> <b>${esc(valueLabel(top.name))}</b> weighs ${pct(top.weight, 0)} but contributes <b>${pct(top.contribution, 0)}</b> of the risk. If the profiles moved together, volatility would be ~${pct(sumOwn, 1)}; the difference is diversification (correlations: ${vb.corrPairs.map(pair => `${esc(pair.pair)} ${pair.corr == null || !isFinite(pair.corr) ? '—' : pair.corr.toFixed(2)}`).join(', ')}).</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">What changes it.</b> The selected period, the dividends checkbox, excluded instruments and the Risk column of the instruments table.</p>
    <p style="margin:4px 0"><b style="color:var(--ink)">Careful.</b> These are only a few years and may not include a severe crisis. As a general reference, global equities usually move 15–20% a year and a balanced portfolio 8–12%; that’s why in FIRE it’s worth checking the 10% and 15% curves too. Dollar instruments also move with the exchange rate.</p>`);
  const lower = vb.meanMonth - vb.monthlySd, upper = vb.meanMonth + vb.monthlySd;
  chart('cVol').setOption(base({
    grid: { left: 8, right: 70, top: 16, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
      formatter: params => { const idx = params[0].dataIndex, value = vb.mix[idx]; return ttHead(vb.labels[idx]) + ttRow(null, L('Rendimiento de la mezcla', 'Mix return'), pct(value, 2, true)) + ttRow(null, L('Desviación vs. promedio', 'Deviation vs. average'), `${((value - vb.meanMonth) / vb.monthlySd).toFixed(1)} σ`) + ttRow(null, L('Con tu saldo de hoy', 'With today’s balance'), money(value * vb.total)); } }),
    xAxis: catAxis(vb.labels), yAxis: valAxis(value => (value * 100).toFixed(0) + '%'),
    series: [{ type: 'bar', barMaxWidth: 14, data: vb.mix.map(value => ({ value, itemStyle: { color: value >= 0 ? TK.pos : TK.neg, borderRadius: value >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } })),
      markArea: { silent: true, itemStyle: { color: TK.series[0] + '14' }, label: { show: false }, data: [[{ yAxis: lower }, { yAxis: upper }]] },
      markLine: { symbol: 'none', silent: true, lineStyle: { color: TK.ink2, width: 1, type: 'solid' }, label: { color: TK.ink2, fontSize: 10, position: 'end', formatter: param => param.name },
        data: [{ yAxis: vb.meanMonth, name: `prom. ${pct(vb.meanMonth, 1)}` }, { yAxis: upper, name: '+1σ' }, { yAxis: lower, name: '−1σ' }] } }],
  }), true);
  document.getElementById('volNote').textContent = L(`Barras: rendimiento mensual de tu mezcla actual. Franja: promedio ± 1 desviación estándar (${pct(lower, 1)} a ${pct(upper, 1)}).`, `Bars: monthly return of your current mix. Band: average ± 1 standard deviation (${pct(lower, 1)} to ${pct(upper, 1)}).`);
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
  pM = pM || profileSeries(model);
  const ef = model.retIdx.length >= 6 ? efficientFrontier(pM) : null;
  if (!ef) { document.getElementById('effKpis').innerHTML = L('<div class="kpi">Se necesitan al menos 6 meses y 2 perfiles de riesgo con inversiones.</div>', '<div class="kpi">At least 6 months and 2 risk profiles with investments are needed.</div>'); document.getElementById('effWhy').innerHTML = ''; chart('cFrontier').clear(); return; }
  const names = ef.profiles.map(profile => profile.name);
  const mixLabel = mixItem => names.map((name, i) => `${valueLabel(name).slice(0, 4)}. ${pct(mixItem.weights[i], 0)}`).join(' · ');
  const gapRet = ef.sameVol.ret - ef.current.ret, gapVol = ef.current.vol - ef.sameRet.vol;
  document.getElementById('effKpis').innerHTML = [
    { label: L('Tu mezcla actual', 'Your current mix'), value: `${pct(ef.current.ret, 1)} · σ ${pct(ef.current.vol, 1)}`, detail: mixLabel(ef.current) },
    { label: L('Misma volatilidad, en la frontera', 'Same volatility, on the frontier'), value: `${pct(ef.sameVol.ret, 1)} <span class="${gapRet > 0.0005 ? 'up' : ''}" style="font-size:14px">(${pct(gapRet, 1, true)})</span>`, detail: mixLabel(ef.sameVol) },
    { label: L('Mismo rendimiento, en la frontera', 'Same return, on the frontier'), value: `σ ${pct(ef.sameRet.vol, 1)} <span style="font-size:14px">(−${pct(Math.max(gapVol, 0), 1)})</span>`, detail: mixLabel(ef.sameRet) },
    { label: L('Máximo Sharpe (tangente)', 'Maximum Sharpe (tangent)'), value: `${pct(ef.tangency.ret, 1)} · σ ${pct(ef.tangency.vol, 1)}`, detail: `${mixLabel(ef.tangency)} · Sharpe ${ef.tangency.sharpe.toFixed(2)} vs ${ef.current.sharpe != null ? ef.current.sharpe.toFixed(2) : '—'} tuyo` },
  ].map(tile => `<div class="kpi"><div class="k">${tile.label}</div><div class="v" style="font-size:20px">${tile.value}</div><div class="d">${tile.detail}</div></div>`).join('');
  const point = (mixItem, name, color, size) => ({ name, type: 'scatter', data: [[mixItem.vol, mixItem.ret]], symbolSize: size, itemStyle: { color, borderColor: TK.surface, borderWidth: 2 }, z: 5, label: { show: true, formatter: name, position: 'right', color: TK.ink, fontSize: 11, fontWeight: 600 } });
  const sample = ef.mixes.filter((_, idx) => idx % 3 === 0);
  chart('cFrontier').setOption(base({
    legend: legend({ data: [L('Mezclas posibles', 'Possible mixes'), L('Frontera eficiente', 'Efficient frontier')] }),
    grid: { left: 8, right: 70, top: legTop(34), bottom: 26, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => { const mixItem = param.seriesName === L('Frontera eficiente', 'Efficient frontier') ? ef.upper[param.dataIndex] : param.seriesName === L('Mezclas posibles', 'Possible mixes') ? sample[param.dataIndex] : ({ [L('Tú', 'You')]: ef.current, [L('Mín. varianza', 'Min. variance')]: ef.minVar, [L('Máx. Sharpe', 'Max. Sharpe')]: ef.tangency })[param.seriesName];
      return ttHead(param.seriesName) + ttRow(null, L('Rendimiento anual', 'Annual return'), pct(mixItem.ret, 2)) + ttRow(null, L('Volatilidad', 'Volatility'), pct(mixItem.vol, 2)) + ttRow(null, 'Sharpe', mixItem.sharpe == null ? '—' : mixItem.sharpe.toFixed(2)) + names.map((name, i) => ttRow(colorFor('riesgo', name), valueLabel(name), pct(mixItem.weights[i], 0))).join(''); } }),
    xAxis: valAxis(value => (value * 100).toFixed(0) + '%', { name: L('Volatilidad', 'Volatility'), nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: TK.muted, fontSize: 11 }, scale: true }),
    yAxis: valAxis(value => (value * 100).toFixed(0) + '%', { scale: true }),
    series: [
      { name: L('Mezclas posibles', 'Possible mixes'), type: 'scatter', data: sample.map(mixItem => [mixItem.vol, mixItem.ret]), symbolSize: 3, itemStyle: { color: TK.axis, opacity: 0.6 } },
      { name: L('Frontera eficiente', 'Efficient frontier'), type: 'line', data: ef.upper.map(mixItem => [mixItem.vol, mixItem.ret]), symbol: 'none', lineStyle: { width: 2.5, color: TK.series[0] }, itemStyle: { color: TK.series[0] } },
      point(ef.minVar, L('Mín. varianza', 'Min. variance'), TK.series[2], 10), point(ef.tangency, L('Máx. Sharpe', 'Max. Sharpe'), TK.series[3], 12), point(ef.current, L('Tú', 'You'), TK.ink, 14),
    ],
  }), true);
  const distance = gapRet > 0.01 || gapVol > 0.01 ? L('lejos', 'far from') : gapRet > 0.002 || gapVol > 0.002 ? L('relativamente cerca', 'relatively close to') : L('prácticamente sobre ella', 'practically on');
  document.getElementById('effWhy').innerHTML = L(`
    <h3 style="color:var(--ink)">¿Qué tan lejos estás del óptimo?</h3>
    <p style="margin:6px 0"><b style="color:var(--ink)">La idea.</b> Markowitz (1952): para cada nivel de riesgo existe una mezcla que da el mayor rendimiento posible; la curva que las une es la <b>frontera eficiente</b>. Cualquier punto debajo de ella es "ineficiente": podrías ganar más con el mismo riesgo, o lo mismo con menos riesgo, sólo cambiando las proporciones.</p>
    <p style="margin:6px 0"><b style="color:var(--ink)">Tu caso.</b> Estás <b>${distance}</b> de la frontera: con tu misma volatilidad (${pct(ef.current.vol, 1)}) la mejor mezcla histórica rinde ${pct(ef.sameVol.ret, 1)} (${pct(gapRet, 1, true)}), y para tu mismo rendimiento bastaba ${pct(ef.sameRet.vol, 1)} de volatilidad. La mezcla de máximo Sharpe (${mixLabel(ef.tangency)}) es la que más rendimiento extra sobre CETES dio por unidad de riesgo.</p>
    <p style="margin:6px 0"><b style="color:var(--ink)">Cómo leerlo con cuidado.</b> Se basa en ${ef.count} meses: medias y correlaciones históricas cambian mucho y la frontera "óptima" del pasado rara vez lo es en el futuro. No incluye impuestos, comisiones ni tu horizonte. Úsalo como diagnóstico ("¿algo me está costando riesgo sin pagarme?"), no como receta. No es una recomendación de inversión.</p>`, `
    <h3 style="color:var(--ink)">How far are you from the optimum?</h3>
    <p style="margin:6px 0"><b style="color:var(--ink)">The idea.</b> Markowitz (1952): for each level of risk there is a mix that gives the highest possible return; the curve joining them is the <b>efficient frontier</b>. Any point below it is "inefficient": you could earn more with the same risk, or the same with less risk, just by changing the proportions.</p>
    <p style="margin:6px 0"><b style="color:var(--ink)">Your case.</b> You are <b>${distance}</b> the frontier: with your same volatility (${pct(ef.current.vol, 1)}) the best historical mix returns ${pct(ef.sameVol.ret, 1)} (${pct(gapRet, 1, true)}), and for your same return ${pct(ef.sameRet.vol, 1)} volatility was enough. The maximum-Sharpe mix (${mixLabel(ef.tangency)}) is the one that delivered the most excess return over CETES per unit of risk.</p>
    <p style="margin:6px 0"><b style="color:var(--ink)">Read it carefully.</b> It is based on ${ef.count} months: historical means and correlations change a lot and the past "optimal" frontier is rarely optimal in the future. It doesn’t include taxes, fees or your horizon. Use it as a diagnostic ("is something costing me risk without paying me?"), not as a recipe. It is not investment advice.</p>`);
}

/* ============================== Dividendos ============================== */
function renderDividends() {
  const gbm = model.gbm, totals = gbm.tot;
  document.getElementById('divCoverage').textContent = L(`${ymLabel(P.first)} a ${ymLabel(P.last)}; en el periodo seleccionado ${totals.months} meses`, `${ymLabel(P.first)} to ${ymLabel(P.last)}; ${totals.months} months in the selected period`);
  const years = totals.months / 12;
  document.getElementById('divKpis').innerHTML = totals.months ? kpiHtml([
    { label: L('Distribuciones brutas', 'Gross distributions'), value: money(totals.gross), detail: L(`${totals.pays} pagos · ${moneyC(years ? totals.gross / years : 0)} al año`, `${totals.pays} payments · ${moneyC(years ? totals.gross / years : 0)} per year`) },
    { label: L('ISR retenido', 'ISR withheld'), value: `<span class="down">${money(-totals.isr)}</span>`, detail: L(`${pct(totals.gross ? -totals.isr / totals.gross : null, 1)} de lo bruto`, `${pct(totals.gross ? -totals.isr / totals.gross : null, 1)} of gross`) },
    { label: L('Distribuciones netas', 'Net distributions'), value: `<span class="up">${money(totals.net)}</span>`, detail: L(`≈ ${moneyC(totals.months ? totals.net / totals.months : 0)} al mes`, `≈ ${moneyC(totals.months ? totals.net / totals.months : 0)} per month`) },
    { label: L('Yield neto anualizado', 'Annualized net yield'), value: pct(totals.yieldNet, 2), detail: L(`bruto ${pct(totals.yieldGross, 2)} · sobre ${moneyC(totals.avgRV)} promedio`, `gross ${pct(totals.yieldGross, 2)} · on ${moneyC(totals.avgRV)} average`) },
    { label: L('Comisiones + IVA', 'Fees + VAT'), value: money(-totals.com), detail: L(`${pct(totals.avgRV && years ? -totals.com / totals.avgRV / years : null, 2)} anual del valor invertido`, `${pct(totals.avgRV && years ? -totals.com / totals.avgRV / years : null, 2)} per year of invested value`) },
    { label: L('Rendimiento reportado por GBM', 'Return reported by GBM'), value: `<span class="${cls(totals.gbmAnn)}">${pct(totals.gbmAnn, 2, true)}</span>`, detail: L(`anual · acumulado ${pct(totals.gbmCum, 1, true)} en ${totals.gbmMonths} meses`, `annual · cumulative ${pct(totals.gbmCum, 1, true)} over ${totals.gbmMonths} months`) },
  ]) : L('<div class="kpi">No hay meses en el periodo seleccionado.</div>', '<div class="kpi">There are no months in the selected period.</div>');

  setSeg('divGran', state.divGran);
  const bks = buckets(gbm.idx, state.divGran);
  const agg = arr => bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + arr[monthIdx], 0));
  const catColor = { div: TK.series[0], fibra: TK.series[1], roc: TK.series[2], frac: TK.series[3], isr: TK.neg };
  const cats = DIST_CATS.filter(cat => gbm.idx.some(monthIdx => gbm.byCat[cat][monthIdx])).concat(['isr']);
  const netB = agg(gbm.net);
  const series = cats.map(cat => ({ name: CAT_INFO[cat], type: 'bar', stack: 'd', barMaxWidth: 26, data: agg(gbm.byCat[cat]).map(value => value || null), itemStyle: { color: catColor[cat], borderColor: TK.surface, borderWidth: 1 }, emphasis: { focus: 'series' } }));
  series.push({ name: L('Neto', 'Net'), type: 'line', data: netB, symbol: 'circle', symbolSize: 5, showSymbol: bks.length < 30, lineStyle: { width: 2, color: TK.ink }, itemStyle: { color: TK.ink }, z: 5 });
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
          ttRow(null, L('Yield anualizado del periodo', 'Annualized yield for the period'), pct(rvAvg ? netB[bucketIdx] / rvAvg * 12 / bk.idx.length : null, 2)) + '</div>'; } }),
    xAxis: catAxis(bks.map(bk => bucketLabel(bk.key, state.divGran))), yAxis: valAxis(moneyC), series,
  }), true);

  const ttmIdx = gbm.idx.filter(monthIdx => gbm.ttm[monthIdx]);
  chart('cTTM').setOption(base({
    legend: legend({ data: [L('Yield neto', 'Net yield'), L('Yield bruto', 'Gross yield')] }),
    grid: { left: 8, right: 48, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } }, formatter: ps => ttHead(L('12 meses a ', '12 months to ') + ymLabel(YM[ttmIdx[ps[0].dataIndex]])) + ps.map(param => ttRow(param.color, param.seriesName, pct(param.value, 2))).join('') }),
    xAxis: catAxis(ttmIdx.map(monthIdx => ymLabel(YM[monthIdx])), { boundaryGap: false }), yAxis: valAxis(value => (value * 100).toFixed(1) + '%'),
    series: [
      { name: L('Yield neto', 'Net yield'), type: 'line', data: ttmIdx.map(monthIdx => gbm.ttm[monthIdx].net), showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] }, areaStyle: { color: TK.series[0] + '1f' }, endLabel: { show: true, formatter: param => pct(param.value, 2), color: TK.ink, fontWeight: 600 } },
      { name: L('Yield bruto', 'Gross yield'), type: 'line', data: ttmIdx.map(monthIdx => gbm.ttm[monthIdx].gross), showSymbol: false, symbol: 'circle', lineStyle: { width: 1.5, color: TK.muted }, itemStyle: { color: TK.muted } },
    ],
  }), true);

  renderDivTk();

  const calGran = state.calGran, qs = buckets(gbm.idx, calGran);
  setSeg('calGran', calGran);
  document.getElementById('calHint').textContent = L(`Distribuciones netas por ${({ m: 'mes', q: 'trimestre', y: 'año' })[calGran]} calendario`, `Net distributions by calendar ${({ m: 'month', q: 'quarter', y: 'year' })[calGran]}`);
  const calRows = gbm.tks.filter(stat => stat.gross > 0 && stat.tk !== 'EFEC').sort((left, right) => right.net - left.net);
  const cells = []; let maxV = 0;
  calRows.forEach((stat, rowIdx) => qs.forEach((bk, colIdx) => { const value = bk.idx.reduce((sum, monthIdx) => sum + stat.byM[monthIdx], 0); if (value) { cells.push([colIdx, rowIdx, value]); maxV = Math.max(maxV, value); } }));
  document.getElementById('cDivCal').style.height = Math.max(260, calRows.length * 26 + 50) + 'px';
  chart('cDivCal').resize();
  charts.cDivCal.setOption(base({
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => ttHead(`${calRows[param.value[1]].tk} · ${bucketLabel(qs[param.value[0]].key, calGran)}`) + ttRow(null, L('Neto', 'Net'), money(param.value[2])) }),
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
        return ttHead(labs[pos]) + ttRow(null, L('Rendimiento neto (GBM)', 'Net return (GBM)'), pct(reported[1], 2, true)) + ttRow(null, L('Rendimiento bruto (GBM)', 'Gross return (GBM)'), pct(reported[0], 2, true)) + (own != null ? ttRow(null, L('Calculado aquí', 'Computed here'), pct(own, 2, true)) : '') + ttRow(null, L('En pesos (neto)', 'In pesos (net)'), money(reported[3])) + ttRow(null, L('Índice acumulado', 'Cumulative index'), index[pos].toFixed(1)); } }),
    xAxis: [catAxis(labs, { gridIndex: 0, axisLabel: { show: false } }), catAxis(labs, { gridIndex: 1 })],
    yAxis: [valAxis(value => value.toFixed(0), { gridIndex: 0, scale: true }), valAxis(value => (value * 100).toFixed(0) + '%', { gridIndex: 1, splitNumber: 2 })],
    series: [
      { name: L('Índice', 'Index'), type: 'line', data: index, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] }, areaStyle: { color: TK.series[0] + '1f' }, endLabel: { show: true, formatter: param => param.value.toFixed(0), color: TK.ink, fontWeight: 600 } },
      { name: L('Mensual', 'Monthly'), type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 10, data: rets.map(ret => ({ value: ret, itemStyle: { color: ret >= 0 ? TK.pos : TK.neg } })) },
    ],
  }), true);

  const yrs = [...new Set(gbm.idx.map(monthIdx => YM[monthIdx].slice(0, 4)))];
  const byY = arr => yrs.map(year => gbm.idx.filter(monthIdx => YM[monthIdx].startsWith(year)).reduce((sum, monthIdx) => sum + arr[monthIdx], 0));
  chart('cCosts').setOption(base({
    legend: legend({ data: [L('Comisiones + IVA', 'Fees + VAT'), L('ISR retenido', 'ISR withheld')] }),
    grid: { left: 8, right: 8, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } }, formatter: ps => ttHead(yrs[ps[0].dataIndex]) + ps.map(param => ttRow(param.color, param.seriesName, money(param.value))).join('') }),
    xAxis: catAxis(yrs), yAxis: valAxis(moneyC),
    series: [
      { name: L('Comisiones + IVA', 'Fees + VAT'), type: 'bar', barMaxWidth: 22, data: byY(gbm.com).map(value => -value), itemStyle: { color: TK.series[1], borderRadius: [4, 4, 0, 0] } },
      { name: L('ISR retenido', 'ISR withheld'), type: 'bar', barMaxWidth: 22, data: byY(gbm.byCat.isr).map(value => -value), itemStyle: { color: TK.series[6], borderRadius: [4, 4, 0, 0] } },
    ],
  }), true);
  document.getElementById('costNote').textContent = L(`Premio cobrado por el efectivo en reporto en el periodo: ${money(totals.intr)}.`, `Repo interest earned on cash during the period: ${money(totals.intr)}.`);

  const trs = gbm.tks.filter(stat => stat.gross || stat.isr).sort((left, right) => right.net - left.net);
  const cats2 = DIST_CATS.filter(cat => trs.some(stat => stat.cats[cat]));
  document.getElementById('divTbl').innerHTML = thead([[L('Instrumento', 'Instrument'), 1], ...cats2.map(cat => [CAT_INFO[cat]]), [L('ISR retenido', 'ISR withheld')], [L('Neto', 'Net')], [L('Valor prom.', 'Avg. value')], [L('Meses', 'Months')], [L('Pagos/año', 'Payments/yr')], [L('Yield bruto', 'Gross yield')], [L('Yield neto', 'Net yield')], [L('En especie', 'In kind')]]) + '<tbody>' +
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
    if (heldMonths < 12 && cal && cal.frecuencia) { freq = cal.frecuencia; source = count ? L('historial corto + IA', 'short history + AI') : 'IA'; }
    else if (heldMonths < 12) { freq = 'pocos datos'; source = L(`${heldMonths} meses de historial · usa “Completar con IA”`, `${heldMonths} months of history · use “Fill in with AI”`); }
    const aiMonths = cal && cal.meses_pago ? cal.meses_pago : [];
    return { tk, freq, count, byMonth, aiMonths, net12, last, source, held: !!(MONTHS[end].hold[tk] && MONTHS[end].hold[tk][1] > 0), cal };
  }).filter(row => row.count || row.cal || row.held)
    .sort((left, right) => FREQ_ORDER.indexOf(left.freq) - FREQ_ORDER.indexOf(right.freq) || right.net12 - left.net12);
}
// Por instrumento: aparte para poder animarlo en el tiempo (timeplay.js)
function renderDivTk() {
  const gbm = model.gbm;
  setSeg('divMetric', state.divMetric);
  const metric = state.divMetric;
  const rows = gbm.tks.filter(stat => stat.gross > 0 && stat.tk !== 'EFEC' && (metric === 'net' || stat.yield != null)).sort((left, right) => (metric === 'net' ? left.net - right.net : left.yield - right.yield));
  document.getElementById('divTkHint').textContent = metric === 'net' ? L('Pesos netos de ISR recibidos en el periodo', 'Pesos received net of ISR in the period') : L('Distribuciones netas ÷ valor promedio mientras lo tuviste, anualizado. Atenuados: menos de 6 meses.', 'Net distributions ÷ average value while you held it, annualized. Faded: less than 6 months.');
  const divEl = document.getElementById('cDivTk'), needH = Math.max(260, rows.length * 26 + 30); divEl.style.height = (FRAME == null ? needH : Math.max(needH, divEl.clientHeight)) + 'px';   // al animar sólo crece
  chart('cDivTk').resize();
  const tip = stat => ttHead(`${stat.tk} · ${clsOf(stat.tk).nombre}`) + DIST_CATS.filter(cat => stat.cats[cat]).map(cat => ttRow(null, CAT_INFO[cat], money(stat.cats[cat]))).join('') + ttRow(null, L('ISR retenido', 'ISR withheld'), money(stat.isr)) + ttRow(null, L('Neto', 'Net'), money(stat.net)) +
    ttRow(null, L('Valor promedio', 'Average value'), money(stat.avg)) + ttRow(null, L('Meses invertido', 'Months invested'), stat.months) + ttRow(null, L('Pagos al año', 'Payments per year'), stat.perYear.toFixed(1)) + ttRow(null, L('Yield bruto / neto', 'Gross / net yield'), `${pct(stat.yieldGross, 2)} / ${pct(stat.yield, 2)}`) + (stat.esp ? ttRow(null, L('En especie (ya en el valor)', 'In kind (already in the value)'), money(stat.esp)) : '');
  const valueOf = stat => metric === 'net' ? stat.net : stat.yield, fmt = value => metric === 'net' ? moneyC(value) : pct(value, 1);
  if (FRAME != null) {   // animación en el tiempo: carrera de barras
    raceBars(charts.cDivTk, { rows: [...rows].reverse().map(stat => ({ key: stat.tk, label: stat.tk, value: valueOf(stat), stat, color: TK.series[0], opacity: stat.months < 6 ? 0.4 : 1 })), fmt,
      axisFmt: metric === 'net' ? moneyC : value => (value * 100).toFixed(0) + '%', tooltip: row => tip(row.stat), rowPx: 26 });
    return;
  }
  charts.cDivTk.setOption(base({
    grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: param => tip(rows[param.dataIndex]) }),
    xAxis: valAxis(metric === 'net' ? moneyC : value => (value * 100).toFixed(0) + '%'),
    yAxis: catAxis(rows.map(row => row.tk), { axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [{ type: 'bar', barMaxWidth: 14, data: rows.map(row => ({ value: valueOf(row), itemStyle: { color: TK.series[0], opacity: row.months < 6 ? 0.4 : 1, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: TK.muted, fontSize: 10, formatter: param => fmt(param.value) } }],
  }), true);
}

function renderFrequency() {
  const rows = paymentFrequency();
  const groups = FREQ_ORDER.map(freq => [freq, rows.filter(row => row.freq === freq)]).filter(([, list]) => list.length);
  document.getElementById('freqHint').textContent = groups.map(([freq, list]) => `${valueLabel(freq)[0].toUpperCase() + valueLabel(freq).slice(1)}: ${list.map(row => row.tk).join(', ')}`).join(' · ') || L('Sin pagos en los últimos 24 meses.', 'No payments in the last 24 months.');
  const strip = row => '<span class="mstrip">' + MES.map((name, idx) => {
    const paid = row.byMonth[idx], ai = row.aiMonths.includes(idx + 1);
    return `<i class="${paid ? 'p' : ai ? 'a' : ''}" title="${name}${paid ? L(`: pagó ${paid} vez/veces en 24 meses`, `: paid ${paid} time(s) in 24 months`) : ai ? L(': según el calendario importado', ': per the imported calendar') : ''}">${name[0].toUpperCase()}</i>`;
  }).join('') + '</span>';
  document.getElementById('freqTbl').innerHTML = thead([[L('Instrumento', 'Instrument'), 1], [L('Frecuencia', 'Frequency'), 1], [L('Meses en que paga', 'Months it pays'), 1], [L('Pagos en 12 m', 'Payments in 12 m')], [L('Neto 12 m', 'Net 12 m')], [L('Último pago', 'Last payment')], [L('Yield aprox. (IA)', 'Approx. yield (AI)')], [L('Fuente', 'Source'), 1]]) + '<tbody>' +
    rows.map(row => '<tr' + (row.held ? '' : ' class="closed"') + '>' + td(row.tk, `<b style="font-weight:600">${esc(row.tk)}</b> <span style="color:var(--muted)">${esc(clsOf(row.tk).nombre)}</span>`, 'l') +
      td(FREQ_ORDER.indexOf(row.freq), `<span class="freq f-${row.freq.replace(/ /g, '-')}">${valueLabel(row.freq)}</span>`, 'l') + `<td class="l">${strip(row)}</td>` +
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
  return L('<a href="https://www.bmv.com.mx/" target="_blank" rel="noopener">BMV (eventos relevantes)</a>', '<a href="https://www.bmv.com.mx/" target="_blank" rel="noopener">BMV (relevant events)</a>');
}
function renderUpcoming() {
  const rows = upcomingDistributions();
  const total12 = rows.reduce((sum, row) => sum + row.estimate, 0);
  document.getElementById('nextHint').textContent = L(`Con base en tus estados de cuenta hasta ${ymLabel(P.last)}. Próximos 12 meses estimados: ${money(total12)} netos.`, `Based on your statements through ${ymLabel(P.last)}. Estimated next 12 months: ${money(total12)} net.`);
  const byMonth = {}; rows.forEach(row => { byMonth[row.ym] = (byMonth[row.ym] || 0) + row.estimate; });
  document.getElementById('nextKpis').innerHTML = Object.keys(byMonth).sort().slice(0, 4).map(ym => `<div class="kpi"><div class="k">${ymLabel(ym)}</div><div class="v" style="font-size:20px">${money(byMonth[ym])}</div><div class="d">${rows.filter(row => row.ym === ym).map(row => esc(row.tk)).join(', ')}</div></div>`).join('');
  document.getElementById('nextTbl').innerHTML = thead([[L('Mes estimado', 'Estimated month'), 1], [L('Instrumento', 'Instrument'), 1], [L('Monto neto estimado', 'Estimated net amount')], [L('Pagos al año', 'Payments per year')], [L('Último pago', 'Last payment')], [L('Dónde verificar', 'Where to verify'), 1]]) + '<tbody>' +
    rows.map(row => '<tr>' + td(row.ym, ymLabel(row.ym), 'l') + td(row.tk, `<b style="font-weight:600">${esc(row.tk)}</b> <span style="color:var(--muted)">${esc(clsOf(row.tk).nombre)}</span>`, 'l') + td(row.estimate, money(row.estimate)) + td(row.perYear, row.perYear) + td(row.lastYm, row.fromCal ? L('<span style="color:var(--muted)">sin pagos aún · calendario importado</span>', '<span style="color:var(--muted)">no payments yet · imported calendar</span>') : `${ymLabel(row.lastYm)} · ${money(row.lastNet)}`) + `<td class="l">${verifyLink(row.tk)}</td></tr>`).join('') +
    L(`</tbody><tfoot><tr><td class="l">Total 12 meses</td><td></td><td>${money(total12)}</td><td></td><td></td><td></td></tr></tfoot>`, `</tbody><tfoot><tr><td class="l">Total 12 months</td><td></td><td>${money(total12)}</td><td></td><td></td><td></td></tr></tfoot>`);
  sortable('nextTbl');
}

/* ============================== Flujos ============================== */
function renderFlows() {
  const { retIdx, groupBy } = model;
  const dep = retIdx.reduce((sum, monthIdx) => sum + (MONTHS[monthIdx].ext.dep || 0), 0), wd = retIdx.reduce((sum, monthIdx) => sum + (MONTHS[monthIdx].ext.wd || 0), 0);
  const bought = model.ranked.reduce((sum, it) => sum + it.st.buys, 0), sold = model.ranked.reduce((sum, it) => sum + it.st.sells, 0);
  document.getElementById('flowKpis').innerHTML = kpiHtml([
    { label: L('Depósitos', 'Deposits'), value: `<span class="up">${money(dep)}</span>`, detail: L(`${retIdx.filter(monthIdx => MONTHS[monthIdx].ext.dep).length} meses con depósitos`, `${retIdx.filter(monthIdx => MONTHS[monthIdx].ext.dep).length} months with deposits`) },
    { label: L('Retiros', 'Withdrawals'), value: `<span class="down">${money(wd)}</span>`, detail: wd ? L(`${retIdx.filter(monthIdx => MONTHS[monthIdx].ext.wd).length} meses con retiros`, `${retIdx.filter(monthIdx => MONTHS[monthIdx].ext.wd).length} months with withdrawals`) : L('sin retiros', 'no withdrawals') },
    { label: L('Ahorro neto', 'Net savings'), value: money(dep - wd), detail: L(`≈ ${moneyC(retIdx.length ? (dep - wd) / retIdx.length : 0)} al mes`, `≈ ${moneyC(retIdx.length ? (dep - wd) / retIdx.length : 0)} per month`) },
    { label: L('Comprado / vendido', 'Bought / sold'), value: `${moneyC(bought)} / ${moneyC(sold)}`, detail: L('incluye fondos de inversión y eventos corporativos', 'includes investment funds and corporate actions') },
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
  document.getElementById('flowHint').textContent = L(`Compras − ventas por ${byInst ? 'instrumento (color por ' + DIMS[state.dim].label.toLowerCase() + ')' : DIMS[state.dim].label.toLowerCase()}; la línea son tus depósitos − retiros`, `Purchases − sales by ${byInst ? 'instrument (color by ' + DIMS[state.dim].label.toLowerCase() + ')' : DIMS[state.dim].label.toLowerCase()}; the line is your deposits − withdrawals`);
  const series = groups.map(group => ({ name: group.name, type: 'bar', stack: 'f', barMaxWidth: 24, itemStyle: { color: group.color, borderColor: TK.surface, borderWidth: 1 }, emphasis: { focus: 'series' },
    data: bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + group.flow[monthIdx], 0) || null) }));
  series.push({ name: L('Depósitos − retiros', 'Deposits − withdrawals'), type: 'line', data: bks.map(bk => bk.idx.reduce((sum, monthIdx) => sum + (MONTHS[monthIdx].ext.dep || 0) - (MONTHS[monthIdx].ext.wd || 0), 0)), symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: TK.ink }, itemStyle: { color: TK.ink }, z: 5 });
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
    legend: legend({ data: [L('Comprado', 'Bought'), L('Vendido', 'Sold')] }),
    grid: { left: 8, right: 16, top: legTop(32), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: TK.grid + '80' } },
      formatter: ps => { const it = rows[ps[0].dataIndex]; return ttHead(`${it.tk} · ${it.name}`) + ttRow(TK.pos, L('Comprado', 'Bought'), money(it.st.buys)) + ttRow(TK.series[1], L('Vendido', 'Sold'), money(it.st.sells)) + ttRow(null, L('Neto', 'Net'), money(it.st.net)) + ttRow(null, L('Ganancia', 'Gain'), money(it.st.gain)); } }),
    xAxis: valAxis(moneyC), yAxis: catAxis(rows.map(it => it.tk), { axisLabel: { color: TK.ink2, fontSize: 11 } }),
    series: [
      { name: L('Comprado', 'Bought'), type: 'bar', stack: 'io', barMaxWidth: 14, itemStyle: { color: TK.pos, borderRadius: [0, 4, 4, 0] }, data: rows.map(it => it.st.buys || null) },
      { name: L('Vendido', 'Sold'), type: 'bar', stack: 'io', barMaxWidth: 14, itemStyle: { color: TK.series[1], borderRadius: [4, 0, 0, 4] }, data: rows.map(it => it.st.sells ? -it.st.sells : null) },
    ],
  }), true);
}

/* ============================== Detalle ============================== */
const EVENT_LABEL = { compra: L('Compra', 'Purchase'), venta: L('Venta', 'Sale'), div: L('Dividendo', 'Dividend'), fibra: L('Resultado fiscal', 'Taxable result'), roc: L('Reembolso de capital', 'Return of capital'), frac: L('Fracciones', 'Fractions'), isr: 'ISR', corp: L('Evento corporativo', 'Corporate action'), especie: L('Dividendo en especie', 'Dividend in kind'), especie_valor: L('Valor en especie', 'Value in kind'), deposito_valores: L('Depósito de títulos', 'Titles deposited'), retiro_valores: L('Retiro de títulos', 'Titles withdrawn'), comision: L('Comisión', 'Fee'), otro: 'Otro' };
function renderDetail() {
  const { idx, insts, rec, valOf } = model;
  const sel = document.getElementById('detSel');
  const sorted = [...insts].sort((left, right) => (right.active - left.active) || right.st.vEnd - left.st.vEnd);
  if (!state.detail || !insts.find(it => it.tk === state.detail)) state.detail = sorted[0].tk;
  sel.innerHTML = sorted.map(it => `<option value="${esc(it.tk)}"${it.tk === state.detail ? ' selected' : ''}>${esc(it.isCash ? it.name : `${it.tk} · ${it.name}`)}${it.active ? '' : L(' (cerrado)', ' (closed)')}</option>`).join('');
  const it = insts.find(inst => inst.tk === state.detail), st = it.st;
  document.getElementById('detTitle').textContent = it.isCash ? it.name : `${it.tk} ${it.serie} · ${it.name}`;
  document.getElementById('detHint').textContent = `${valueLabel(it.cls.tipo)} · ${valueLabel(it.cls.clase)} · ${valueLabel(it.cls.region)} · ${valueLabel(it.cls.riesgo)} · ${it.cls.moneda}` + (it.first ? L(` · en tus estados desde ${ymLabel(it.first)}`, ` · in your statements since ${ymLabel(it.first)}`) : '');
  document.getElementById('detStats').innerHTML = [
    [L('Valor al cierre', 'Closing value'), money(st.vEnd)], [L('Títulos', 'Titles'), st.tit != null ? st.tit.toLocaleString('es-MX') : '—'], [L('Peso al cierre', 'Closing weight'), pct(st.wEnd, 1)], [L('Peso promedio', 'Average weight'), pct(st.wAvg, 1)],
    [L('Anualizado', 'Annualized'), `<span class="${cls(st.ann)}">${pct(st.ann, 2, true)}</span>`], [L('Acumulado', 'Cumulative'), `<span class="${cls(st.cum)}">${pct(st.cum, 1, true)}</span>`],
    [L('Ganancia $', 'Gain $'), `<span class="${cls(st.gain)}">${money(st.gain)}</span>`], [L('Comprado', 'Bought'), money(st.buys)], [L('Vendido', 'Sold'), money(st.sells)],
    [L('Dividendos netos', 'Net dividends'), st.dist ? money(st.dist) : '—'], [L('Volatilidad anual', 'Annual volatility'), pct(st.vol, 1)],
    [L('Mejor mes', 'Best month'), st.best ? `${ymLabel(YM[st.best.monthIdx])} ${pct(st.best.ret, 1, true)}` : '—'], [L('Peor mes', 'Worst month'), st.worst ? `${ymLabel(YM[st.worst.monthIdx])} ${pct(st.worst.ret, 1, true)}` : '—'],
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
    legend: legend({ data: [L('Valor', 'Value'), L('Capital aportado neto', 'Net contributed capital')] }),
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [{ left: 8, right: 16, top: legTop(34), height: '52%', containLabel: true }, { left: 8, right: 16, top: '70%', bottom: 8, containLabel: true }],
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const offset = ps[0].dataIndex; return ttHead(labels[offset]) + ttRow(TK.series[0], L('Valor', 'Value'), money(value[offset])) + ttRow(TK.series[1], L('Capital aportado neto', 'Net contributed capital'), money(aport[offset])) + (rets[offset] != null ? ttRow(null, L('Rendimiento del mes', 'Month’s return'), pct(rets[offset], 2, true)) : ''); } }),
    xAxis: [catAxis(labels, { gridIndex: 0, axisLabel: { show: false } }), catAxis(labels, { gridIndex: 1 })],
    yAxis: [valAxis(moneyC, { gridIndex: 0 }), valAxis(value => (value * 100).toFixed(0) + '%', { gridIndex: 1, splitNumber: 2 })],
    series: [
      { name: L('Valor', 'Value'), type: 'line', data: value, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: TK.series[0] + '40' }, { offset: 1, color: TK.series[0] + '05' }]) } },
      { name: L('Capital aportado neto', 'Net contributed capital'), type: 'line', data: aport, showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[1] }, itemStyle: { color: TK.series[1] } },
      { name: L('Rendimiento', 'Return'), type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 10, data: rets.map(ret => ({ value: ret, itemStyle: { color: ret == null ? TK.other : ret >= 0 ? TK.pos : TK.neg } })) },
    ],
  }), true);
  const lo = YM[model.rangeStart], hi = YM[model.rangeEnd];
  const moves = P.events.filter(event => event[2] === it.tk && event[0] >= lo && event[0] <= hi && event[3] !== 'especie').reverse();
  document.getElementById('detMoves').innerHTML = it.isCash ? L('<tbody><tr><td class="l">El efectivo no tiene movimientos propios: recibe depósitos, ventas y dividendos y paga compras, retiros y comisiones.</td></tr></tbody>', '<tbody><tr><td class="l">Cash has no movements of its own: it receives deposits, sales and dividends and pays purchases, withdrawals and fees.</td></tr></tbody>')
    : moves.length ? thead([[L('Fecha', 'Date'), 1], [L('Movimiento', 'Movement'), 1], [L('Monto', 'Amount')], [L('Descripción', 'Description'), 1]]) + '<tbody>' +
      moves.map(([ym, day, tk, cat, amt, desc]) => '<tr>' + td(`${ym}-${String(day).padStart(2, '0')}`, day ? `${String(day).padStart(2, '0')} ${ymLabel(ym)}` : ymLabel(ym), 'l') + td(cat, EVENT_LABEL[cat] || cat, 'l') +
        td(amt, `<span class="${amt >= 0 ? 'mv-in' : 'mv-out'}">${money(amt)}</span>`) + `<td class="l" style="color:var(--muted)">${esc(desc)}</td></tr>`).join('') + '</tbody>'
    : L('<tbody><tr><td class="l">Sin movimientos en el periodo.</td></tr></tbody>', '<tbody><tr><td class="l">No movements in the period.</td></tr></tbody>');
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
    { label: L(`Inflación acumulada (${ymLabel(first.ym)} → ${ymLabel(last.ym)})`, `Cumulative inflation (${ymLabel(first.ym)} → ${ymLabel(last.ym)})`), value: pct(infCum, 1), detail: L(`${pct(infAnn, 2)} anual promedio (INPC, INEGI${last.ym > INPC_LAST ? `; desde ${ymLabel(INPC_LAST)} estimado con ${pct(state.inf, 1)}` : ''})`, `${pct(infAnn, 2)} average per year (INPC, INEGI${last.ym > INPC_LAST ? `; from ${ymLabel(INPC_LAST)} estimated at ${pct(state.inf, 1)}` : ''})`) },
    { label: L(`Tu portafolio de hoy en pesos de ${ymLabel(first.ym)}`, `Your portfolio today in pesos of ${ymLabel(first.ym)}`), value: money(last.value / (1 + infCum)), detail: L(`${money(last.value)} nominales`, `${money(last.value)} nominal`) },
    { label: L('Aportado neto, ajustado a pesos de hoy', 'Net contributed, in today’s pesos'), value: money(last.adj), detail: L(`${money(last.nom)} nominales (+${moneyC(last.adj - last.nom)} por inflación)`, `${money(last.nom)} nominal (+${moneyC(last.adj - last.nom)} from inflation)`) },
    { label: L('Ganancia real (pesos de hoy)', 'Real gain (today’s pesos)'), value: `<span class="${cls(gainReal)}">${money(gainReal)}</span>`, detail: L(`vs. ${money(last.value - last.nom)} de ganancia nominal`, `vs. ${money(last.value - last.nom)} nominal gain`) },
    { label: L('Rendimiento real anual (TWR)', 'Real annual return (TWR)'), value: `<span class="${cls(realTWR)}">${pct(realTWR, 2, true)}</span>`, detail: L(`${pct(model.kp.ann, 2, true)} nominal − inflación ${pct(infAnn, 2)}`, `${pct(model.kp.ann, 2, true)} nominal − inflation ${pct(infAnn, 2)}`) },
  ]);
  const real = state.infMode === 'real';
  const ser = real
    ? [{ name: L('Valor (pesos de hoy)', 'Value (today’s pesos)'), data: pts.map(point => point.value * Iend / point.inpc), color: TK.series[0], area: true }, { name: L('Aportado (pesos de hoy)', 'Contributed (today’s pesos)'), data: pts.map(point => point.adj * Iend / point.inpc), color: TK.series[1] }]
    : [{ name: L('Valor', 'Value'), data: pts.map(point => point.value), color: TK.series[0], area: true }, { name: L('Aportado nominal', 'Nominal contributed'), data: pts.map(point => point.nom), color: TK.muted }, { name: L('Aportado + inflación', 'Contributed + inflation'), data: pts.map(point => point.adj), color: TK.series[1] }];
  document.getElementById('infHint').textContent = real ? L(`Todo expresado en pesos de ${ymLabel(last.ym)}: la distancia entre las líneas es tu ganancia real.`, `Everything in pesos of ${ymLabel(last.ym)}: the gap between the lines is your real gain.`) : L('Valor nominal vs. lo que aportaste, y lo que aportaste actualizado por inflación a cada fecha (lo mínimo para no perder poder adquisitivo).', 'Nominal value vs. what you contributed, and what you contributed adjusted for inflation to each date (the minimum to keep purchasing power).');
  chart('cInf').setOption(base({
    legend: legend({ data: ser.map(item => item.name) }),
    grid: { left: 8, right: 70, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const point = pts[ps[0].dataIndex]; return ttHead(ymLabel(point.ym)) + ps.map(param => ttRow(param.color, param.seriesName, money(param.value))).join('') + ttRow(null, L('Inflación acumulada', 'Cumulative inflation'), pct(point.inpc / Ist - 1, 1)); } }),
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
    box.innerHTML = L(`
      <div class="card"><h3>Valor pasado</h3><p class="hint">Cuánto vale hoy un monto de otra fecha, y al revés (INPC real)</p>
        <div class="cfg" style="margin:8px 0">$ <input data-field="pastAmt" data-amt> de hoy vs. <input type="month" data-field="pastYm" min="${INPC_KEYS[0]}" max="${INPC_LAST}" style="width:140px"></div><div id="tvPast"></div></div>
      <div class="card"><h3>Valor futuro</h3><p class="hint">Cuánto tendrás si inviertes hoy, en pesos de entonces y de hoy</p>
        <div class="cfg" style="margin:8px 0">$ <input data-field="futAmt" data-amt> a <input class="rate" type="number" step="0.1" data-field="rate">% por <input class="rate" type="number" step="1" min="1" data-field="years"> años</div><div id="tvFut"></div></div>
      <div class="card"><h3>Valor presente</h3><p class="hint">Qué significa hoy una meta futura</p>
        <div class="cfg" style="margin:8px 0">Meta de $ <input data-field="goal" data-amt> dentro de <input class="rate" type="number" step="1" min="1" data-field="goalYears"> años</div><div id="tvPres"></div></div>`, `
      <div class="card"><h3>Past value</h3><p class="hint">What an amount from another date is worth today, and vice versa (actual INPC)</p>
        <div class="cfg" style="margin:8px 0">$ <input data-field="pastAmt" data-amt> today vs. <input type="month" data-field="pastYm" min="${INPC_KEYS[0]}" max="${INPC_LAST}" style="width:140px"></div><div id="tvPast"></div></div>
      <div class="card"><h3>Future value</h3><p class="hint">How much you’ll have if you invest today, in pesos of then and of today</p>
        <div class="cfg" style="margin:8px 0">$ <input data-field="futAmt" data-amt> at <input class="rate" type="number" step="0.1" data-field="rate">% for <input class="rate" type="number" step="1" min="1" data-field="years"> years</div><div id="tvFut"></div></div>
      <div class="card"><h3>Present value</h3><p class="hint">What a future goal means today</p>
        <div class="cfg" style="margin:8px 0">Goal of $ <input data-field="goal" data-amt> in <input class="rate" type="number" step="1" min="1" data-field="goalYears"> years</div><div id="tvPres"></div></div>`);
  }
  box.querySelectorAll('input').forEach(element => {
    if (element.hasAttribute('data-amt')) element.type = state.hideAmt ? 'password' : 'number';
    const key = element.dataset.field, val = values[key];
    if (document.activeElement !== element) element.value = key === 'rate' ? (val * 100).toFixed(2) : val;
  });
  const now = INPC_LAST, ratio = inpc(now) / inpc(values.pastYm);
  const line = (label, value) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--grid)"><span style="color:var(--ink2)">${label}</span><b style="font-variant-numeric:tabular-nums">${value}</b></div>`;
  document.getElementById('tvPast').innerHTML = line(L(`${money(values.pastAmt)} de hoy (${ymLabel(now)}) en pesos de ${ymLabel(values.pastYm)}`, `${money(values.pastAmt)} today (${ymLabel(now)}) in pesos of ${ymLabel(values.pastYm)}`), money(values.pastAmt / ratio)) + line(L(`${money(values.pastAmt)} de ${ymLabel(values.pastYm)} en pesos de hoy`, `${money(values.pastAmt)} of ${ymLabel(values.pastYm)} in today’s pesos`), money(values.pastAmt * ratio)) + line(L('Inflación acumulada entre ambas fechas', 'Cumulative inflation between both dates'), pct(ratio - 1, 1));
  const fvN = values.futAmt * Math.pow(1 + values.rate, values.years), fvR = fvN / Math.pow(1 + state.inf, values.years);
  document.getElementById('tvFut').innerHTML = line(L(`Valor en ${values.years} años (nominal)`, `Value in ${values.years} years (nominal)`), money(fvN)) + line(L(`En pesos de hoy (inflación ${pct(state.inf, 1)})`, `In today’s pesos (inflation ${pct(state.inf, 1)})`), money(fvR)) + line(L('Rendimiento real anual', 'Real annual return'), pct((1 + values.rate) / (1 + state.inf) - 1, 2));
  const pvInf = values.goal / Math.pow(1 + state.inf, values.goalYears), pvRate = values.goal / Math.pow(1 + values.rate, values.goalYears);
  document.getElementById('tvPres').innerHTML = line(L(`${money(values.goal)} en ${values.goalYears} años equivalen hoy a`, `${money(values.goal)} in ${values.goalYears} years is worth today`), money(pvInf)) + line(L(`Necesitas invertir hoy a ${pct(values.rate, 2)}`, `You need to invest today at ${pct(values.rate, 2)}`), money(pvRate)) +
    line(L('O ahorrar al mes (mismo rendimiento)', 'Or save per month (same return)'), money(values.goal * (values.rate / 12) / (Math.pow(1 + values.rate / 12, values.goalYears * 12) - 1)));
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
    box.innerHTML = L(`<span>Edad actual <input class="rate" type="number" step="1" data-field="age"></span>
      <span>Retiro a los <input class="rate" type="number" step="1" data-field="retAge"></span>
      <span>Hasta los <input class="rate" type="number" step="1" data-field="endAge"></span>
      <span>Tasa anual <input class="rate" type="number" step="0.1" data-field="rate">%</span>
      <span>Saldo hoy $ <input data-field="saldo" data-amt></span>
      <span>Aportas al mes $ <input data-field="aport" data-amt></span>
      <span><label style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-field="aportGrow" style="width:auto"> crece con inflación</label></span>
      <span>Retiro deseado (pesos de hoy) $ <input data-field="need" data-amt></span>
      <button data-preset="8">Tasa 8% (conservadora)</button><button data-preset="twr">Mi TWR</button><button data-preset="reset">Valores por defecto</button>`, `<span>Current age <input class="rate" type="number" step="1" data-field="age"></span>
      <span>Retire at <input class="rate" type="number" step="1" data-field="retAge"></span>
      <span>Until age <input class="rate" type="number" step="1" data-field="endAge"></span>
      <span>Annual rate <input class="rate" type="number" step="0.1" data-field="rate">%</span>
      <span>Balance today $ <input data-field="saldo" data-amt></span>
      <span>Monthly contribution $ <input data-field="aport" data-amt></span>
      <span><label style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-field="aportGrow" style="width:auto"> grows with inflation</label></span>
      <span>Desired withdrawal (today’s pesos) $ <input data-field="need" data-amt></span>
      <button data-preset="8">8% rate (conservative)</button><button data-preset="twr">My TWR</button><button data-preset="reset">Defaults</button>`);
  }
  box.querySelectorAll('input').forEach(element => {
    if (element.hasAttribute('data-amt')) element.type = state.hideAmt ? 'password' : 'number';
    const key = element.dataset.field; if (document.activeElement === element) return;
    if (element.type === 'checkbox') element.checked = !!inputs[key]; else element.value = key === 'rate' ? (inputs[key] * 100).toFixed(2) : inputs[key];
  });
  const early = earliestRetirement(projection);
  document.getElementById('retKpis').innerHTML = kpiHtml([
    { label: L(`Saldo a los ${inputs.retAge}`, `Balance at ${inputs.retAge}`), value: money(projection.atRet), detail: L(`${money(projection.atRetReal)} en pesos de hoy`, `${money(projection.atRetReal)} in today’s pesos`) },
    { label: L('Retiro mensual simple', 'Simple monthly withdrawal'), value: money(projection.simple), detail: L(`saldo ÷ ${projection.n2} meses, sin rendimientos en el retiro · ${money(projection.simple / projection.defl)} de hoy`, `balance ÷ ${projection.n2} months, no returns during retirement · ${money(projection.simple / projection.defl)} today`) },
    { label: L('Retiro mensual fijo (sigue invirtiendo)', 'Fixed monthly withdrawal (keeps investing)'), value: money(projection.fixed), detail: L(`mismo monto nominal hasta los ${inputs.endAge} · ${money(projection.fixed / projection.defl)} de hoy al inicio`, `same nominal amount until ${inputs.endAge} · ${money(projection.fixed / projection.defl)} today at the start`) },
    { label: L('Retiro que crece con la inflación (pesos de hoy)', 'Inflation-growing withdrawal (today’s pesos)'), value: `<span class="up">${money(projection.growingReal)}</span>`, detail: L(`${money(projection.growing)} nominales al empezar, sube ${pct(state.inf, 1)} al año hasta los ${inputs.endAge}`, `${money(projection.growing)} nominal at the start, rises ${pct(state.inf, 1)} per year until ${inputs.endAge}`) },
    { label: L(`Se necesitarán (${pct(state.inf, 1)} de inflación)`, `Will be needed (${pct(state.inf, 1)} inflation)`), value: money(projection.needAtRet), detail: L(`al mes a los ${inputs.retAge} para igualar ${money(inputs.need)} de hoy`, `per month at ${inputs.retAge} to match ${money(inputs.need)} today`) },
    { label: L('Cobertura', 'Coverage'), value: `${(projection.growingReal / inputs.need).toFixed(1)}×`, detail: early ? L(`con estos supuestos alcanzarías tu retiro deseado desde los ${early} años`, `with these assumptions you’d reach your desired withdrawal from age ${early}`) : L('no alcanza el retiro deseado antes de la edad final', 'does not reach the desired withdrawal before the final age') },
  ]);
  document.getElementById('retNote').innerHTML = L(`Tasa mensual = ${pct(inputs.rate, 2)} ÷ 12. Aportación por defecto: tu ahorro neto mensual promedio de los últimos 12 meses (${money(inputs.avgAport)}). La tasa por defecto es tu TWR del periodo seleccionado${state.incDiv ? L(' con dividendos', ' with dividends') : ''}. Es una proyección con supuestos constantes, no una garantía.`, `Monthly rate = ${pct(inputs.rate, 2)} ÷ 12. Default contribution: your average net monthly savings over the last 12 months (${money(inputs.avgAport)}). The default rate is your TWR for the selected period${state.incDiv ? ' with dividends' : ''}. It’s a projection with constant assumptions, not a guarantee.`);
  chart('cRet').setOption(base({
    legend: legend({ data: [L('Saldo nominal', 'Nominal balance'), L('Saldo en pesos de hoy', 'Balance in today’s pesos')] }),
    grid: { left: 8, right: 70, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const point = projection.path[ps[0].dataIndex]; return ttHead(L(`${Math.round(point.age)} años`, `${Math.round(point.age)} years`) + (point.age > inputs.retAge ? L(' · retirando', ' · withdrawing') : point.age === inputs.retAge ? L(' · retiro', ' · retirement') : '')) + ps.map(param => ttRow(param.color, param.seriesName, money(param.value))).join(''); } }),
    xAxis: catAxis(projection.path.map(point => Math.round(point.age)), { boundaryGap: false }), yAxis: valAxis(moneyC),
    series: [
      { name: L('Saldo nominal', 'Nominal balance'), type: 'line', data: projection.path.map(point => point.bal), showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[0] }, itemStyle: { color: TK.series[0] }, areaStyle: { color: TK.series[0] + '1a' },
        markLine: { symbol: 'none', silent: true, lineStyle: { color: TK.axis, width: 1.5, type: 'solid' }, label: { formatter: `Retiro ${inputs.retAge}`, color: TK.ink2, position: 'insideEndTop' }, data: [{ xAxis: String(inputs.retAge) }] } },
      { name: L('Saldo en pesos de hoy', 'Balance in today’s pesos'), type: 'line', data: projection.path.map(point => point.real), showSymbol: false, symbol: 'circle', lineStyle: { width: 2, color: TK.series[2] }, itemStyle: { color: TK.series[2] } },
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
    box.innerHTML = L(`<span>Saldo $ <input data-field="saldo" data-amt></span>
      <span>Tasa de retiro <input class="rate" type="number" step="0.1" min="0.5" data-field="swr">%</span>
      <span>Rendimiento nominal <input class="rate" type="number" step="0.1" data-field="rate">%</span>
      <span title="Por defecto: la volatilidad de tu mezcla actual (ver “¿De dónde sale la volatilidad?”)">Volatilidad <input class="rate" type="number" step="0.5" min="0" data-field="vol">%</span>
      <span>Gasto mensual $ <input data-field="gasto" data-amt></span>
      <span>Horizonte <input class="rate" type="number" step="5" min="5" data-field="years"> años</span>
      <button data-preset="reset">Valores por defecto</button>`, `<span>Balance $ <input data-field="saldo" data-amt></span>
      <span>Withdrawal rate <input class="rate" type="number" step="0.1" min="0.5" data-field="swr">%</span>
      <span>Nominal return <input class="rate" type="number" step="0.1" data-field="rate">%</span>
      <span title="Default: the volatility of your current mix (see “Where does the volatility come from?”)">Volatility <input class="rate" type="number" step="0.5" min="0" data-field="vol">%</span>
      <span>Monthly spending $ <input data-field="gasto" data-amt></span>
      <span>Horizon <input class="rate" type="number" step="5" min="5" data-field="years"> years</span>
      <button data-preset="reset">Defaults</button>`);
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
    { label: L('Podrías retirar hoy', 'You could withdraw today'), value: L(`<span class="up">${money(sc.withdrawal)}</span>/mes`, `<span class="up">${money(sc.withdrawal)}</span>/month`), detail: L(`${pct(inputs.swr, 1)} anual de ${moneyC(inputs.saldo)}, ajustado cada año por inflación`, `${pct(inputs.swr, 1)} per year of ${moneyC(inputs.saldo)}, adjusted for inflation each year`) },
    { label: L('Número FIRE', 'FIRE number'), value: money(fiNum), detail: L(`gasto de ${money(inputs.gasto)}/mes ÷ ${pct(inputs.swr, 1)} · llevas ${pct(inputs.saldo / fiNum, 0)}${inputs.saldo >= fiNum ? ' ✓' : ` · te faltan ${moneyC(fiNum - inputs.saldo)}`}`, `spending of ${money(inputs.gasto)}/month ÷ ${pct(inputs.swr, 1)} · you’re at ${pct(inputs.saldo / fiNum, 0)}${inputs.saldo >= fiNum ? ' ✓' : ` · ${moneyC(fiNum - inputs.saldo)} to go`}`) },
    { label: L('Cobertura de tu gasto', 'Spending coverage'), value: `${(sc.withdrawal / inputs.gasto).toFixed(2)}×`, detail: sc.withdrawal >= inputs.gasto ? L('tu retiro sostenible cubre tu gasto', 'your sustainable withdrawal covers your spending') : L(`te faltan ${money(inputs.gasto - sc.withdrawal)}/mes`, `${money(inputs.gasto - sc.withdrawal)}/month short`) },
    { label: L(`Probabilidad de que dure ${inputs.years} años`, `Probability it lasts ${inputs.years} years`), value: pct(sc.success, 0), detail: L(`Monte Carlo: 700 escenarios con ${pct(inputs.real, 1)} real y ${pct(inputs.vol, 1)} de volatilidad`, `Monte Carlo: 700 scenarios with ${pct(inputs.real, 1)} real and ${pct(inputs.vol, 1)} volatility`) },
    { label: L('Tasa con ≥95% de éxito', 'Rate with ≥95% success'), value: safe ? pct(safe, 2) : '< 2%', detail: L(`para ${inputs.years} años y tu volatilidad · con ella: ${safe ? money(inputs.saldo * safe / 12) : '—'}/mes`, `for ${inputs.years} years and your volatility · with it: ${safe ? money(inputs.saldo * safe / 12) : '—'}/month`) },
  ]);
  document.getElementById('fireHint').textContent = L(`Retiras ${pct(inputs.swr, 1)} del saldo de hoy (${money(sc.withdrawal)}/mes, ajustado por inflación) durante ${inputs.years} años. Banda = 80% de los escenarios simulados.`, `You withdraw ${pct(inputs.swr, 1)} of today’s balance (${money(sc.withdrawal)}/month, inflation-adjusted) for ${inputs.years} years. Band = 80% of simulated scenarios.`);
  const months = sc.det.map((detail, index) => index);
  const lab = month => month % 12 === 0 ? L(`Año ${month / 12}`, `Year ${month / 12}`) : L(`Año ${Math.floor(month / 12)}, mes ${month % 12}`, `Year ${Math.floor(month / 12)}, month ${month % 12}`);
  const p10 = months.map(month => sc.band[month].p10), p90 = months.map(month => sc.band[month].p90 - sc.band[month].p10), p50 = months.map(month => sc.band[month].p50);
  const cB = TK.series[0];
  chart('cFire');
  htmlLegend('lgFire', 'cFire', [{ name: L('Saldo esperado', 'Expected balance'), color: TK.ink }, { name: L('Mediana simulada', 'Simulated median'), color: cB }, { name: L('Rango 10–90%', '10–90% range'), color: cB + '66' }]);
  charts.cFire.setOption(base({
    legend: hiddenLegend(),
    grid: { left: 8, right: 16, top: 12, bottom: 30, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => { const month = ps[0].dataIndex, bd = sc.band[month];
        return ttHead(lab(month)) + ttRow(TK.ink, L('Saldo esperado', 'Expected balance'), money(Math.max(0, sc.det[month]))) + ttRow(cB, L('Mediana simulada', 'Simulated median'), money(bd.p50)) + ttRow(null, L('Rango 10–90%', '10–90% range'), `${moneyC(bd.p10)} – ${moneyC(bd.p90)}`) + ttRow(null, L('Retirando al mes', 'Withdrawing per month'), money(sc.withdrawal)); } }),
    xAxis: catAxis(months, { boundaryGap: false, axisLabel: { color: TK.muted, fontSize: 11, interval: index => index % 60 === 0, formatter: value => L(`Año ${Math.round(value / 12)}`, `Year ${Math.round(value / 12)}`) } }),
    yAxis: valAxis(moneyC),
    series: [
      { name: 'P10', type: 'line', data: p10, stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
      { name: L('Rango 10–90%', '10–90% range'), type: 'line', data: p90, stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: cB + '26' }, silent: true },
      { name: L('Mediana simulada', 'Simulated median'), type: 'line', data: p50, symbol: 'none', lineStyle: { width: 1.5, color: cB } },
      { name: L('Saldo esperado', 'Expected balance'), type: 'line', data: sc.det.map(detail => Math.max(0, detail)), symbol: 'none', lineStyle: { width: 2.5, color: TK.ink }, itemStyle: { color: TK.ink },
        markLine: { symbol: 'none', silent: true, lineStyle: { color: TK.series[3], width: 1.5, type: 'solid' }, label: { formatter: L('Número FIRE', 'FIRE number'), color: TK.ink2, position: 'insideStartTop' }, data: [{ yAxis: fiNum }] } },
    ],
  }), true);

  const vols = [...new Set([inputs.vol, 0.10, 0.15].map(vol => Math.round(vol * 1000) / 1000))].sort((left, right) => left - right);
  const xs = []; for (let rate = 0.02; rate <= 0.0701; rate += 0.0025) xs.push(+rate.toFixed(4));
  const cols = [TK.series[0], TK.series[1], TK.series[4]];
  const volName = vol => L(`Volatilidad ${pct(vol, 1)}${Math.abs(vol - inputs.vol) < 1e-6 ? L(' (tuya)', ' (yours)') : ''}`, `Volatility ${pct(vol, 1)}${Math.abs(vol - inputs.vol) < 1e-6 ? ' (yours)' : ''}`);
  document.getElementById('swrHint').textContent = L(`Probabilidad de que el dinero dure ${inputs.years} años retirando cada año el % del saldo inicial (ajustado por inflación), con ${pct(inputs.real, 1)} de rendimiento real esperado.`, `Probability that the money lasts ${inputs.years} years withdrawing each year the % of the starting balance (inflation-adjusted), with ${pct(inputs.real, 1)} expected real return.`);
  chart('cSwr').setOption(base({
    legend: legend({ data: vols.map(volName) }),
    grid: { left: 8, right: 16, top: legTop(34), bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: TK.axis } },
      formatter: ps => ttHead(L(`Retirando ${pct(xs[ps[0].dataIndex], 2)} al año (${money(inputs.saldo * xs[ps[0].dataIndex] / 12)}/mes hoy)`, `Withdrawing ${pct(xs[ps[0].dataIndex], 2)} per year (${money(inputs.saldo * xs[ps[0].dataIndex] / 12)}/month today)`)) + ps.map(param => ttRow(param.color, param.seriesName, pct(param.value, 0))).join('') }),
    xAxis: catAxis(xs.map(rate => (rate * 100).toFixed(2).replace(/\.?0+$/, '') + '%'), { boundaryGap: false }),
    yAxis: valAxis(value => (value * 100).toFixed(0) + '%', { max: 1, min: 0 }),
    series: vols.map((vol, index) => ({ name: volName(vol), type: 'line', data: xs.map(rate => swrSuccess(inputs.real, vol, inputs.years, rate)), symbol: 'circle', symbolSize: 5, showSymbol: false,
      lineStyle: { width: Math.abs(vol - inputs.vol) < 1e-6 ? 2.5 : 1.5, color: cols[index] }, itemStyle: { color: cols[index] },
      markLine: index === 0 ? { symbol: 'none', silent: true, lineStyle: { color: TK.axis, width: 1, type: 'solid' }, label: { color: TK.ink2, fontSize: 10, formatter: param => param.name }, data: [{ yAxis: 0.95, name: '95%' }, { yAxis: 0.9, name: '90%' }, { xAxis: xs.reduce((bi, rate, idx) => Math.abs(rate - inputs.swr) < Math.abs(xs[bi] - inputs.swr) ? idx : bi, 0), name: L('tu tasa', 'your rate') }] } : undefined })),
  }), true);

  const realHist = model.kp.ann != null ? (1 + model.kp.ann) / (1 + state.inf) - 1 : null;
  document.getElementById('fireWhy').innerHTML = L(`<h3>¿Es adecuado el 4%?</h3>
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
    <p style="margin:6px 0">Esto es una herramienta de análisis, no una recomendación de inversión.</p></div>`, `<h3>Is 4% right for you?</h3>
    <p class="hint" style="margin-bottom:8px">How to tell if it applies to you, with your numbers</p>
    <div style="font-size:13px;line-height:1.55;color:var(--ink2)">
    <p style="margin:6px 0"><b style="color:var(--ink)">Where it comes from.</b> Bengen (1994) and the "Trinity study" (1998) tested with US data since 1926: withdrawing 4% of the balance in the first year and then adjusting that amount for inflation survived ~95% of <b>30-year</b> periods with 50–75% in stocks. It’s an empirical rule for a specific context, not a law.</p>
    <ol style="margin:4px 0 4px 18px;padding:0">
      <li><b>Horizon.</b> An early retirement can last 50–60 years, not 30. For ${inputs.years} years and your volatility, the rate with ≥95% success is <b>${safe ? pct(safe, 2) : '< 2%'}</b>.</li>
      <li><b>Expected real return.</b> Your historical real return is ~${pct(realHist, 1)} (${pct(model.kp.ann, 1)} nominal − ${pct(state.inf, 1)} assumed inflation), but that’s only a few years of data.</li>
      <li><b>Sequence risk.</b> A few bad years right when you start withdrawing weigh much more than at the end; that’s what volatility measures in the simulation. Check the 10% and 15% curves too.</li>
      <li><b>Taxes and costs.</b> The 4% is pre-tax: ISR withheld on dividends (${pct(model.gbm.tot.gross ? -model.gbm.tot.isr / model.gbm.tot.gross : null, 0)} of what you received), ISR on gains when selling and fees (${pct(model.gbm.tot.avgRV && model.gbm.tot.months ? -model.gbm.tot.com / model.gbm.tot.avgRV / (model.gbm.tot.months / 12) : null, 2)} per year in your account). Subtract them from your rate.</li>
      <li><b>Currency and inflation.</b> Your expenses are in pesos; dollar instruments add currency risk (for or against you).</li>
      <li><b>Flexibility and future income.</b> If you can cut spending in bad years or will have other income (pension, rents), you can tolerate a higher rate; if not, a lower one is better.</li>
    </ol>
    <p style="margin:6px 0">This is an analysis tool, not investment advice.</p></div>`);
}

/* ============================== Todos los instrumentos ============================== */
const EDIT_DIMS = ['tipo', 'clase', 'region', 'riesgo', 'moneda'];
const COLS = [
  { key: 'tk', label: 'Ticker', left: true, get: it => it.tk },
  { key: 'name', label: L('Nombre', 'Name'), left: true, get: it => it.name },
  ...EDIT_DIMS.map(dim => ({ key: dim, label: DIMS[dim].label, left: true, edit: dim })),
  { key: 'valor', label: L('Valor al cierre', 'Closing value'), get: it => it.st.vEnd, format: money },
  { key: 'tit', label: L('Títulos', 'Titles'), get: it => it.st.tit, format: value => value.toLocaleString('es-MX') },
  { key: 'wEnd', label: L('Peso', 'Weight'), get: it => it.st.wEnd, format: value => pct(value, 1) },
  { key: 'wAvg', label: L('Peso prom.', 'Avg. weight'), get: it => it.st.wAvg, format: value => pct(value, 1) },
  { key: 'buys', label: L('Comprado', 'Bought'), get: it => it.st.buys, format: money },
  { key: 'sells', label: L('Vendido', 'Sold'), get: it => it.st.sells, format: money },
  { key: 'gain', label: L('Ganancia $', 'Gain $'), get: it => it.st.gain, format: value => `<span class="${cls(value)}">${money(value)}</span>` },
  { key: 'share', label: L('% ganancias', '% of gains'), get: it => it.st.gainShare, format: value => pct(value, 1) },
  { key: 'ann', label: L('Anualizado', 'Annualized'), get: it => it.isCash ? null : it.st.ann, format: value => `<span class="${cls(value)}">${pct(value, 1, true)}</span>` },
  { key: 'cum', label: L('Acumulado', 'Cumulative'), get: it => it.isCash ? null : it.st.cum, format: value => `<span class="${cls(value)}">${pct(value, 1, true)}</span>` },
  { key: 'last', label: L('Último mes', 'Last month'), get: it => it.isCash ? null : it.st.lastR, format: value => `<span class="${cls(value)}">${pct(value, 1, true)}</span>` },
  { key: 'vol', label: L('Volatilidad', 'Volatility'), get: it => it.isCash ? null : it.st.vol, format: value => pct(value, 1) },
  { key: 'eff', label: L('Eficiencia', 'Efficiency'), get: it => it.st.eff, format: value => value.toFixed(1) + '×' },
  { key: 'div', label: L('Dividendos netos', 'Net dividends'), get: it => it.st.dist || null, format: money },
  { key: 'cal', label: L('Calendario de pagos', 'Payment calendar'), left: true, get: it => it.isCash ? null : calLabel(it.tk), format: value => esc(value) },
  { key: 'dy', label: L('Yield div.', 'Div. yield'), get: it => (model.gbm.tks.find(stat => stat.tk === it.tk) || {}).yield ?? null, format: value => pct(value, 2) },
  { key: 'pAnn', label: L('Rend. precio', 'Price return'), get: it => it.isCash ? null : model.alt.MP.insts.find(inst => inst.tk === it.tk)?.st.ann ?? null, format: value => `<span class="${cls(value)}">${pct(value, 1, true)}</span>` },
  { key: 'dAnn', label: L('Rend. dividendos', 'Dividend return'), get: it => { if (it.isCash) return null; const withDiv = model.alt.MD.insts.find(inst => inst.tk === it.tk)?.st.ann, priceOnly = model.alt.MP.insts.find(inst => inst.tk === it.tk)?.st.ann; return withDiv != null && priceOnly != null && Math.abs(withDiv - priceOnly) > 1e-6 ? withDiv - priceOnly : null; }, format: value => pct(value, 1, true) },
  { key: 'sharpe', label: 'Sharpe', get: it => it.isCash ? null : it.st.risk?.sharpe ?? null, format: value => value.toFixed(2) },
  { key: 'mdd', label: L('Peor caída', 'Max drawdown'), get: it => it.isCash ? null : it.st.risk?.mdd ?? null, format: value => `<span class="${value < 0 ? 'down' : ''}">${pct(value, 1)}</span>` },
  { key: 'negM', label: L('% meses negativos', '% negative months'), get: it => it.isCash ? null : it.st.risk?.negPct ?? null, format: value => pct(value, 0) },
  { key: 'nm', label: L('Meses', 'Months'), get: it => it.st.nm, format: value => value },
  { key: 'x', label: '', left: true, get: () => '' },
];
function renderTable() {
  const col = COLS.find(item => item.key === state.sort.col) || COLS.find(item => item.key === 'valor');
  const getter = col.get || (it => it.cls[col.edit]);
  const rows = [...model.insts].sort((left, right) => {
    const leftValue = getter(left), rightValue = getter(right);
    if (leftValue == null) return 1; if (rightValue == null) return -1;
    return (typeof leftValue === 'string' ? leftValue.localeCompare(rightValue, LANG) : leftValue - rightValue) * state.sort.dir;
  });
  const head = '<thead><tr>' + COLS.map(item => `<th class="${item.left ? 'l' : ''}" data-col="${item.key}">${item.label}${state.sort.col === item.key ? (state.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('') + '</tr></thead>';
  const body = '<tbody>' + rows.map(it => '<tr class="' + (it.active ? '' : 'closed') + '">' + COLS.map(item => {
    if (item.edit) {
      if (it.isCash) return `<td class="l">${sw(colorFor(item.edit, it.cls[item.edit]))}${esc(valueLabel(it.cls[item.edit]))}</td>`;
      const vals = [...DIMS[item.edit].values].filter(value => value !== 'Efectivo y reporto' && value !== 'Efectivo'); if (!vals.includes(it.cls[item.edit])) vals.push(it.cls[item.edit]);
      return `<td class="l">${sw(colorFor(item.edit, it.cls[item.edit]))}<select data-key="${esc(it.tk)}" data-dim="${item.edit}">${vals.map(value => `<option value="${esc(value)}"${value === it.cls[item.edit] ? ' selected' : ''}>${esc(valueLabel(value))}</option>`).join('')}</select></td>`;
    }
    const value = item.get(it);
    if (item.key === 'x') return it.isCash ? '<td></td>' : `<td class="l"><button class="chip${it.outlier ? ' out-on' : ''}" data-out="${esc(it.tk)}" title="${it.outlier ? L(`Atípico: ${esc(it.outlierWhy)}. Clic para dejar de tratarlo como atípico`, `Outlier: ${esc(it.outlierWhy)}. Click to stop treating it as an outlier`) : L('Ocultar de las vistas por instrumento (sigue en los totales)', 'Hide from per-instrument views (still in totals)')}">${it.outlier ? L('✓ Atípico', '✓ Outlier') : L('Atípico', 'Outlier')}</button> <button class="chip" data-excl="${esc(it.tk)}" title="Quitar de todos los cálculos">✕ Excluir</button></td>`;
    if (item.key === 'tk') return `<td class="l"><b style="font-weight:600">${esc(it.isCash ? L('Efectivo', 'Cash') : it.tk)}</b>${it.active ? '' : ' <span style="color:var(--muted)">(cerrado)</span>'}${it.outlier ? L(' <span class="tag">atípico</span>', ' <span class="tag">outlier</span>') : ''}</td>`;
    return `<td class="${item.left ? 'l' : ''}">${item.format ? (value == null ? '—' : item.format(value)) : esc(value)}</td>`;
  }).join('') + '</tr>').join('') + '</tbody>';
  document.getElementById('tbl').innerHTML = head + body;
  document.getElementById('exclList').innerHTML = state.excl.length ? L('Excluidos de todos los cálculos: ', 'Excluded from every calculation: ') + state.excl.map(key => `<button class="chip" data-incl="${esc(key)}" title="${L('Volver a incluir', 'Include again')}"><b style="color:var(--ink)">${esc(key)}</b> ↺ ${L('incluir', 'include')}</button>`).join(' ') : '';
}
