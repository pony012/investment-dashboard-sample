"""Punto de entrada: `uv run gbm <comando>`."""
import argparse


def main():
    ap = argparse.ArgumentParser(prog='gbm', description='Dashboard de inversiones a partir de tus estados de cuenta de GBM.')
    ap.add_argument('--data-dir', metavar='CARPETA', help='carpeta de tus datos personales (default private/)')
    sub = ap.add_subparsers(dest='cmd', required=True)

    dl = sub.add_parser('download', help='descarga los estados de cuenta (del más reciente al más antiguo)')
    dl.add_argument('--credentials', metavar='ARCHIVO', help='archivo con GBM_TOKEN, GBM_CONTRACT_ID y GBM_ACCOUNT_ID (default private/credentials.env)')
    dl.add_argument('--delete-credentials', action='store_true', help='borrar el archivo de credenciales al terminar')
    dl.add_argument('--since', metavar='YYYY-MM', help='no bajar de este mes')
    dl.add_argument('--until', metavar='YYYY-MM', help='empezar en este mes (por defecto, el actual)')
    dl.add_argument('--max-misses', type=int, default=3, help='meses seguidos sin estado de cuenta para detenerse (default 3)')

    ex = sub.add_parser('extract', help='PDF -> texto (capa de texto u OCR)')
    ex.add_argument('--force', action='store_true', help='volver a extraer aunque ya exista el texto')

    sub.add_parser('parse', help='texto -> private/portfolio.json')

    cl = sub.add_parser('classify', help='pregunta tipo, moneda, riesgo... de cada instrumento')
    cl.add_argument('--yes', action='store_true', help='aceptar las sugerencias sin preguntar')
    cl.add_argument('--all', action='store_true', help='volver a preguntar también los ya clasificados')

    sub.add_parser('prompt', help='imprime un prompt (para cualquier IA) que pide clasificación y calendario de dividendos en JSON')
    ai = sub.add_parser('import-ai', help='guarda en private/instruments.json la respuesta JSON de la IA')
    ai.add_argument('file', help="archivo con la respuesta (o '-' para leerla de la entrada estándar)")

    bd = sub.add_parser('build', help='genera dist/index.html')
    bd.add_argument('--demo', action='store_true', help='usa datos sintéticos (no necesita estados de cuenta)')
    bd.add_argument('--out', help='ruta de salida (default dist/index.html, o dist/demo.html con --demo)')

    al = sub.add_parser('all', help='extract + parse + classify (sólo los nuevos) + build')
    al.add_argument('--yes', action='store_true', help='aceptar las sugerencias de clasificación sin preguntar')

    args = ap.parse_args()
    if args.data_dir:
        from . import paths
        paths.set_private(args.data_dir)
    if args.cmd == 'download':
        from .download import download
        from pathlib import Path
        download(Path(args.credentials) if args.credentials else None, args.since, args.until, args.max_misses, args.delete_credentials)
    elif args.cmd == 'extract':
        from .extract import extract_all
        extract_all(args.force)
    elif args.cmd == 'parse':
        from .parse import parse_all
        parse_all()
    elif args.cmd == 'classify':
        from .classify import classify
        classify(accept=args.yes, everything=args.all)
    elif args.cmd == 'prompt':
        from .ai import print_prompt
        print_prompt()
    elif args.cmd == 'import-ai':
        from .ai import import_reply
        import_reply(args.file)
    elif args.cmd == 'build':
        from .build import build
        build(demo=args.demo, out=args.out)
    elif args.cmd == 'all':
        from .extract import extract_all
        from .parse import parse_all
        from .classify import classify
        from .build import build
        extract_all()
        parse_all()
        classify(accept=args.yes)
        build()


if __name__ == '__main__':
    main()
