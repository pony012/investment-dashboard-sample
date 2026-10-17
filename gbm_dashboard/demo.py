"""Datos sintéticos con la misma forma que private/portfolio.json, para ver el dashboard sin estados de cuenta.

Precios con caminata aleatoria (semilla fija), depósitos mensuales, compras con comisión + IVA, dividendos
trimestrales con 10% de ISR (SIC) y distribuciones de FIBRAs con retención. No corresponde a ninguna persona.
"""
import math
import random
from datetime import date, datetime

# ticker: (serie, sección, precio inicial MXN, rendimiento anual esperado, volatilidad anual, yield anual, peso objetivo)
UNIVERSE = {
    'VOO':     ('*', 'SIC', 7200.0, 0.10, 0.17, 0.013, 0.32),
    'VEA':     ('*', 'SIC', 950.0, 0.06, 0.16, 0.030, 0.14),
    'VWO':     ('*', 'SIC', 980.0, 0.04, 0.19, 0.030, 0.10),
    'SCHD':    ('*', 'SIC', 1500.0, 0.08, 0.15, 0.035, 0.10),
    'SHV':     ('*', 'SIC', 2200.0, -0.01, 0.10, 0.045, 0.14),
    'FUNO':    ('11', 'BMV', 22.0, 0.05, 0.22, 0.075, 0.08),
    'FMTY':    ('14', 'BMV', 11.5, 0.06, 0.18, 0.080, 0.07),
    'NAFTRAC': ('ISHRS', 'BMV', 48.0, 0.06, 0.18, 0.015, 0.05),
}
TRADE_FEE, IVA = 0.0025, 0.16


def ym_add(year, month, delta):
    month += delta
    while month > 12:
        month, year = month - 12, year + 1
    while month < 1:
        month, year = month + 12, year - 1
    return year, month


def demo_portfolio(n_months=60, seed=7):
    rnd = random.Random(seed)
    today = date.today()
    end_year, end_month = ym_add(today.year, today.month, -1)
    start_year, start_month = ym_add(end_year, end_month, -(n_months - 1))
    prices = {tk: spec[2] for tk, spec in UNIVERSE.items()}
    titles = {tk: 0 for tk in UNIVERSE}
    titles['AAPL'], prices['AAPL'] = 0, 2900.0
    cash, months, events, returns, instruments = 0.0, [], [], {}, {}
    prev_total = 0.0
    for step in range(n_months):
        year, month = ym_add(start_year, start_month, step)
        ym = f'{year}-{month:02d}'
        flows, ext = {}, {'dep': 0.0, 'wd': 0.0}
        trade_fees = 0.0
        # mercado
        shock = rnd.gauss(0, 0.035)
        for tk, spec in UNIVERSE.items():
            mu, vol = spec[3] / 12, spec[4] / math.sqrt(12)
            beta = 0.3 if tk == 'SHV' else 0.8
            prices[tk] *= math.exp(mu - vol * vol / 2 + beta * shock + vol * math.sqrt(1 - beta * beta * 0.5) * rnd.gauss(0, 1))
        prices['AAPL'] *= math.exp(0.012 + 1.6 * shock + 0.06 * rnd.gauss(0, 1))
        # depósito del mes (con un aumento a mitad del periodo y un retiro)
        deposit = round((15000 if step < n_months // 2 else 25000) * rnd.uniform(0.6, 1.4), -2)
        if step == 0:
            deposit = 150000.0
        if step % 13 == 12:
            deposit = 0.0
        ext['dep'] = deposit
        cash += deposit
        if step == int(n_months * 0.7):
            ext['wd'] = 60000.0
            cash -= 60000.0
            events.append([ym, 18, 'EFEC', 'retiro', -60000.0, 'RETIRO DE EFECTIVO Efec *'])
        if deposit:
            events.append([ym, 5, 'EFEC', 'deposito', deposit, 'DEPOSITO DE EFECTIVO Efec *'])
        # dividendos y distribuciones
        for tk, spec in UNIVERSE.items():
            if not titles[tk]:
                continue
            value = titles[tk] * prices[tk]
            if spec[1] == 'SIC' and (tk == 'SHV' or month % 3 == 0):     # SHV paga mensual; el resto, trimestral
                periods = 12 if tk == 'SHV' else 4
                gross = round(value * spec[5] / periods * rnd.uniform(0.85, 1.15), 2)
                isr = round(-gross * 0.10, 2)
                flows.setdefault(tk, {}).update({'div': gross, 'isr': isr})
                events += [[ym, 15, tk, 'div', gross, f'ABONO DIVIDENDO EMISORA {tk} * EXTRANJERA'], [ym, 15, tk, 'isr', isr, f'ISR 10 % POR DIVIDENDOS SIC {tk} *']]
                cash += gross + isr
            elif tk in ('FUNO', 'FMTY') and month % 3 == 1:
                total = value * spec[5] / 4 * rnd.uniform(0.9, 1.1)
                fibra, roc = round(total * 0.6, 2), round(total * 0.4, 2)
                isr = round(-fibra * 0.30, 2)
                flows.setdefault(tk, {}).update({'fibra': fibra, 'roc': roc, 'isr': isr})
                events += [[ym, 12, tk, 'fibra', fibra, f'Abono efectivo Resultado Fiscal {tk} {spec[0]} Distribuido'],
                           [ym, 12, tk, 'roc', roc, f'Abono Reembolso de Capital, Cust. {tk} {spec[0]} Normal'],
                           [ym, 12, tk, 'isr', isr, f'RETENCION ISR POR RESULTADO FISCAL {tk} {spec[0]} DIST.']]
                cash += fibra + roc + isr
            elif tk == 'NAFTRAC' and month == 6:
                gross = round(value * spec[5], 2)
                flows.setdefault(tk, {})['div'] = gross
                events.append([ym, 20, tk, 'div', gross, f'ABONO DIVIDENDO {tk} {spec[0]}'])
                cash += gross
        # una acción individual que se compra y luego se vende
        if step == 10 or step == int(n_months * 0.55):
            buy = step == 10
            qty = 10 if buy else titles['AAPL']
            amount = qty * prices['AAPL']
            fee = round(amount * TRADE_FEE * (1 + IVA), 2)
            net = round(amount + fee if buy else amount - fee, 2)
            titles['AAPL'] += qty if buy else -qty
            cash += -net if buy else net
            trade_fees += fee
            flows.setdefault('AAPL', {})['buy' if buy else 'sell'] = net
            events.append([ym, 9, 'AAPL', 'compra' if buy else 'venta', -net if buy else net, f'{"Compra" if buy else "Venta"} de Acciones. AAPL * {qty}'])
        # compras: lleva el portafolio hacia los pesos objetivo con el efectivo disponible
        invested = {tk: titles[tk] * prices[tk] for tk in UNIVERSE}
        target_total = sum(invested.values()) + cash - 2000
        for tk, spec in sorted(UNIVERSE.items(), key=lambda item: invested[item[0]] / max(target_total * item[1][6], 1)):
            gap = target_total * spec[6] - invested[tk]
            qty = int(min(gap, cash - 2000) // (prices[tk] * (1 + TRADE_FEE * (1 + IVA))))
            if qty <= 0:
                continue
            amount = qty * prices[tk]
            fee = round(amount * TRADE_FEE * (1 + IVA), 2)
            net = round(amount + fee, 2)
            titles[tk] += qty
            cash -= net
            trade_fees += fee
            flows.setdefault(tk, {})['buy'] = round(flows.get(tk, {}).get('buy', 0) + net, 2)
            events.append([ym, 10, tk, 'compra', -net, f'Compra de Acciones. {tk} {spec[0]} {qty}'])
        # premio del reporto sobre el efectivo
        interest = round(max(cash, 0) * 0.0001, 2)
        cash += interest
        hold = {tk: [titles[tk], round(titles[tk] * prices[tk], 2)] for tk in titles if titles[tk]}
        total = round(sum(value for tit, value in hold.values()) + cash, 2)
        flow = ext['dep'] - ext['wd']
        if step:
            gain = total - prev_total - flow
            ret = gain / (prev_total + flow / 2)
            returns[ym] = [round(ret + 0.0004, 6), round(ret, 6), round(gain + 30, 2), round(gain, 2)]
        prev_total = total
        months.append({'ym': ym, 'mode': 'texto', 'total': total, 'cash': round(cash, 2), 'hold': hold, 'pledged': {},
                       'flows': flows, 'ext': ext, 'fees': 0.0, 'trade_fees': round(trade_fees, 2), 'interest': interest, 'warnings': []})
        for tk in hold:
            info = instruments.setdefault(tk, {'serie': UNIVERSE.get(tk, ('*', 'SIC'))[0], 'section': UNIVERSE.get(tk, ('*', 'SIC'))[1], 'first': ym, 'last': ym, 'ocr_only': False})
            info['last'] = ym
    # meses "previos" que GBM también reporta en su tabla de rendimientos
    for back in range(1, 7):
        year, month = ym_add(start_year, start_month, -back)
        ret = round(rnd.gauss(0.008, 0.03), 6)
        returns[f'{year}-{month:02d}'] = [ret, ret, 0.0, 0.0]
    return {'generated': datetime.now().isoformat(timespec='seconds'), 'first': months[0]['ym'], 'last': months[-1]['ym'],
            'months': months, 'instruments': instruments, 'events': events, 'returns': dict(sorted(returns.items())), 'warnings': []}
