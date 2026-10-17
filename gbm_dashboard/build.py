"""Genera un único HTML autocontenido (dist/index.html) con los datos embebidos.

El HTML incluye tus montos: está en dist/, que se ignora en git. Ábrelo directo en el navegador.
"""
import json
import sys
from datetime import datetime
from pathlib import Path

from . import known, paths

JS_ORDER = ['core.js', 'helpers.js', 'sections1.js', 'sections2.js', 'ai.js', 'main.js']


def render_html(portfolio, classification, aliases=None, demo=False):
    inpc = json.loads(paths.INPC.read_text())['values'] if paths.INPC.exists() else {}
    from .ai import FRECUENCIAS, build_prompt
    data = {'portfolio': portfolio, 'cls': classification, 'aliases': aliases or {}, 'inpc': inpc, 'demo': demo,
            'aiPrompt': build_prompt(portfolio['instruments'], classification), 'frecuencias': FRECUENCIAS,
            'built': datetime.now().isoformat(timespec='seconds')}
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    web = paths.TEMPLATE.parent
    app = '\n'.join((web / 'js' / name).read_text() for name in JS_ORDER)
    html = paths.TEMPLATE.read_text()
    return (html.replace('/*__CSS__*/', (web / 'style.css').read_text())
                .replace('//__APP__', app)
                .replace('__DATA__', payload))


def build(demo=False, out=None):
    if demo:
        from .demo import demo_portfolio
        portfolio = demo_portfolio()
        classification = {tk: known.suggest(tk, info) for tk, info in portfolio['instruments'].items()}
        aliases = {}
    else:
        if not paths.PORTFOLIO.exists():
            raise SystemExit('No encontré private/portfolio.json. Corre `uv run gbm all` (o `uv run gbm build --demo` para ver un ejemplo).')
        portfolio = json.loads(paths.PORTFOLIO.read_text())
        saved = json.loads(paths.INSTRUMENTS.read_text()) if paths.INSTRUMENTS.exists() else {}
        classification, aliases = dict(saved.get('instruments', {})), saved.get('aliases', {})
        missing = [tk for tk in portfolio['instruments'] if tk not in classification]
        for tk in missing:
            classification[tk] = known.suggest(tk, portfolio['instruments'][tk])
        if missing:
            print(f'Sin clasificar (se usan sugerencias): {", ".join(missing)}. Corre `uv run gbm classify`.', file=sys.stderr)
    html = render_html(portfolio, classification, aliases, demo)
    target = paths.DIST / ('demo.html' if demo else 'index.html') if out is None else Path(out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html)
    print(f'{target} ({len(html) // 1024} KB)', file=sys.stderr)
    return target
