"""Pruebas del parser con estados de cuenta sintéticos (tests/fixtures): uno leído por OCR y dos con capa de texto."""
from pathlib import Path

import pytest

from gbm_dashboard import parse

FIXTURES = Path(__file__).parent / 'fixtures'


@pytest.fixture(scope='module')
def portfolio():
    texts = {path.stem: path.read_text() for path in sorted(FIXTURES.glob('*.txt'))}
    return parse.build_portfolio(texts)


def month(portfolio, ym):
    return next(item for item in portfolio['months'] if item['ym'] == ym)


def test_months_and_totals(portfolio):
    assert [item['ym'] for item in portfolio['months']] == ['2023-12', '2024-01', '2024-02']
    # 2023-12 (OCR) no trae el renglón "VALOR DEL PORTAFOLIO": se reconstruye con los totales de sección + efectivo
    assert month(portfolio, '2023-12')['total'] == pytest.approx(20000.00)
    assert month(portfolio, '2024-01')['total'] == pytest.approx(21840.31)
    assert month(portfolio, '2024-02')['total'] == pytest.approx(22001.31)


def test_ocr_tickers_resolved_against_text_statements(portfolio):
    hold = month(portfolio, '2023-12')['hold']
    assert hold['VOO'] == [2, 18000.0]          # "voo*" y "Vvoo*" en el OCR
    assert hold['QCLN'] == [1, 1000.0]          # "OCLN" en el OCR
    assert 'OCLN' not in portfolio['instruments']


def test_reporto_is_cash_not_an_instrument(portfolio):
    assert month(portfolio, '2023-12')['cash'] == pytest.approx(1000.00)
    assert 'BI' not in portfolio['instruments']


def test_misread_net_amount_is_recovered(portfolio):
    # "9,O26.10" (O en vez de 0): se reconstruye con títulos × precio + comisión + IVA
    assert month(portfolio, '2023-12')['flows']['VOO']['buy'] == pytest.approx(9026.10)
    issue = next(item for item in portfolio['issues'] if item['ym'] == '2023-12')
    assert issue['level'] == 'info' and '9,026.10' in issue['msg'] and 'cuadra' in issue['msg']
    assert 'private/statements/2023-12.pdf' in issue['fix']


def test_pledged_titles_stay_in_the_portfolio(portfolio):
    jan = month(portfolio, '2024-01')
    assert jan['pledged'] == {'QCLN': [1, 1000.0]}
    assert jan['hold']['QCLN'] == [1, 1000.0]
    assert not jan['warnings']                  # el desglose + garantías cuadra con el valor del portafolio
    assert month(portfolio, '2024-02')['hold']['QCLN'] == [1, 1100.0]


def test_flows_signs_and_categories(portfolio):
    jan, feb = month(portfolio, '2024-01'), month(portfolio, '2024-02')
    assert jan['ext'] == {'dep': 600.0, 'wd': 0.0}
    assert jan['flows']['FMTY'] == {'buy': 1504.35}
    assert jan['flows']['VOO'] == {'div': 20.0, 'isr': -2.0}
    assert jan['fees'] == pytest.approx(-33.64)
    assert jan['trade_fees'] == pytest.approx(4.35)
    assert jan['interest'] == pytest.approx(0.30)
    assert feb['flows']['FMTY'] == {'fibra': 30.0, 'isr': -9.0}
    assert feb['ext'] == {'dep': 0.0, 'wd': 100.0}


def test_returns_table_newest_wins(portfolio):
    assert portfolio['returns']['2023-11'] == [0.0588, 0.0582, 500.0, 495.0]
    assert portfolio['returns']['2024-01'][1] == pytest.approx(0.0611)
    assert set(portfolio['returns']) == {'2023-11', '2023-12', '2024-01', '2024-02'}


def test_instrument_metadata(portfolio):
    inst = portfolio['instruments']
    assert inst['VOO']['section'] == 'SIC' and inst['VOO']['serie'] == '*'
    assert inst['FMTY']['section'] == 'BMV' and inst['FMTY']['serie'] == '14'
    assert inst['FMTY']['first'] == '2024-01'


@pytest.mark.parametrize('desc, expected', [
    ('Compra de Acciones. VOO *', ('compra', -1)),
    ('Comprade Acciones. VOO *', ('compra', -1)),
    ('Venta Soc. de Inv. - Cliente GBMF2 BF', ('venta', +1)),
    ('ABONO DIVIDENDO EMISORA VOO *', ('div', +1)),
    ('CARGO DIVIDENDO EMISORA VOO *', ('div', -1)),
    ('ISR 10 % POR DIVIDENDOS SIC VOO *', ('isr', -1)),
    ('Abono efectivo Resultado Fiscal FMTY 14', ('fibra', +1)),
    ('Abono Reembolso de Capital, Cust. FMTY 14', ('roc', +1)),
    ('Cancelación abono Reembolso de capital FMTY 14', ('roc', -1)),
    ('Retiro Titulos Fusión, Cust. Normal WORK *', ('corp', +1)),
    ('PAGO DE FRACCIONES POR DERECHO WORK *', ('corp', +1)),
    ('PAGO DE FRACCIONES POR DIVIDENDOS FIBRAPL 14', ('frac', +1)),
    ('Deposito Titulos Dividendo Especie, Cust. FIBRAPL 14', ('especie', 0)),
    ('DEPOSITO DE EFECTIVO POR TRASPASO Efec*', ('deposito', +1)),
    ('RETIRO DE EFECTIVO Efec *', ('retiro', -1)),
    ('Vencimiento de Reporto BI 240104', ('reporto', 0)),
])
def test_classify_move(desc, expected):
    assert parse.classify_move(desc) == expected


def test_resolver_handles_common_ocr_noise():
    resolve = parse.Resolver({'VOO', 'QCLN', 'SHV', 'FIBRAPL'}, {'XYZ': 'SHV'})
    assert resolve('Vvoo') == 'VOO'
    assert resolve('V00') == 'VOO'
    assert resolve('OCLN') == 'QCLN'
    assert resolve('XYZ') == 'SHV'          # alias del usuario
    assert resolve('PINS') == 'PINS'        # desconocido: se queda igual


def test_gap_and_unknown_ticker_warnings():
    texts = {path.stem: path.read_text() for path in sorted(FIXTURES.glob('*.txt'))}
    del texts['2024-01']
    texts['2024-02'] = texts['2024-02'].replace('RETIRO DE EFECTIVO Efec *', 'Compra de Acciones. ZZZZ * 1')
    portfolio = parse.build_portfolio(texts)
    warnings = ' '.join(portfolio['warnings'])
    assert 'falta el estado de cuenta de 2024-01' in warnings
    assert 'sin emisora reconocida' in warnings
