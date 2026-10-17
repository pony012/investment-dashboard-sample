/* ============================== Completar con IA ==============================
 * El prompt (generado en `gbm build`, el mismo que imprime `gbm prompt`) pide a cualquier LLM la clasificación y el
 * calendario de dividendos de cada instrumento en JSON. La respuesta se valida aquí y se guarda en este navegador:
 * los campos de clasificación van a state.ovr (como las ediciones de la tabla) y el calendario a state.divCal.
 */
const FRECUENCIAS = DATA.frecuencias || ['mensual', 'trimestral', 'semestral', 'anual', 'irregular', 'no paga'];
const CONFIANZA = ['alta', 'media', 'baja'];

// Calendario de dividendos de un instrumento: lo importado en el navegador o lo guardado en private/instruments.json
function divCalOf(tk) {
  const local = state.divCal[tk], saved = DATA.cls[tk] || {};
  return { ...(saved.dividendos ? { dividendos: saved.dividendos } : {}), ...(saved.confianza ? { confianza: saved.confianza } : {}), ...(saved.notas ? { notas: saved.notas } : {}), ...(local || {}) };
}
function calLabel(tk) {
  const info = divCalOf(tk), cal = info.dividendos;
  if (!cal) return null;
  const months = (cal.meses_pago || []).map(month => MES[month - 1]).join(', ');
  return [cal.frecuencia ? cal.frecuencia[0].toUpperCase() + cal.frecuencia.slice(1) : null, months || null, cal.yield_anual_aprox != null ? pct(cal.yield_anual_aprox, 1) : null].filter(Boolean).join(' · ');
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

// Misma validación que gbm_dashboard/ai.py: sólo se aceptan los valores de las listas permitidas
function validateAiReply(reply) {
  const data = reply.instruments || reply.instrumentos || {};
  const tickers = Object.keys(P.instruments), byUpper = Object.fromEntries(tickers.map(tk => [tk.toUpperCase(), tk]));
  const allowed = { tipo: DIMS.tipo.values.filter(value => value !== 'Efectivo y reporto'), moneda: DIMS.moneda.values, clase: DIMS.clase.values.filter(value => value !== 'Efectivo'), region: DIMS.region.values, riesgo: DIMS.riesgo.values };
  const clean = {}, warnings = [];
  Object.entries(data).forEach(([rawTk, entry]) => {
    const tk = byUpper[String(rawTk).trim().toUpperCase()];
    if (!tk) { warnings.push(`${rawTk}: no está en tu portafolio, se ignora`); return; }
    if (!entry || typeof entry !== 'object') return;
    const out = {};
    if (typeof entry.nombre === 'string' && entry.nombre.trim()) out.nombre = entry.nombre.trim().slice(0, 80);
    Object.entries(allowed).forEach(([field, options]) => {
      if (options.includes(entry[field])) out[field] = entry[field];
      else if (entry[field] != null) warnings.push(`${tk}: ${field} "${entry[field]}" no es una opción válida, se ignora`);
    });
    const div = entry.dividendos;
    if (div && typeof div === 'object') {
      const cal = {};
      if (FRECUENCIAS.includes(div.frecuencia)) cal.frecuencia = div.frecuencia;
      if (Array.isArray(div.meses_pago)) cal.meses_pago = [...new Set(div.meses_pago.filter(month => Number.isFinite(month) && month >= 1 && month <= 12).map(Math.trunc))].sort((left, right) => left - right);
      const yld = div.yield_anual_aprox;
      if (Number.isFinite(yld) && yld >= 0 && yld < 1) cal.yield_anual_aprox = Math.round(yld * 1e4) / 1e4;
      else if (Number.isFinite(yld) && yld >= 1 && yld < 30) cal.yield_anual_aprox = Math.round(yld * 100) / 1e4;   // vino en porcentaje
      if (Object.keys(cal).length) out.dividendos = cal;
    }
    if (CONFIANZA.includes(entry.confianza)) out.confianza = entry.confianza;
    if (typeof entry.notas === 'string' && entry.notas.trim()) out.notas = entry.notas.trim().slice(0, 300);
    if (Object.keys(out).length) clean[tk] = out;
  });
  const missing = tickers.filter(tk => !clean[tk]);
  if (missing.length) warnings.push('Sin respuesta para: ' + missing.join(', '));
  return { clean, warnings };
}

function importAiReply(text) {
  let reply;
  try { reply = extractJson(text); } catch (err) { return { error: 'La respuesta no es JSON válido: ' + err.message }; }
  const { clean, warnings } = validateAiReply(reply);
  Object.entries(clean).forEach(([tk, entry]) => {
    const { dividendos, confianza, notas, ...cls } = entry;
    if (Object.keys(cls).length) state.ovr[tk] = { ...state.ovr[tk], ...cls };
    if (dividendos || confianza || notas) state.divCal[tk] = { ...state.divCal[tk], ...(dividendos ? { dividendos } : {}), ...(confianza ? { confianza } : {}), ...(notas ? { notas } : {}) };
  });
  LS.set('cls', state.ovr); LS.set('divcal', state.divCal);
  return { count: Object.keys(clean).length, warnings };
}

function setupAiBox() {
  const box = document.getElementById('aiBox');
  document.getElementById('aiPrompt').value = DATA.aiPrompt || '';
  document.getElementById('aiToggle').onclick = () => { box.hidden = !box.hidden; if (!box.hidden) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  document.getElementById('aiCopy').onclick = async () => {
    const area = document.getElementById('aiPrompt');
    try { await navigator.clipboard.writeText(area.value); } catch (err) { area.select(); document.execCommand('copy'); }
    toast('Prompt copiado: pégalo en tu IA');
  };
  document.getElementById('aiImport').onclick = () => {
    const result = importAiReply(document.getElementById('aiReply').value);
    const out = document.getElementById('aiResult');
    if (result.error) { out.innerHTML = `<li class="down">${esc(result.error)}</li>`; return; }
    out.innerHTML = `<li><b>${result.count}</b> instrumento(s) actualizados en este navegador. Usa “Exportar clasificación” para guardarlos en <code>private/instruments.json</code>.</li>` + result.warnings.map(warning => `<li>${esc(warning)}</li>`).join('');
    toast(`Clasificación de IA importada: ${result.count} instrumento(s)`);
    rerenderSafe();
  };
  document.getElementById('aiClear').onclick = () => { state.divCal = {}; LS.del('divcal'); toast('Calendario de dividendos importado borrado'); rerenderSafe(); };
}
