"""Credenciales de GBM en un archivo local (nunca en variables de entorno ni en la línea de comandos).

Formato (ver config/credentials.example.env), una clave por línea:
    GBM_TOKEN=eyJ...
    GBM_CONTRACT_ID=...
    GBM_ACCOUNT_ID=...
Por defecto se lee private/credentials.env (private/ está en .gitignore). Los valores nunca se imprimen.
"""
import os
import stat
import sys

from . import paths

KEYS = ('GBM_TOKEN', 'GBM_CONTRACT_ID', 'GBM_ACCOUNT_ID')


def load(path=None):
    path = paths.CREDENTIALS if path is None else path
    if not path.exists():
        raise SystemExit(f'No encontré {path}. Copia config/credentials.example.env a {paths.CREDENTIALS} y llénalo '
                         '(ver docs/credenciales.md).')
    mode = path.stat().st_mode
    if os.name == 'posix' and mode & (stat.S_IRWXG | stat.S_IRWXO):
        print(f'  aviso: {path} lo pueden leer otros usuarios de esta computadora; corre `chmod 600 {path}`.', file=sys.stderr)
    values = {}
    for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            raise SystemExit(f'{path}, línea {number}: se esperaba CLAVE=valor.')
        key, value = line.split('=', 1)
        key = key.strip().removeprefix('export ').strip()
        value = value.strip().strip('"').strip("'").strip()
        if key == 'GBM_TOKEN':
            value = value.removeprefix('Bearer ').strip()
        if key in KEYS and value:
            values[key] = value
    return values


def remind(path=None):
    path = paths.CREDENTIALS if path is None else path
    if path.exists():
        print(f'\nRecomendación: borra el archivo de credenciales ahora que terminaste (contiene tu JWT):\n  rm {path}',
              file=sys.stderr)


def delete(path=None):
    path = paths.CREDENTIALS if path is None else path
    if path.exists():
        path.unlink()
        print(f'\nBorré {path}.', file=sys.stderr)
