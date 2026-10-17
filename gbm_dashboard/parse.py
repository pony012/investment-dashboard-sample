"""Texto de los estados de cuenta -> private/portfolio.json.

Por cada mes se extrae:
  - resumen: valor del portafolio, efectivo y garantías al cierre;
  - tenencias de cada sección del desglose (reporto, fondos, ACCIONES (BMV), ACCIONES DEL SIC...);
  - movimientos: compras/ventas por emisora, depósitos/retiros de efectivo, dividendos, distribuciones
    de FIBRAs, ISR, comisiones, eventos corporativos, títulos en garantía;
  - el rendimiento mensual que reporta GBM (tabla de 12 meses).

El signo de cada movimiento sale de la columna SALDO (saldo de efectivo corriente), así que no depende
de la descripción. Los tickers que el OCR lee mal (OCLN, Vvoo...) se resuelven contra los que aparecen en
los estados con capa de texto, más los alias de private/instruments.json.
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime

from . import paths

NUM = r'\(?-?\d[\d,]*\.\d+\)?%?'
CASH = 'EFECTIVO'          # instrumento sintético: efectivo + reporto (+ saldo negativo si lo hubo)


def num(text):
    text = text.strip().rstrip('%').replace(',', '')
    negative = text.startswith('(') or text.startswith('-')
    return -float(text.strip('()-')) if negative else float(text.strip('()-'))


def int_token(token):
    token = token.replace(',', '')
    return int(token) if token.isdigit() else None


def strip_accents(text):
    return ''.join(char for char in unicodedata.normalize('NFD', text) if unicodedata.category(char) != 'Mn')


# ------------------------------------------------------------------ resumen y rendimientos

def parse_summary(lines):
    out = {}
    for line in lines:
        flat = strip_accents(line).upper()
        for key, label in (('total', r'VALOR DEL PORTAFOLIO\D*?'), ('cash', r'EFECTIVO\s+'), ('pledged', r'GARANTIAS\s+')):
            match = re.match(r'^' + label + '(' + NUM + r')\s+(' + NUM + ')', flat)
            if match and key + '_fin' not in out:
                out[key + '_ini'], out[key + '_fin'] = num(match[1]), num(match[2])
        match = re.match(r'^TOTAL: (DEUDA|RENTA VARIABLE)\s+(' + NUM + ')', flat)
        if match:
            out['sections_fin'] = out.get('sections_fin', 0.0) + num(match[2])
        for key, label in (('deposits', 'ENTRADAS DE EFECTIVO'), ('withdrawals', 'SALIDAS DE EFECTIVO'),
                           ('rights', 'DERECHOS PATRIMONIALES'), ('fees', 'COMISIONES')):
            match = re.search(label + r'\s+(' + NUM + r')\s*$', flat)
            if match and key not in out:
                out[key] = num(match[1])
    return out


def parse_returns(lines):
    out = {}
    for line in lines:
        match = re.match(r'^Del (\d{2})/(\d{2})/(\d{4}) al \d{2}/\d{2}/\d{4}\s+(' + NUM + r')\s+(' + NUM + r')\s+(' + NUM + r')\s+(' + NUM + ')', line)
        if match:
            out[f'{match[3]}-{match[2]}'] = [round(num(match[5]) / 100, 6), round(num(match[7]) / 100, 6), num(match[4]), num(match[6])]
    return out


# ------------------------------------------------------------------ tenencias

SECTION_HEAD = re.compile(r'^[A-ZÁÉÍÓÚÑ /\*\.]{4,}$')


def parse_holdings(lines):
    """Filas del DESGLOSE DEL PORTAFOLIO. Devuelve [{emisora, serie, section, tit, value}]."""
    rows, section, in_table, started = [], None, False, False
    for idx, line in enumerate(lines):
        flat = strip_accents(line).upper().strip()
        if 'DESGLOSE DEL PORTAFOLIO' in flat or flat.startswith('EMISORA'):
            started = True     # el OCR de los estados antiguos suele perder el título "DESGLOSE DEL PORTAFOLIO"
        if not started:
            continue
        if flat.startswith('DESGLOSE DE MOVIMIENTOS') or flat.startswith('EFECTIVO VALOR') or flat.startswith('VALOR CART'):
            break
        if flat.startswith('EMISORA'):
            # el nombre de la sección es la última línea en mayúsculas antes del encabezado
            for back in range(idx - 1, max(idx - 4, 0), -1):
                candidate = strip_accents(lines[back]).upper().strip().rstrip('*').strip()
                if SECTION_HEAD.match(candidate) and not candidate.startswith('TOTAL'):
                    section = candidate
                    break
            in_table = True
            continue
        if flat.startswith('TOTAL'):
            in_table = False
            continue
        if not in_table or not section:
            continue
        row = parse_holding_row(line)
        if row:
            row['section'] = section
            rows.append(row)
    return rows


OCR_ZERO = re.compile(r'^\(?(fo|fe|to|o|oO|Oo|e|O|\(e|0|°)[\)\}]?\)?$')


def parse_holding_row(line):
    tokens = line.split()
    if len(tokens) < 6 or not re.match(r'^[A-Za-z][A-Za-z0-9&\.\-]*\*?$', tokens[0]):
        return None
    if tokens[0].endswith('*') and len(tokens[0]) > 1:
        emisora, serie, rest = tokens[0][:-1], '*', tokens[1:]
    else:
        emisora, serie, rest = tokens[0], tokens[1], tokens[2:]
    rest = ['0' if OCR_ZERO.match(token) else token for token in rest]
    titles = [int_token(token) for token in rest[:2]]
    nums = [num(token) for token in rest if re.fullmatch(NUM, token)]
    if titles[1] is None or len(nums) < 3:
        return None
    tit = titles[1]
    value = nums[-3]     # en todas las versiones: ..., VALOR, PLUSVALÍA/PREMIO, % CART.
    ok = tit == 0 and abs(value) < 0.01
    if tit and not ok:
        ok = any(abs(tit * price - value) <= max(1.0, 0.003 * abs(value)) for price in nums[:-3])
        if not ok:      # el OCR movió columnas: busca un valor que sí sea títulos × precio
            for cand in reversed(nums):     # el valor de mercado va después de los costos
                if any(price is not cand and abs(tit * price - cand) <= max(1.0, 0.003 * abs(cand)) for price in nums):
                    value, ok = cand, True
                    break
    return {'emisora': emisora.upper(), 'serie': serie.upper(), 'tit': tit, 'value': value, 'ok': ok}


def parse_constancia_tickers(lines):
    """Emisoras de la CONSTANCIA INFORMATIVA (sirve para conocer tickers aun si el desglose viene con ruido)."""
    out, inside = set(), False
    for line in lines:
        flat = strip_accents(line).upper()
        if 'CONSTANCIA INFORMATIVA' in flat:
            inside = True
            continue
        if inside and (flat.startswith('GANANCIA O PERDIDA') or flat.startswith('1.-')):
            inside = False
        if inside:
            match = re.match(r'^([A-Z][A-Z0-9&]{1,9})\s*\*?\s+[A-Z0-9*]{0,3}\s*\d', flat)
            if match and match[1] not in ('EMISORA', 'FISCAL', 'NO'):
                out.add(match[1])
    return out


# ------------------------------------------------------------------ movimientos

# (patrón sobre la descripción sin acentos en mayúsculas, categoría, signo por defecto)
RULES = [
    (r'EFECTIVO INICIAL', 'inicial', 0),
    (r'REPORTO', 'reporto', 0),
    (r'CONSTITUCION VAL EN GARANTIA', 'garantia_in', 0),
    (r'LIBERACION VAL EN GARANTIA', 'garantia_out', 0),
    (r'RETIRO TITULOS FUSI|REEMBOLSO DISTRIBUCION DE CAPITAL|FRACCIONES POR DERECHO', 'corp', +1),
    (r'DEPOSITO TITULOS DIVIDENDO ESPECIE|DEPOSITO DE CBFIS|DIVIDENDO ESPECIE', 'especie', 0),
    (r'CANCELACION.*REEMBOLSO DE CAPITAL', 'roc', -1),
    (r'CANCELACION.*RESULTADO', 'fibra', -1),
    (r'CARGO DIVIDENDO', 'div', -1),
    (r'ABONO DIVIDENDO|REEMBOLSO RETENCION', 'div', +1),
    (r'ABONO ISR', 'isr', +1),
    (r'ISR|RETENCION', 'isr', -1),
    (r'RESULTADO FISCAL', 'fibra', +1),
    (r'REEMBOLSO DE CAPITAL', 'roc', +1),
    (r'FRACCIONES', 'frac', +1),
    (r'CARGO COMISION|CARGO IVA|COMISION', 'comision', -1),
    (r'COMPRA', 'compra', -1),
    (r'VENTA', 'venta', +1),
    (r'DEPOSITO DE VALORES|DEPOSITO TITULOS|TRASPASO DE VALORES', 'deposito_valores', 0),
    (r'RETIRO DE VALORES|RETIRO TITULOS', 'retiro_valores', 0),
    (r'DEPOSITO', 'deposito', +1),
    (r'RETIRO', 'retiro', -1),
]


def classify_move(desc):
    flat = strip_accents(desc).upper()
    flat = re.sub(r'COMPRA ?DE ?', 'COMPRA DE ', flat)
    for pattern, cat, sign in RULES:
        if re.search(pattern, flat):
            return cat, sign
    return 'otro', 0


MOVE_LINE = re.compile(r'^(\d{2})/[0-9A-Za-z]{2}\s*\|?\s*(\d{3,}|[A-Za-z0-9]{1,3}[\}\)]?)\s+(.*)$')
# Renglones que continúan la descripción ("Normal", "Distribuido", "DIST.", "EXTRANJERA"...); las basuras cortas del OCR
# en los encabezados de página ("og", "une") no cuentan
CONTINUATION = re.compile(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ\.]{4,}( [A-Za-zÁÉÍÓÚáéíóúÑñ\.]{2,}){0,2}$')


def parse_moves(lines):
    moves, inside = [], False
    for line in lines:
        flat = strip_accents(line).upper()
        if 'DESGLOSE DE MOVIMIENTOS' in flat:
            inside = True
            continue
        if 'RENDIMIENTO DEL PORTAFOLIO' in flat:
            inside = False
        if not inside:
            continue
        match = MOVE_LINE.match(line.strip())
        if match:
            rest = re.sub(r'(-\d{1,3}) (\d{3}\.\d{2})\s*$', r'\1,\2', match[3])     # OCR: "-7 887.97"
            found = re.findall(NUM, rest)
            if len(found) < 2:
                continue
            head = rest[:rest.find(found[0])].strip()
            tail_nums = [num(token) for token in found]
            last5 = tail_nums[-5:] if len(tail_nums) >= 5 else [0.0] * (5 - len(tail_nums)) + tail_nums
            titles = re.search(r'(\d[\d,]*)$', head)
            com, inte, imp, neto, saldo = last5
            # compras/ventas: TÍTULOS PRECIO COMISIÓN INTERÉS IMPUESTO NETO SALDO; el precio unitario trae 6 decimales.
            # Las columnas se leen por posición después del precio, así un neto ilegible no recorre las demás.
            unit = re.search(r'(?<![\d.,])(\d[\d,]*\.\d{6})(?!\d)', rest)
            price = num(unit[1]) if unit else (tail_nums[0] if len(tail_nums) >= 6 else None)
            if unit and classify_move(head)[0] in ('compra', 'venta'):
                after = [num(token) for token in re.findall(NUM, rest[unit.end():])]
                if len(after) >= 5:
                    com, inte, imp, neto, saldo = after[0], after[1], after[2], after[3], after[-1]
                elif len(after) == 4:
                    # falta una columna: si la tercera es ~16% de la comisión es el IVA (falta el neto); si no, falta el IVA
                    if abs(after[2] - 0.16 * after[0]) <= 0.02 + 0.001 * after[0]:
                        com, inte, imp, neto, saldo = after[0], after[1], after[2], 0.0, after[3]
                    else:
                        com, inte, imp, neto, saldo = after[0], after[1], 0.0, after[2], after[3]
            moves.append({'day': int(match[1]), 'folio': match[2], 'head': head, 'tit': int_token(titles[1]) if titles else None, 'price': price,
                          'com': com, 'int': inte, 'imp': imp, 'neto': abs(neto), 'saldo': saldo})
        elif moves and CONTINUATION.match(line.strip()) and len(line.strip()) <= 25:
            moves[-1]['head'] += ' ' + line.strip()
    return moves


# ------------------------------------------------------------------ resolución de tickers

def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


class Resolver:
    """Mapea tickers con ruido de OCR a tickers conocidos."""

    def __init__(self, known, aliases):
        self.known = set(known)
        self.aliases = {key.upper(): value.upper() for key, value in (aliases or {}).items()}

    def __call__(self, raw):
        tk = re.sub(r'[^A-Z0-9&]', '', raw.upper())
        if not tk:
            return None
        if tk in self.aliases:
            return self.aliases[tk]
        if tk in self.known:
            return tk
        candidates = {tk, tk.replace('0', 'O'), re.sub(r'^V(?=V)', '', tk), re.sub(r'^(.)\1', r'\1', tk)}
        for cand in candidates:
            if cand in self.known:
                return cand
        close = [known for known in self.known if len(known) == len(tk) and lev(known, tk.replace('0', 'O')) <= 1 and len(tk) >= 3]
        if len(close) == 1:
            return close[0]
        return tk

    def find_in(self, text):
        """Ticker dentro de la descripción de un movimiento (o EFEC si es efectivo)."""
        tokens = [token.rstrip('*').upper() for token in re.findall(r'[A-Za-z][A-Za-z0-9&]*\*?', text)]
        for token in reversed(tokens):
            if token not in ('EFEC', 'EFECTIVO') and self(token) in self.known:
                return self(token)
        return 'EFEC' if any(token in ('EFEC', 'EFECTIVO') for token in tokens) else None


def recover_amount(move, cat, sign, prev_saldo, delta, next_move):
    """El OCR leyó mal el neto o el saldo de un movimiento. Se prueban candidatos (neto, saldo leído, cambio
    de saldo y, en compras/ventas, títulos × precio ± comisión e IVA) y gana el que deja cuadrar la siguiente línea.
    Devuelve (monto con signo, cómo se obtuvo, si se confirmó con la línea siguiente)."""
    candidates = []
    if cat in ('compra', 'venta') and move['tit'] and move['price']:
        fees_iva = abs(move['com']) + abs(move['imp'])
        candidates.append((move['tit'] * move['price'] + (fees_iva if cat == 'compra' else -fees_iva), 'títulos × precio ± comisión e IVA'))
    candidates += [(move['neto'], 'el neto leído'), (abs(move['saldo']), 'el número leído como saldo'), (abs(delta), 'el cambio de saldo')]
    signs = [sign] if sign else [1, -1]
    # Títulos × precio es evidencia independiente: si deja cuadrar el saldo de esta misma línea, está confirmado
    if cat in ('compra', 'venta') and move['tit'] and move['price']:
        cand = candidates[0][0] * (sign or 1)
        if abs(prev_saldo + cand - move['saldo']) < 0.06:
            return cand, candidates[0][1], True
    if next_move is not None:
        for cand, how in candidates:
            for cand_sign in signs:
                saldo = prev_saldo + cand_sign * cand
                next_delta = abs(next_move['saldo'] - saldo)
                if cand and (abs(next_delta - next_move['neto']) < 0.06 or next_delta < 0.06):
                    return cand_sign * cand, how, True
    if sign or cat in ('compra', 'venta'):
        return (sign or 1) * candidates[0][0], candidates[0][1], False
    return delta, 'el cambio de saldo', False


# ------------------------------------------------------------------ armado

def parse_text(text):
    lines = [line.rstrip() for line in text.splitlines()]
    return {
        'mode': 'ocr' if text.startswith('#MODE ocr') else 'texto',
        'summary': parse_summary(lines),
        'holdings': parse_holdings(lines),
        'moves': parse_moves(lines),
        'returns': parse_returns(lines),
        'constancia': sorted(parse_constancia_tickers(lines)),
    }


def is_cash_section(section):
    return 'REPORTO' in section


def section_kind(section):
    if 'REPORTO' in section:
        return 'reporto'
    if 'SIC' in section:
        return 'SIC'
    if 'FONDO' in section and 'DEUDA' in section:
        return 'fondo_deuda'
    if 'FONDO' in section:
        return 'fondo'
    if section.startswith('ACCIONES'):
        return 'BMV'
    if 'DEUDA' in section or 'GUBERNAMENTAL' in section:
        return 'deuda'
    return section.lower()


def next_ym(ym):
    year, month = int(ym[:4]), int(ym[5:7])
    return f'{year + 1}-01' if month == 12 else f'{year}-{month + 1:02d}'


def prev_month_ym(ym):
    year, month = int(ym[:4]), int(ym[5:7])
    return f'{year - 1}-12' if month == 1 else f'{year}-{month - 1:02d}'


def build_portfolio(texts, aliases=None):
    """texts: {ym: texto}. Devuelve el diccionario de portfolio.json."""
    parsed = {ym: parse_text(text) for ym, text in sorted(texts.items())}
    warnings, issues = [], []
    # Universo de tickers: estados con capa de texto + constancias + filas de OCR que cuadran títulos × precio
    known = set()
    for stmt in parsed.values():
        if stmt['mode'] == 'texto':
            known |= {row['emisora'] for row in stmt['holdings'] if not is_cash_section(row['section'])}
            known |= set(stmt['constancia'])
    base = Resolver(known, aliases)
    for stmt in parsed.values():
        if stmt['mode'] == 'ocr':
            for row in stmt['holdings']:
                if not is_cash_section(row['section']) and row['ok'] and row['tit'] > 0 and base(row['emisora']) not in known:
                    known.add(base(row['emisora']))
    resolve = Resolver(known, aliases)

    instruments, months, events, returns = {}, [], [], {}
    pledged, last_price = defaultdict(int), {}
    prev_ym = None
    for ym, stmt in parsed.items():
        month_warn = []
        pdf, txt = f'private/statements/{ym}.pdf', f'private/text/{ym}.txt'
        refix = f'Si un número está mal, corrígelo en {txt} y corre `uv run gbm parse && uv run gbm build`.'

        def warn(level, msg, fix):
            month_warn.append(msg)
            issues.append({'ym': ym, 'level': level, 'msg': msg, 'fix': fix})
        if prev_ym and ym != next_ym(prev_ym):
            gap = next_ym(prev_ym) + ('' if ym == next_ym(next_ym(prev_ym)) else f' a {prev_month_ym(ym)}')
            warn('revisar', f'falta el estado de cuenta de {gap}: el rendimiento de este mes incluye los meses faltantes',
                 f'Descarga ese mes: `uv run gbm download --since {next_ym(prev_ym)} --until {prev_month_ym(ym)}` (con tu archivo de credenciales).')
        prev_ym = ym
        hold, cash_hold = {}, 0.0
        for row in stmt['holdings']:
            if is_cash_section(row['section']):
                cash_hold += row['value']
                continue
            tk = resolve(row['emisora'])
            if not row['ok'] and row['tit']:
                warn('revisar', f'{tk}: no cuadran títulos × precio con el valor ({row["tit"]} títulos, {row["value"]:,.2f})',
                     f'Compara el renglón de {tk} en el desglose del portafolio de {pdf}. {refix}')
            entry = hold.setdefault(tk, [0, 0.0])
            entry[0] += row['tit']
            entry[1] += row['value']
            info = instruments.setdefault(tk, {'serie': row['serie'], 'section': section_kind(row['section']), 'first': ym, 'last': ym, 'ocr_only': True})
            if row['tit'] > 0:
                info['last'] = ym
            if stmt['mode'] == 'texto':
                info['ocr_only'] = False
                info['serie'] = row['serie']
        for tk, (tit, value) in hold.items():
            if tit > 0 and value:
                last_price[tk] = value / tit

        # Movimientos
        flows = defaultdict(lambda: defaultdict(float))
        ext = {'dep': 0.0, 'wd': 0.0}
        fees, trade_fees, interest, prev_saldo, fixed = 0.0, 0.0, 0.0, None, 0
        moves = stmt['moves']
        for move_idx, move in enumerate(moves):
            cat, sign = classify_move(move['head'])
            tk = resolve.find_in(move['head'])
            amount = move['neto']
            if cat == 'inicial':
                prev_saldo = move['saldo']
                continue
            if prev_saldo is not None:
                delta = move['saldo'] - prev_saldo
                if abs(delta - amount) < 0.06:
                    signed = amount
                elif abs(delta + amount) < 0.06:
                    signed = -amount
                elif abs(delta) < 0.06 and sign == 0:
                    signed = 0.0
                else:
                    fixed += 1
                    signed, how, verified = recover_amount(move, cat, sign, prev_saldo, delta, moves[move_idx + 1] if move_idx + 1 < len(moves) else None)
                    signed = round(signed, 2)
                    label = f'día {move["day"]:02d} «{re.sub(r"\s+", " ", move["head"]).strip()[:45]}»'
                    if verified:
                        warn('info', f'{label}: el OCR no leyó bien el monto; se usó {signed:,.2f} ({how}) y cuadra con el saldo de la línea siguiente',
                             f'Corregido automáticamente: no tienes que hacer nada. Para confirmarlo, busca ese movimiento en {pdf}.')
                    else:
                        warn('revisar', f'{label}: el OCR no leyó bien el monto; se usó {signed:,.2f} ({how}) sin poder confirmarlo',
                             f'Busca ese movimiento en {pdf}. {refix}')
                    move['saldo'] = prev_saldo + signed     # el saldo de la línea pudo ser el mal leído
            else:
                signed = sign * amount
            prev_saldo = move['saldo']
            if cat == 'reporto':
                if 'VENCIMIENTO' in strip_accents(move['head']).upper():
                    interest += abs(move['int'])       # premio del reporto
                continue
            titles = move['tit']
            if cat in ('compra', 'venta') and tk and tk != 'EFEC':
                flows[tk]['buy' if signed < 0 else 'sell'] += abs(signed)
                trade_fees += abs(move['com']) + abs(move['imp'])
                if signed > 0 and cat == 'compra' or signed < 0 and cat == 'venta':
                    warn('revisar', f'día {move["day"]:02d}: {cat} con signo inesperado ({move["head"][:40]})',
                         f'Revisa ese movimiento en {pdf}. {refix}')
            elif cat == 'corp' and tk:
                flows[tk]['corp'] += signed           # efectivo que sale del instrumento hacia la cuenta
            elif cat in ('div', 'fibra', 'roc', 'frac', 'isr'):
                flows[tk or 'EFEC'][cat] += signed
            elif cat == 'comision':
                fees += signed
            elif cat == 'deposito':
                ext['dep'] += signed
            elif cat == 'retiro':
                ext['wd'] += -signed
            elif cat == 'especie' and tk:
                flows[tk]['especie_tit'] += titles or 0
            elif cat in ('garantia_in', 'garantia_out') and tk:
                pledged[tk] += (titles or 0) * (1 if cat == 'garantia_in' else -1)
            elif cat in ('deposito_valores', 'retiro_valores') and tk:
                flows[tk]['transfer_tit'] += (titles or 0) * (1 if cat == 'deposito_valores' else -1)
            elif cat in ('compra', 'venta', 'corp', 'especie', 'garantia_in', 'garantia_out', 'deposito_valores', 'retiro_valores'):
                # sin emisora reconocida: el efectivo absorbería el monto y el instrumento parecería ganar o perder todo
                warn('revisar', f'día {move["day"]:02d}: {cat} sin emisora reconocida "{move["head"][:50]}" ({signed:,.2f})',
                     'El OCR leyó mal el ticker. Agrega un alias en private/instruments.json, p. ej. "aliases": {"OCLN": "QCLN"}, '
                     'y corre `uv run gbm parse && uv run gbm build`.')
            elif cat == 'otro' and abs(signed) > 0.005:
                warn('revisar', f'día {move["day"]:02d}: movimiento no reconocido "{move["head"][:50]}" ({signed:,.2f})',
                     'Ese tipo de movimiento no está en las reglas del parser; su efectivo queda en "Efectivo y reporto". '
                     'Si importa, agrégalo a RULES en gbm_dashboard/parse.py (o abre un issue con la descripción, sin montos).')
            if cat not in ('garantia_in', 'garantia_out') and (abs(signed) > 0.005 or cat in ('especie', 'corp')):
                desc = re.sub(r'\s+', ' ', move['head']).strip()[:80]
                events.append([ym, move['day'], tk, cat, round(signed, 2), desc])

        # Dividendo en especie: títulos × precio del mes
        for tk, flow in flows.items():
            if flow.get('especie_tit'):
                price = last_price.get(tk, 0)
                flow['especie'] = round(flow['especie_tit'] * price, 2)
                events.append([ym, 0, tk, 'especie_valor', flow['especie'], f'{int(flow["especie_tit"])} títulos en especie'])
            if flow.get('transfer_tit'):
                flow['transfer'] = round(flow['transfer_tit'] * last_price.get(tk, 0), 2)

        # Títulos en garantía: no aparecen en el desglose pero siguen siendo tuyos
        pledged_now = {tk: [tit, round(tit * last_price.get(tk, 0), 2)] for tk, tit in pledged.items() if tit > 0}
        for tk, (tit, value) in pledged_now.items():
            entry = hold.setdefault(tk, [0, 0.0])
            entry[0] += tit
            entry[1] += value

        summary = stmt['summary']
        cash = summary.get('cash_fin', 0.0) + cash_hold
        holdings_sum = sum(value for tit, value in hold.values()) + cash
        total = summary.get('total_fin')
        if total is None and 'sections_fin' in summary:
            # el OCR suele perder el renglón del resumen: deuda + renta variable + efectivo + garantías
            total = summary['sections_fin'] + summary.get('cash_fin', 0.0) + summary.get('pledged_fin', 0.0)
        if total is None and abs(holdings_sum) < 0.01:
            raise SystemExit(f'{ym}: no pude leer ni el valor del portafolio ni las tenencias. Revisa private/text/{ym}.txt '
                             f'(o vuelve a extraer con `gbm extract --force`).')
        if total is None:
            total = holdings_sum
            warn('info', 'sin "VALOR DEL PORTAFOLIO" legible; se usó la suma del desglose',
                 f'Normalmente no hay que hacer nada. Compara el total con el resumen de {pdf}.')
        elif abs(holdings_sum - total) > max(2.0, 0.002 * abs(total)):
            warn('revisar', f'el desglose suma {holdings_sum:,.2f} pero el valor del portafolio es {total:,.2f}',
                 f'Algún renglón del desglose (o una emisora) se leyó mal: compara el desglose de {pdf} con {txt}. {refix}')

        months.append({
            'ym': ym, 'mode': stmt['mode'], 'total': round(total, 2), 'cash': round(cash, 2),
            'hold': {tk: [tit, round(value, 2)] for tk, (tit, value) in sorted(hold.items()) if tit or value},
            'pledged': pledged_now,
            'flows': {tk: {key: round(value, 2) for key, value in flow.items() if not key.endswith('_tit') and abs(value) > 0.004}
                      for tk, flow in sorted(flows.items()) if any(abs(value) > 0.004 for value in flow.values())},
            'ext': {key: round(value, 2) for key, value in ext.items()}, 'fees': round(fees, 2),
            'trade_fees': round(trade_fees, 2), 'interest': round(interest, 2),
            'warnings': month_warn,
        })
        warnings += [f'{ym}: {msg}' for msg in month_warn]
        for key, value in stmt['returns'].items():
            returns[key] = value              # los estados más recientes sobrescriben

    unresolved = sorted(tk for tk, info in instruments.items() if info['ocr_only'] and tk not in known)
    if unresolved:
        msg = 'Tickers sólo vistos por OCR y sin resolver: ' + ', '.join(unresolved)
        warnings.append(msg)
        issues.append({'ym': None, 'level': 'revisar', 'msg': msg,
                       'fix': 'Si alguno es un ticker mal leído, agrega un alias en private/instruments.json, p. ej. "aliases": {"OCLN": "QCLN"}, y corre `uv run gbm parse && uv run gbm build`.'})
    return {
        'generated': datetime.now().isoformat(timespec='seconds'),
        'first': months[0]['ym'] if months else None, 'last': months[-1]['ym'] if months else None,
        'months': months, 'instruments': instruments, 'events': events,
        'returns': dict(sorted(returns.items())), 'warnings': warnings, 'issues': issues,
    }


def load_aliases():
    if paths.INSTRUMENTS.exists():
        return json.loads(paths.INSTRUMENTS.read_text()).get('aliases', {})
    return {}


def parse_all():
    files = sorted(paths.TEXT_CACHE.glob('*.txt'))
    if not files:
        raise SystemExit(f'No hay texto extraído en {paths.TEXT_CACHE}. Corre `gbm extract`.')
    texts = {path.stem[:7]: path.read_text() for path in files}
    portfolio = build_portfolio(texts, load_aliases())
    paths.PORTFOLIO.parent.mkdir(parents=True, exist_ok=True)
    paths.PORTFOLIO.write_text(json.dumps(portfolio, ensure_ascii=False, separators=(',', ':')))
    print(f'{len(portfolio["months"])} meses ({portfolio["first"]} a {portfolio["last"]}), '
          f'{len(portfolio["instruments"])} instrumentos, {len(portfolio["events"])} movimientos -> {paths.PORTFOLIO}', file=sys.stderr)
    for warning in portfolio['warnings']:
        print('  aviso:', warning, file=sys.stderr)
    return portfolio
