/* ============================== Idioma (es / en) ==============================
 * El dashboard se escribe en español. En inglés:
 *  - el texto fijo de la plantilla se traduce con EN_STATIC (texto exacto → traducción);
 *  - el texto que genera el JavaScript usa L('español', 'english');
 *  - los valores de clasificación ("Renta variable", "FIBRA"…) se guardan en español y sólo se muestran traducidos (valueLabel).
 */
const LANG = (() => {
  // ?lang=en (o #lang=en) en la URL tiene prioridad; luego lo elegido en el botón ES/EN; luego el idioma del navegador
  const fromUrl = (location.search.match(/[?&]lang=(es|en)\b/) || location.hash.match(/lang=(es|en)\b/) || [])[1];
  if (fromUrl) return fromUrl;
  const key = (DATA.demo ? 'gbmdemo.' : 'gbmdash.') + 'lang';
  try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved === 'es' || saved === 'en') return saved; } catch (err) {}
  if (DATA.lang === 'es' || DATA.lang === 'en') return DATA.lang;      // `gbm build --lang`
  return /^es\b/i.test(navigator.language || 'es') ? 'es' : 'en';
})();
const EN = LANG === 'en';
const L = (es, en) => EN ? en : es;
document.documentElement.lang = LANG;

// Valores que se guardan en español y se muestran traducidos
const VALUE_EN = {
  'ETF': 'ETF', 'Acción individual': 'Individual stock', 'FIBRA': 'FIBRA (Mexican REIT)', 'Fondo de inversión': 'Investment fund', 'Deuda / bonos': 'Debt / bonds',
  'Efectivo y reporto': 'Cash and repo', 'Otro': 'Other',
  'Renta variable': 'Equity', 'Renta fija': 'Fixed income', 'Bienes raíces': 'Real estate', 'Alternativos': 'Alternatives', 'Efectivo': 'Cash',
  'EE.UU.': 'United States', 'México': 'Mexico', 'Internacional desarrollado': 'International developed', 'Mercados emergentes': 'Emerging markets', 'Global': 'Global',
  'Conservador': 'Conservative', 'Moderado': 'Moderate', 'Agresivo': 'Aggressive',
  'MXN': 'MXN', 'USD': 'USD',
  'mensual': 'monthly', 'bimestral': 'bimonthly', 'trimestral': 'quarterly', 'semestral': 'semiannual', 'anual': 'annual', 'irregular': 'irregular',
  'pocos datos': 'not enough data', 'no paga': 'does not pay',
};
const valueLabel = value => EN && value != null && VALUE_EN[value] ? VALUE_EN[value] : value;

// Texto fijo de la plantilla (nodos de texto y atributos title / placeholder / aria-label)
const EN_STATIC = {
  'Portafolio GBM': 'GBM Portfolio', 'Ocultar montos': 'Hide amounts', 'Colapsar todo': 'Collapse all', 'Cambiar tema': 'Change theme', 'Tema: auto': 'Theme: auto',
  'Datos': 'Data', 'sintéticos': 'synthetic', 'de demostración: no corresponden a ninguna persona. Genera el tuyo con': 'for demonstration: they belong to no one. Generate yours with',
  'Desde': 'From', 'Hasta': 'To', 'Todo': 'All', 'Este año': 'This year', 'Últimos 12 m': 'Last 12 m', 'Últimos 36 m': 'Last 36 m', 'Agrupar por': 'Group by',
  'Incluir dividendos en los rendimientos': 'Include dividends in returns',
  'Lecturas automáticas del periodo seleccionado. Cambian con el filtro de fechas, la casilla de dividendos y la clasificación de la tabla de instrumentos.': 'Automatic readings for the selected period. They change with the date filter, the dividends checkbox and the classification in the instruments table.',
  'Evolución del portafolio': 'Portfolio evolution',
  'Valor al cierre de cada mes contra lo que has aportado neto (depósitos − retiros). El índice (base 100) encadena los rendimientos mensuales, así que no se distorsiona por tus depósitos o retiros: es la comparación justa entre tipos de inversión.': 'Month-end value versus your net contributions (deposits − withdrawals). The index (base 100) chains monthly returns, so your deposits and withdrawals don’t distort it: it’s the fair comparison between investment types.',
  'Valor vs. aportado': 'Value vs. contributed', 'Índice base 100': 'Index (base 100)', 'Rendimiento por periodo': 'Return by period', 'Mes': 'Month', 'Trimestre': 'Quarter', 'Año': 'Year',
  '¿De dónde vino el crecimiento?': 'Where did the growth come from?', 'Ahorro neto (depósitos − retiros) vs. rendimientos': 'Net savings (deposits − withdrawals) vs. returns',
  'Año por año': 'Year by year', 'Rendimiento ponderado por tiempo (TWR) calculado y el que reporta GBM': 'Time-weighted return (TWR) computed here and the one GBM reports',
  'Composición': 'Composition',
  'Qué peso ha tenido cada tipo de inversión a lo largo del tiempo. Usa “Agrupar por” para cambiar entre tipo, clase de activo, región, riesgo o moneda.': 'How much weight each investment type has had over time. Use “Group by” to switch between type, asset class, region, risk or currency.',
  'Peso a lo largo del tiempo': 'Weight over time', 'Agrupado': 'Grouped', 'Instrumentos': 'Instruments', 'Al cierre del periodo': 'At period end',
  'Jerarquía (sunburst)': 'Hierarchy (sunburst)', 'Anillo interior → medio → instrumento': 'Inner ring → middle → instrument', 'Mapa del portafolio': 'Portfolio map',
  'Tamaño = valor al cierre · color = rendimiento': 'Size = closing value · color = return', 'Último mes': 'Last month', 'Anualizado': 'Annualized',
  'Rendimiento por instrumento': 'Return by instrument',
  'Rendimiento ponderado por tiempo (Modified Dietz por mes, encadenado). El efectivo y el reporto no entran en el ranking. Los instrumentos con menos de 12 meses aparecen atenuados: su anualizado es poco confiable.': 'Time-weighted return (monthly Modified Dietz, chained). Cash and repo are not ranked. Instruments with less than 12 months appear faded: their annualized figure is unreliable.',
  'Ocultar atípicos': 'Hide outliers',
  'Atípico = menos de 6 meses en tu portafolio con un anualizado mayor a ±50% (o marcado por ti en “Todos los instrumentos”). Haz clic en un instrumento de cualquiera de estas gráficas para ocultarlo o ver su detalle; los ocultos aparecen arriba con ↺ para mostrarlos de nuevo. Se oculta del ranking, riesgo vs. rendimiento, mapa de calor e insights, pero': 'Outlier = less than 6 months in your portfolio with an annualized return beyond ±50% (or marked by you in “All instruments”). Click an instrument in any of these charts to hide it or see its detail; hidden ones appear above with ↺ to show them again. It is hidden from the ranking, risk vs. return, heatmap and insights, but',
  'sigue contando': 'still counts', 'en el valor y el rendimiento del portafolio. Para quitar un instrumento de todos los cálculos usa “Excluir”.': 'in the portfolio value and return. To remove an instrument from every calculation use “Exclude”.',
  'Ganancia $': 'Gain $', 'Eficiencia': 'Efficiency', 'Riesgo vs. rendimiento': 'Risk vs. return',
  'Volatilidad anualizada (eje X) vs. rendimiento anualizado (eje Y). Tamaño = valor al cierre. Arriba a la izquierda es mejor.': 'Annualized volatility (X axis) vs. annualized return (Y axis). Size = closing value. Top left is better.',
  'Mapa de calor': 'Heatmap', 'Dividendos, distribuciones e impuestos': 'Dividends, distributions and taxes', 'De tus estados de cuenta (': 'From your account statements (',
  '): dividendos de ETFs y acciones, distribuciones de FIBRAs (resultado fiscal y reembolso de capital), ISR retenido y comisiones. El yield se calcula sobre el valor de mercado que tenías invertido en cada mes.': '): dividends from ETFs and stocks, FIBRA distributions (taxable result and return of capital), withheld income tax (ISR) and fees. The yield is computed on the market value you had invested each month.',
  'Distribuciones recibidas': 'Distributions received', 'Bruto por tipo (arriba) e ISR retenido (abajo). La línea es el neto.': 'Gross by type (above) and withheld ISR (below). The line is the net.',
  'Yield de los últimos 12 meses': 'Trailing 12-month yield', 'Distribuciones de 12 meses ÷ valor promedio invertido': '12-month distributions ÷ average invested value',
  'Por instrumento': 'By instrument', 'Yield neto anual': 'Net annual yield', '$ neto': 'Net $', 'Calendario de pagos': 'Payment calendar', '¿Quién paga y cada cuándo?': 'Who pays and how often?',
  'Frecuencia observada = cuántos meses distintos te pagó cada instrumento en los últimos 12 meses (≥ 9 mensual, 3–5 trimestral, 2 semestral, 1 anual; otro patrón, irregular). Los cuadros marcan en qué meses del año pagó en los últimos 24 meses. Si un instrumento lleva menos de 12 meses contigo se usa el calendario importado con “Completar con IA”; sin él, aparece como “pocos datos”.': 'Observed frequency = how many different months each instrument paid you in the last 12 months (≥ 9 monthly, 3–5 quarterly, 2 semiannual, 1 annual; any other pattern, irregular). The squares mark which months of the year it paid in the last 24 months. If you’ve held an instrument for less than 12 months, the calendar imported with “Fill in with AI” is used; without it, it shows as “not enough data”.',
  'Rendimiento mensual que reporta GBM': 'Monthly return reported by GBM',
  'Rendimiento global neto de la cuenta (incluye dividendos y comisiones) e índice acumulado. Incluye meses anteriores al primer estado de cuenta descargado.': 'Net overall account return (includes dividends and fees) and cumulative index. Includes months before the first downloaded statement.',
  'Costos e impuestos por año': 'Costs and taxes by year', 'Comisiones + IVA (en compras/ventas y cargos administrativos) e ISR retenido sobre distribuciones': 'Fees + VAT (on trades and administrative charges) and ISR withheld on distributions',
  'Próximas distribuciones (estimadas)': 'Upcoming distributions (estimated)',
  'Estimación: cada instrumento repite los meses en que pagó en los últimos 12 meses; el monto es el neto (después de ISR) de ese mismo mes del año anterior, ajustado por cuánto creció tu posición. Los instrumentos que aún no te han pagado usan su calendario de pagos (de “Completar con IA” o de': 'Estimate: each instrument repeats the months in which it paid in the last 12 months; the amount is the net (after ISR) of that same month a year earlier, adjusted by how much your position grew. Instruments that haven’t paid you yet use their payment calendar (from “Fill in with AI” or from',
  '): valor actual × yield aproximado ÷ pagos al año, menos 10% de ISR en el SIC. Los montos y fechas reales los anuncia cada emisora.': '): current value × approximate yield ÷ payments per year, minus 10% ISR for SIC holdings. Each issuer announces the actual amounts and dates.',
  'Flujos: a dónde metiste y de dónde sacaste': 'Flows: where you put money in and took it out',
  'Depósitos y retiros de efectivo de la cuenta, y compras (positivo) y ventas (negativo) de cada instrumento. Las compras incluyen comisión e IVA.': 'Cash deposits and withdrawals, and purchases (positive) and sales (negative) of each instrument. Purchases include fees and VAT.',
  'Compras y ventas por periodo': 'Purchases and sales by period', 'Total comprado (derecha) y vendido (izquierda) en el periodo': 'Total bought (right) and sold (left) in the period',
  'Detalle de un instrumento': 'Instrument detail', 'Inflación y valor del dinero': 'Inflation and the value of money',
  'Inflación real del INPC (INEGI) para el pasado y tu supuesto para el futuro. Responde cuánto valen hoy tus aportaciones, cuánto de tu ganancia es real y qué representa tu dinero en otras fechas.': 'Actual INPC inflation (INEGI) for the past and your assumption for the future. It answers what your contributions are worth today, how much of your gain is real and what your money represents at other dates.',
  'Inflación supuesta a futuro': 'Assumed future inflation', 'Valor vs. aportado ajustado por inflación': 'Value vs. contributed, adjusted for inflation', 'Pesos de hoy': 'Today’s pesos',
  'Proyección de retiro': 'Retirement projection', 'Con tu saldo y rendimiento reales, y tres formas de calcular el retiro mensual. Todo es editable y se guarda en este navegador.': 'With your actual balance and return, and three ways to compute the monthly withdrawal. Everything is editable and saved in this browser.',
  'Saldo por edad': 'Balance by age', 'Acumulación hasta el retiro y luego retiros que crecen con la inflación': 'Accumulation until retirement, then withdrawals that grow with inflation',
  'FIRE: independencia financiera': 'FIRE: financial independence',
  'Cuánto podrías retirar al mes de forma sostenible si empezaras hoy, y qué tan probable es que el dinero dure. Todo en': 'How much you could sustainably withdraw each month if you started today, and how likely the money is to last. Everything in',
  'pesos de hoy': 'today’s pesos', ': rendimientos reales (descontando la inflación supuesta) y retiros que se ajustan por inflación.': ': real returns (net of assumed inflation) and inflation-adjusted withdrawals.',
  'Escenario: retirar desde hoy': 'Scenario: withdrawing from today', '¿Qué tasa de retiro aguanta tu portafolio?': 'What withdrawal rate can your portfolio sustain?',
  'Riesgo vs. rendimiento por perfil': 'Risk vs. return by profile', 'avanzado': 'advanced',
  'Rendimiento puesto en perspectiva con su riesgo: volatilidad, peor caída, peor mes y Sharpe (rendimiento extra sobre la tasa libre de riesgo por cada unidad de volatilidad). El perfil sale de la columna “Riesgo” de la tabla de instrumentos.': 'Return put in perspective with its risk: volatility, max drawdown, worst month and Sharpe (excess return over the risk-free rate per unit of volatility). The profile comes from the “Risk” column of the instruments table.',
  'Tasa libre de riesgo (CETES)': 'Risk-free rate (CETES)', '¿Qué hubiera pasado si…?': 'What if…?',
  'Aplica los rendimientos históricos de cada perfil a una mezcla distinta, manteniéndola constante (rebalanceo mensual). No predice el futuro: muestra el intercambio entre rendimiento y riesgo que hubo.': 'Applies each profile’s historical returns to a different mix, kept constant (monthly rebalancing). It doesn’t predict the future: it shows the return/risk trade-off that existed.',
  'Mover': 'Move', 'del portafolio de': 'of the portfolio from', '¿De dónde sale la volatilidad?': 'Where does the volatility come from?',
  'La de tu mezcla actual: la que usan el simulador y la sección FIRE': 'That of your current mix: the one used by the simulator and the FIRE section',
  'Frontera eficiente (Markowitz)': 'Efficient frontier (Markowitz)', 'Todas las mezclas posibles de tus perfiles, con sus rendimientos y correlaciones históricas': 'Every possible mix of your profiles, with their historical returns and correlations',
  'Todos los instrumentos': 'All instruments',
  'Clic en un encabezado para ordenar. Tipo, Clase, Región, Riesgo y Moneda son editables (se guardan en este navegador y los gráficos se recalculan); “Exportar clasificación” descarga el JSON para guardarlo en': 'Click a header to sort. Type, Class, Region, Risk and Currency are editable (saved in this browser and the charts recompute); “Export classification” downloads the JSON to save it in',
  '. “Atípico” lo oculta sólo de las vistas por instrumento (ranking, riesgo vs. rendimiento, mapa de calor); “Excluir” lo quita de todos los cálculos.': '. “Outlier” hides it only from the per-instrument views (ranking, risk vs. return, heatmap); “Exclude” removes it from every calculation.',
  'Completar con IA': 'Fill in with AI', 'Exportar clasificación': 'Export classification', 'Restablecer clasificación': 'Reset classification',
  'Pide a cualquier IA (ChatGPT, Claude, Gemini…) el tipo, moneda, clase, región, riesgo y calendario de dividendos de tus instrumentos. El prompt sólo incluye tus tickers, no tus montos. Revisa la respuesta: la IA puede equivocarse.': 'Ask any AI (ChatGPT, Claude, Gemini…) for the type, currency, class, region, risk and dividend calendar of your instruments. The prompt only includes your tickers, not your amounts. Check the answer: the AI can be wrong.',
  'Copia el prompt y pégalo en tu IA.': 'Copy the prompt and paste it into your AI.', 'Copiar prompt': 'Copy prompt', 'Pega aquí la respuesta (el JSON, con o sin': 'Paste the answer here (the JSON, with or without',
  'Importar': 'Import', 'Borrar calendario importado': 'Delete imported calendar',
  'Se guarda en este navegador. Para guardarlo junto a tus datos: “Exportar clasificación” y copia el archivo a': 'Saved in this browser. To keep it with your data: “Export classification” and copy the file to',
  ', o guarda la respuesta en un archivo y corre': ', or save the answer to a file and run', '. También puedes obtener el prompt con': '. You can also get the prompt with',
  'Rendimiento mensual = generado ÷ (valor al inicio + ½ flujo neto del mes). Anualizado = (1 + acumulado)^(12 / meses) − 1. Volatilidad = desviación estándar mensual × √12. Eficiencia = % de las ganancias del periodo ÷ peso promedio en el portafolio (más de 1× = aportó más ganancia que su peso).': 'Monthly return = generated ÷ (starting value + ½ net flow of the month). Annualized = (1 + cumulative)^(12 / months) − 1. Volatility = monthly standard deviation × √12. Efficiency = % of the period’s gains ÷ average weight in the portfolio (above 1× = contributed more gain than its weight).',
  'Secciones': 'Sections', '☰ Secciones': '☰ Sections', 'Idioma / Language': 'Language / Idioma',
};

function translateStatic(root = document.body) {
  if (!EN) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement && !node.parentElement.closest('script, style') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (text && EN_STATIC[text]) node.nodeValue = node.nodeValue.replace(/\S[\s\S]*\S|\S/, EN_STATIC[text]);
  });
  root.querySelectorAll('[title], [placeholder], [aria-label]').forEach(el => ['title', 'placeholder', 'aria-label'].forEach(attr => {
    const value = el.getAttribute(attr); if (value && EN_STATIC[value]) el.setAttribute(attr, EN_STATIC[value]);
  }));
}
