"""Clasificación de instrumentos: pregunta, con sugerencias, lo que los estados de cuenta no dicen.

Se guarda en private/instruments.json:
  {"instruments": {"VOO": {"nombre": ..., "tipo": "ETF", "clase": ..., "region": ..., "riesgo": ..., "moneda": "USD"}},
   "aliases": {"OCLN": "QCLN"}}      # opcional: corrige tickers que el OCR lee mal
"""
import json
import sys

from . import known, paths

FIELDS = [
    ('tipo', '¿Qué es?', known.TIPOS),
    ('moneda', '¿Está dolarizado? (su valor sigue al dólar)', known.MONEDAS),
    ('clase', 'Clase de activo', known.CLASES),
    ('region', 'Región', known.REGIONES),
    ('riesgo', 'Perfil de riesgo', known.RIESGOS),
]
SECTION_LABEL = {'SIC': 'Acciones del SIC (extranjeras)', 'BMV': 'Acciones (BMV)', 'fondo_deuda': 'Fondo de inversión de deuda',
                 'fondo': 'Fondo de inversión', 'deuda': 'Deuda'}


def load():
    if paths.INSTRUMENTS.exists():
        data = json.loads(paths.INSTRUMENTS.read_text())
        data.setdefault('instruments', {})
        data.setdefault('aliases', {})
        return data
    return {'instruments': {}, 'aliases': {}}


def save(data):
    paths.INSTRUMENTS.parent.mkdir(parents=True, exist_ok=True)
    paths.INSTRUMENTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def ask_choice(label, options, default):
    if default not in options:
        options = options + [default]
    shown = '  '.join(f'{idx + 1}) {opt}{" ←" if opt == default else ""}' for idx, opt in enumerate(options))
    while True:
        answer = input(f'  {label}\n    {shown}\n    [Enter = {default}] > ').strip()
        if not answer:
            return default
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return options[int(answer) - 1]
        matches = [opt for opt in options if opt.lower().startswith(answer.lower())]
        if len(matches) == 1:
            return matches[0]
        if len(answer) > 2:       # texto libre: un valor nuevo
            return answer
        print('    No entendí; escribe el número de la opción o Enter para la sugerencia.')


def classify(accept=False, everything=False):
    if not paths.PORTFOLIO.exists():
        raise SystemExit('Primero corre `gbm parse` (o `gbm all`).')
    portfolio = json.loads(paths.PORTFOLIO.read_text())
    data = load()
    pending = [tk for tk in portfolio['instruments'] if everything or tk not in data['instruments']]
    if not pending:
        print(f'Todos los instrumentos ya están clasificados ({paths.INSTRUMENTS}).', file=sys.stderr)
        return data
    interactive = not accept and sys.stdin.isatty()
    if not accept and not interactive:
        print('Sin terminal interactiva: se aceptan las sugerencias (edítalas luego con `gbm classify --all`).', file=sys.stderr)
    if interactive:
        print(f'\n{len(pending)} instrumento(s) por clasificar. Enter acepta la sugerencia (←); también puedes escribir el número o el inicio de la opción.\n')
    try:
        ask_all(portfolio, data, pending, interactive)
    except (EOFError, KeyboardInterrupt):
        save(data)
        raise SystemExit(f'\nInterrumpido. Lo clasificado hasta ahora quedó en {paths.INSTRUMENTS}; vuelve a correr `gbm classify` para seguir.')
    save(data)
    print(f'Clasificación guardada en {paths.INSTRUMENTS} ({len(data["instruments"])} instrumentos).', file=sys.stderr)
    return data


def ask_all(portfolio, data, pending, interactive):
    last_ym = portfolio['last']
    for tk in sorted(pending, key=lambda key: portfolio['instruments'][key]['first']):
        info = portfolio['instruments'][tk]
        current = data['instruments'].get(tk) or known.suggest(tk, info)
        if not interactive:
            data['instruments'][tk] = current
            continue
        held = 'hasta hoy' if info['last'] == last_ym else f'hasta {info["last"]}'
        print(f'— {tk} {info.get("serie", "")} · {SECTION_LABEL.get(info["section"], info["section"])} · {info["first"]} {held}')
        entry = {'nombre': input(f'  Nombre [Enter = {current["nombre"]}] > ').strip() or current['nombre']}
        for field, label, options in FIELDS:
            entry[field] = ask_choice(label, options, current[field])
        data['instruments'][tk] = entry
        save(data)            # guarda tras cada instrumento por si interrumpes
        print()
