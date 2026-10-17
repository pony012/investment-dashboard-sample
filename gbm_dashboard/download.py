"""Descarga los estados de cuenta de GBM, del mes más reciente hacia atrás, hasta el más antiguo disponible.

Necesita un JWT temporal y los identificadores de tu cuenta y contrato, en private/credentials.env
(ver docs/credenciales.md y config/credentials.example.env):
    GBM_TOKEN        JWT del encabezado Authorization (sin "Bearer "). Si falta en el archivo se pide sin eco.
    GBM_ACCOUNT_ID   UUID de tu cuenta de GBM (la cuenta completa)
    GBM_CONTRACT_ID  UUID del contrato de trading (cada contrato tiene sus propios estados de cuenta)
Ojo: la API de GBM los nombra al revés: .../contracts/<GBM_ACCOUNT_ID>/accounts/<GBM_CONTRACT_ID>/account-statements.
Las credenciales nunca se imprimen. Al terminar se recomienda borrar el archivo (o usa --delete-credentials).
Los estados de cuenta se guardan como private/statements/YYYY-MM.pdf.
"""
import getpass
import json
import sys
import urllib.error
import urllib.request
from datetime import date

from . import credentials, paths

# La API llama "contracts" a la cuenta completa y "accounts" a cada contrato de trading: el orden aquí es el correcto.
API = 'https://api.appgbm.com/v1/legal-documents/contracts/{account}/accounts/{contract}/account-statements'
HEADERS = {'accept': 'application/json', 'origin': 'https://www.appgbm.com', 'referer': 'https://www.appgbm.com/', 'platform': 'Browser'}


class Abort(Exception):
    pass


class NoStatements(Abort):
    """GBM no tiene estados de cuenta para estos identificadores: casi siempre son el contrato o la cuenta equivocados."""


KEEP_CREDENTIALS = 2      # código de salida: no se borran las credenciales aunque se pida (hay que corregirlas)


def prev_month(year, month):
    return (year - 1, 12) if month == 1 else (year, month - 1)


def http_get(url, headers, timeout=30):
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()
    except (urllib.error.URLError, TimeoutError) as err:
        raise Abort(f'Error de red: {err}. Vuelve a correr el comando; los meses ya descargados se saltan.')


def statement_link(token, account, contract, year, month):
    """Devuelve (URL firmada del PDF, None) o (None, motivo) si GBM confirma que no hay estado de cuenta para ese mes."""
    url = API.format(account=account, contract=contract) + f'?year={year}&month={month}&fileFormat=pdf'
    status, body = http_get(url, {**HEADERS, 'authorization': f'Bearer {token}'})
    if status in (401, 403):
        raise Abort('GBM rechazó el token (401/403). Los JWT duran poco: copia uno nuevo (docs/credenciales.md) y vuelve a correr; '
                    'lo ya descargado se conserva.')
    if status == 404:
        return None, 'HTTP 404'
    if status != 200:
        raise Abort(f'GBM respondió {status} para {year}-{month:02d}. Detengo la descarga para no confundirlo con "no hay más estados".')
    try:
        data = json.loads(body)
    except ValueError:
        raise Abort(f'Respuesta inesperada para {year}-{month:02d} (no es JSON).')
    if isinstance(data, dict) and data.get('url'):
        return data['url'], None
    # 200 sin url: se toma como "no hay estado de cuenta"; sólo se muestran las llaves (no los valores) para diagnosticar
    keys = ', '.join(sorted(data)) if isinstance(data, dict) else type(data).__name__
    return None, f'HTTP 200 sin url (llaves: {keys or "ninguna"})'


def swapped_ids(token, account, contract, empty):
    """¿La cuenta y el contrato vienen intercambiados? Se prueba con los meses que ya respondieron "no hay"."""
    for ym, reason in empty[1:3]:          # el primero suele ser el mes en curso, aún sin publicar
        link, _ = statement_link(token, contract, account, int(ym[:4]), int(ym[5:7]))
        if link:
            return True
    return False


def fetch_pdf(signed_url, dest):
    status, body = http_get(signed_url, {}, timeout=90)
    if status != 200:
        raise Abort(f'No pude descargar {dest.name} (HTTP {status}).')
    start = body.find(b'%PDF')
    if start < 0:
        raise Abort(f'{dest.name}: la descarga no es un PDF.')
    partial = dest.with_suffix('.part')   # si se interrumpe, no queda un PDF truncado que luego se salte
    partial.write_bytes(body[start:])     # GBM antepone unas líneas del spooler de impresión antes de %PDF
    partial.replace(dest)


def download(credentials_file=None, since=None, until=None, max_misses=3, delete_credentials=False):
    creds = credentials.load(credentials_file)
    keep = False
    try:
        run(creds, since, until, max_misses)
    except SystemExit as exit_:
        keep = exit_.code == KEEP_CREDENTIALS
        raise
    finally:
        if delete_credentials and keep:
            path = credentials_file or paths.CREDENTIALS
            print(f'\nNo borré {path} aunque usaste --delete-credentials: GBM no encontró estados de cuenta con esos '
                  'identificadores, así que probablemente GBM_ACCOUNT_ID o GBM_CONTRACT_ID están mal. Corrígelos en el '
                  f'archivo y vuelve a correr el comando (si ya no lo vas a usar: rm {path}).', file=sys.stderr)
        elif delete_credentials:
            credentials.delete(credentials_file)
        else:
            credentials.remind(credentials_file)


def run(creds, since, until, max_misses):
    contract, account = creds.get('GBM_CONTRACT_ID'), creds.get('GBM_ACCOUNT_ID')
    if not contract or not account:
        raise SystemExit('Faltan GBM_CONTRACT_ID y/o GBM_ACCOUNT_ID en el archivo de credenciales. Ver docs/credenciales.md.')
    token = creds.get('GBM_TOKEN') or getpass.getpass('JWT de GBM (no se muestra): ').strip().removeprefix('Bearer ').strip()
    if not token:
        raise SystemExit('Sin token no puedo descargar.')
    paths.STATEMENTS.mkdir(parents=True, exist_ok=True)

    today = date.today()
    year, month = (int(until[:4]), int(until[5:7])) if until else (today.year, today.month)
    start = (year, month)
    floor = (int(since[:4]), int(since[5:7])) if since else None
    found = misses = downloaded = skipped = 0
    empty = []        # (mes, motivo) consultados sin estado de cuenta
    swapped = False
    try:
        while True:
            if floor and (year, month) < floor:
                break
            ym = f'{year}-{month:02d}'
            dest = paths.STATEMENTS / f'{ym}.pdf'
            if dest.exists():
                found += 1
                skipped += 1
                misses = 0
            else:
                link, reason = statement_link(token, account, contract, year, month)
                if link:
                    fetch_pdf(link, dest)
                    print(f'  {ym}: descargado', file=sys.stderr)
                    found += 1
                    downloaded += 1
                    misses = 0
                else:
                    empty.append((ym, reason))
                if not link and found:
                    # Los meses recientes sin publicar no cuentan; sólo los huecos después del primer estado encontrado
                    misses += 1
                    if misses >= max_misses:
                        break
                elif not link and (start[0] - year) * 12 + start[1] - month > 3:
                    # Sólo se llega aquí si en esta corrida no se ha encontrado NINGÚN estado de cuenta (found == 0):
                    # en cuanto aparece uno, los meses sin estado sólo cuentan para detenerse, nunca para intercambiar.
                    if not swapped and swapped_ids(token, account, contract, empty):
                        # GBM nombra cuenta y contrato al revés en su API, así que es fácil invertirlos: se corrige aquí
                        account, contract, swapped = contract, account, True
                        print('\nAviso: GBM_ACCOUNT_ID y GBM_CONTRACT_ID parecen estar invertidos en el archivo de credenciales: '
                              'con esos valores GBM no encontró estados de cuenta y con los valores intercambiados sí.\n'
                              'Sigo con los valores intercambiados (GBM nombra la cuenta y el contrato al revés en su API; ver '
                              '"Cuenta vs. contrato" en docs/credenciales.md).\n', file=sys.stderr)
                        year, month = start
                        found = misses = 0
                        empty = []
                        continue
                    raise NoStatements('No encontré estados de cuenta en los últimos meses. Revisa en el archivo de credenciales que '
                                       'GBM_ACCOUNT_ID sea el UUID de la ruta .../dashboard/contracts/<id>/accounts y GBM_CONTRACT_ID '
                                       'el account_id de tu contrato en la respuesta (ver "Cuenta vs. contrato" en docs/credenciales.md).\n'
                                       'Respuestas de GBM: ' + ', '.join(f'{item} {why}' for item, why in empty))
            year, month = prev_month(year, month)
    except Abort as err:
        print(f'\n{err}', file=sys.stderr)
        print(f'Descargados en esta corrida: {downloaded}.', file=sys.stderr)
        raise SystemExit(KEEP_CREDENTIALS if isinstance(err, NoStatements) else 1)
    oldest = min((path.stem for path in paths.STATEMENTS.glob('*.pdf')), default=None)
    print(f'Listo: {downloaded} descargados; {skipped} ya estaban en {paths.STATEMENTS} y no se volvieron a bajar '
          f'(el más antiguo: {oldest}).', file=sys.stderr)
    if empty:
        print(f'Sin estado de cuenta en GBM: {", ".join(sorted(item for item, why in empty))} (el mes en curso y los anteriores a tu primer estado son normales).', file=sys.stderr)
    if skipped and not downloaded:
        print(f'Para descargar todo de nuevo, mueve o borra {paths.STATEMENTS} antes de correr `gbm download`.', file=sys.stderr)
    if swapped:
        print('Usé GBM_ACCOUNT_ID y GBM_CONTRACT_ID intercambiados. Si vas a reutilizar el archivo de credenciales, '
              'intercambia esos dos valores en él para que la próxima vez no haga falta.', file=sys.stderr)
