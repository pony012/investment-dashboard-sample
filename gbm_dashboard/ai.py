"""Prompt (para cualquier LLM) que pide la clasificación y el calendario de dividendos de tus instrumentos en JSON,
y validación de esa respuesta para guardarla en private/instruments.json.

El mismo esquema lo usa el dashboard ("Todos los instrumentos" → "Completar con IA"), que lo guarda en el navegador.
"""
import json
import re
import sys

from . import known, paths

FRECUENCIAS = ['mensual', 'trimestral', 'semestral', 'anual', 'irregular', 'no paga']
CONFIANZA = ['alta', 'media', 'baja']
MARKET = {'SIC': 'SIC (extranjera, cotiza en pesos en México)', 'BMV': 'BMV (Bolsa Mexicana de Valores)',
          'fondo_deuda': 'fondo de inversión de deuda', 'fondo': 'fondo de inversión', 'deuda': 'deuda'}


def build_prompt(instruments, classification=None):
    """instruments: {ticker: {'serie', 'section'}} (de portfolio.json)."""
    classification = classification or {}
    lines = []
    for tk, info in sorted(instruments.items()):
        name = (classification.get(tk) or {}).get('nombre')
        lines.append(f'- {tk} (serie {info.get("serie", "?")}, {MARKET.get(info.get("section"), info.get("section", "?"))})' + (f' — posiblemente "{name}"' if name and name != tk else ''))
    example = {'instruments': {'VOO': {
        'nombre': 'Vanguard S&P 500 ETF', 'tipo': 'ETF', 'moneda': 'USD', 'clase': 'Renta variable', 'region': 'EE.UU.', 'riesgo': 'Moderado',
        'dividendos': {'frecuencia': 'trimestral', 'meses_pago': [3, 6, 9, 12], 'yield_anual_aprox': 0.013},
        'confianza': 'alta', 'notas': 'Paga a finales de marzo, junio, septiembre y diciembre.'}}}
    return f"""Eres un analista de inversiones. Para cada instrumento de esta lista (de una cuenta de la casa de bolsa GBM en México), \
dame su clasificación y su calendario de pago de dividendos o distribuciones.

Instrumentos:
{chr(10).join(lines)}

Responde ÚNICAMENTE con un objeto JSON válido (sin texto antes ni después; puede ir dentro de un bloque ```json), con esta forma:

{re.sub(r'\[\s+([^\]]*?)\s+\]', lambda match: '[' + re.sub(r'\s+', ' ', match[1]) + ']', json.dumps(example, ensure_ascii=False, indent=2))}

Reglas:
- Usa exactamente las mismas claves (tickers) de la lista. Incluye todos los instrumentos.
- "tipo": uno de {json.dumps(known.TIPOS, ensure_ascii=False)}.
- "moneda": "USD" si su valor sigue al dólar (acciones y ETFs extranjeros, aunque coticen en pesos en el SIC), si no "MXN".
- "clase": uno de {json.dumps(known.CLASES, ensure_ascii=False)}.
- "region": uno de {json.dumps(known.REGIONES, ensure_ascii=False)} (exposición económica del instrumento, no dónde cotiza).
- "riesgo": uno de {json.dumps(known.RIESGOS, ensure_ascii=False)} (Conservador = deuda de corto plazo; Moderado = ETF amplio o FIBRA grande; Agresivo = acción individual, sectorial o emergentes).
- "dividendos.frecuencia": uno de {json.dumps(FRECUENCIAS, ensure_ascii=False)}.
- "dividendos.meses_pago": números de mes (1-12) en que normalmente se PAGA (fecha de pago, no ex-dividend). Lista vacía si no paga o es irregular.
- "dividendos.yield_anual_aprox": rendimiento por dividendos anual aproximado como decimal (0.013 = 1.3%), o null si no lo sabes.
- "confianza": uno de {json.dumps(CONFIANZA, ensure_ascii=False)}. Si no reconoces un ticker, no inventes: usa null en lo que no sepas y "confianza": "baja".
- Si el instrumento ya no existe (fusión, deslistado), dilo en "notas".
"""


def extract_json(text):
    """Acepta la respuesta tal cual la dio el modelo (con o sin bloque ```json)."""
    fenced = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.S)
    raw = fenced[1] if fenced else text[text.find('{'):text.rfind('}') + 1]
    return json.loads(raw)


def validate(reply, tickers):
    """Devuelve ({ticker: entrada limpia}, [avisos]). Sólo se aceptan valores de las listas permitidas."""
    data = reply.get('instruments') or reply.get('instrumentos') or {}
    allowed = {'tipo': known.TIPOS, 'moneda': known.MONEDAS, 'clase': known.CLASES, 'region': known.REGIONES, 'riesgo': known.RIESGOS}
    clean, warnings = {}, []
    by_upper = {tk.upper(): tk for tk in tickers}
    for raw_tk, entry in data.items():
        tk = by_upper.get(str(raw_tk).upper().strip())
        if not tk:
            warnings.append(f'{raw_tk}: no está en tu portafolio, se ignora')
            continue
        if not isinstance(entry, dict):
            continue
        out = {}
        if isinstance(entry.get('nombre'), str) and entry['nombre'].strip():
            out['nombre'] = entry['nombre'].strip()[:80]
        for field, options in allowed.items():
            value = entry.get(field)
            if value in options:
                out[field] = value
            elif value is not None:
                warnings.append(f'{tk}: {field} "{value}" no es una opción válida, se ignora')
        div = entry.get('dividendos')
        if isinstance(div, dict):
            cal = {}
            if div.get('frecuencia') in FRECUENCIAS:
                cal['frecuencia'] = div['frecuencia']
            months = div.get('meses_pago')
            if isinstance(months, list):
                cal['meses_pago'] = sorted({int(month) for month in months if isinstance(month, (int, float)) and 1 <= int(month) <= 12})
            yld = div.get('yield_anual_aprox')
            if isinstance(yld, (int, float)) and 0 <= yld < 1:
                cal['yield_anual_aprox'] = round(float(yld), 4)
            elif isinstance(yld, (int, float)) and 1 <= yld < 30:        # vino en porcentaje (1.3 en vez de 0.013)
                cal['yield_anual_aprox'] = round(float(yld) / 100, 4)
            if cal:
                out['dividendos'] = cal
        if entry.get('confianza') in CONFIANZA:
            out['confianza'] = entry['confianza']
        if isinstance(entry.get('notas'), str) and entry['notas'].strip():
            out['notas'] = entry['notas'].strip()[:300]
        if out:
            clean[tk] = out
    missing = sorted(set(tickers) - set(clean))
    if missing:
        warnings.append('Sin respuesta para: ' + ', '.join(missing))
    return clean, warnings


def load_portfolio():
    if not paths.PORTFOLIO.exists():
        raise SystemExit('Primero corre `uv run gbm parse` (o `gbm all`).')
    return json.loads(paths.PORTFOLIO.read_text())


def print_prompt():
    from .classify import load
    portfolio = load_portfolio()
    print(build_prompt(portfolio['instruments'], load()['instruments']))


def import_reply(path):
    from .classify import load, save
    portfolio = load_portfolio()
    text = sys.stdin.read() if path == '-' else open(path, encoding='utf-8').read()
    try:
        reply = extract_json(text)
    except ValueError as err:
        raise SystemExit(f'La respuesta no es JSON válido: {err}')
    clean, warnings = validate(reply, list(portfolio['instruments']))
    data = load()
    for tk, entry in clean.items():
        base = data['instruments'].get(tk) or known.suggest(tk, portfolio['instruments'][tk])
        data['instruments'][tk] = {**base, **entry}
    save(data)
    for warning in warnings:
        print('  aviso:', warning, file=sys.stderr)
    print(f'{len(clean)} instrumento(s) actualizados en {paths.INSTRUMENTS}. Corre `uv run gbm build`.', file=sys.stderr)
