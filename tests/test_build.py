"""Clasificación sugerida, datos de demostración y armado del HTML."""
from gbm_dashboard import build, known
from gbm_dashboard.demo import demo_portfolio


def test_known_and_heuristic_suggestions():
    assert known.suggest('VOO', {'section': 'SIC'})['tipo'] == 'ETF'
    assert known.suggest('SHV', {'section': 'SIC'})['clase'] == 'Renta fija'
    unknown_sic = known.suggest('ZZZZ', {'section': 'SIC', 'serie': '*'})
    assert (unknown_sic['moneda'], unknown_sic['region']) == ('USD', 'EE.UU.')
    fibra = known.suggest('FNEW', {'section': 'BMV', 'serie': '18'})
    assert (fibra['tipo'], fibra['moneda']) == ('FIBRA', 'MXN')
    stock = known.suggest('ACME', {'section': 'BMV', 'serie': 'A'})
    assert stock['tipo'] == 'Acción individual'


def test_demo_portfolio_is_consistent():
    portfolio = demo_portfolio(n_months=24)
    months = portfolio['months']
    assert len(months) == 24
    for item in months:
        holdings = sum(value for tit, value in item['hold'].values())
        assert abs(holdings + item['cash'] - item['total']) < 0.05
    assert all(info['section'] in ('SIC', 'BMV') for info in portfolio['instruments'].values())


def test_render_html_embeds_everything():
    portfolio = demo_portfolio(n_months=12)
    cls = {tk: known.suggest(tk, info) for tk, info in portfolio['instruments'].items()}
    html = build.render_html(portfolio, cls, demo=True)
    assert '__DATA__' not in html and '//__APP__' not in html and '/*__CSS__*/' not in html
    assert '"demo":true' in html
    assert 'function buildModel' in html
    assert '</script' not in html.split('const DATA = ')[1].split(';\n</script>')[0]
