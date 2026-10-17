"""PDF del estado de cuenta -> texto (cacheado en private/text/YYYY-MM.txt).

GBM ha usado al menos dos versiones de estado de cuenta:
  - PDFs sólo con imágenes (en nuestras pruebas, 2021-05 a 2022-03): se leen con OCR (tesseract).
  - PDFs con capa de texto (2022-04 en adelante): se leen con pdfplumber.
La versión no se decide por fecha sino por contenido: si la capa de texto trae menos de MIN_TEXT
caracteres, el PDF se trata como imagen y se pasa por OCR.
"""
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from . import paths

MIN_TEXT = 200
OCR_SCALE = 3          # 3x ≈ 216 dpi; menos que esto confunde dígitos


def text_layer(pdf_path):
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        return [page.extract_text() or '' for page in pdf.pages]


def log(message, end='\n'):
    print(message, end=end, file=sys.stderr, flush=True)


def ocr_pages(pdf_path):
    if not shutil.which('tesseract'):
        raise SystemExit(f'{pdf_path.name} no tiene capa de texto y necesita OCR, pero no encontré `tesseract`.\n'
                         '  macOS: brew install tesseract   ·   Debian/Ubuntu: sudo apt install tesseract-ocr')
    import pypdfium2 as pdfium
    doc, pages = pdfium.PdfDocument(str(pdf_path)), []
    with tempfile.TemporaryDirectory() as tmp:
        for page_idx in range(len(doc)):
            log(f' {page_idx + 1}/{len(doc)}', end='')
            img = Path(tmp) / f'p{page_idx}.png'
            doc[page_idx].render(scale=OCR_SCALE).to_pil().convert('L').save(img)
            # --psm 6: bloque uniforme de texto; conserva mejor las filas de las tablas
            ocr = subprocess.run(['tesseract', str(img), '-', '--psm', '6', '-l', 'eng'], capture_output=True)
            if ocr.returncode != 0:
                raise SystemExit(f'\ntesseract falló con {pdf_path.name}: {ocr.stderr.decode("utf-8", "replace").strip()[:300]}')
            pages.append(ocr.stdout.decode('utf-8', 'replace'))
    if sum(len(page.strip()) for page in pages) < MIN_TEXT:
        raise SystemExit(f'\nEl OCR de {pdf_path.name} no produjo texto; revisa el PDF o la instalación de tesseract.')
    return pages


def pdf_to_text(pdf_path):
    """Devuelve (texto, modo, páginas). Va escribiendo en la terminal qué está haciendo con el PDF."""
    pages = text_layer(pdf_path)
    chars = sum(len(page) for page in pages)
    if chars >= MIN_TEXT:
        log(f'capa de texto ({len(pages)} páginas)')
        mode = 'texto'
    else:
        log(f'sin capa de texto ({chars} caracteres) → OCR, página', end='')
        started = time.monotonic()
        pages, mode = ocr_pages(pdf_path), 'ocr'
        log(f' · listo en {time.monotonic() - started:.0f} s')
    text = f'#MODE {mode}\n' + ''.join(f'\n=== PAGE {page_idx + 1}\n{page}' for page_idx, page in enumerate(pages))
    return text, mode


def extract_all(force=False):
    pdfs = sorted(paths.STATEMENTS.glob('*.pdf'))
    if not pdfs:
        raise SystemExit(f'No hay PDFs en {paths.STATEMENTS}. Corre `gbm download` (ver docs/credenciales.md).')
    paths.TEXT_CACHE.mkdir(parents=True, exist_ok=True)
    cache_of = lambda pdf_path: paths.TEXT_CACHE / (pdf_path.stem + '.txt')
    pending = [pdf_path for pdf_path in pdfs if force or not cache_of(pdf_path).exists() or cache_of(pdf_path).stat().st_mtime < pdf_path.stat().st_mtime]
    cached = len(pdfs) - len(pending)
    log(f'Extrayendo texto: {len(pdfs)} estados de cuenta ({pdfs[0].stem} a {pdfs[-1].stem}); '
        f'{len(pending)} por procesar' + (f', {cached} ya extraídos antes (se reutilizan)' if cached else '') + '.')
    if pending:
        log('Los PDFs sin capa de texto (estados antiguos, sólo imagen) pasan por OCR: tarda unos segundos por página.')
    counts, started = {'texto': 0, 'ocr': 0}, time.monotonic()
    for number, pdf_path in enumerate(pending, 1):
        log(f'  [{number}/{len(pending)}] {pdf_path.stem}: ', end='')
        text, mode = pdf_to_text(pdf_path)
        cache_of(pdf_path).write_text(text)
        counts[mode] += 1
    if pending:
        log(f'Listo en {time.monotonic() - started:.0f} s: {counts["texto"]} con capa de texto, {counts["ocr"]} con OCR'
            + (f', {cached} reutilizados' if cached else '') + f'. Texto en {paths.TEXT_CACHE}.')
    modes = {}
    for pdf_path in pdfs:
        first = cache_of(pdf_path).read_text().split('\n', 1)[0]
        modes.setdefault(first.removeprefix('#MODE ').strip(), []).append(pdf_path.stem)
    if modes.get('ocr'):
        ocr = modes['ocr']
        log(f'Leídos con OCR ({len(ocr)}): {ocr[0]} a {ocr[-1]}' + ('' if len(ocr) == 1 else f' ({", ".join(ocr)})' if len(ocr) <= 6 else '')
            + '. Revisa los avisos de `gbm parse`: el OCR puede leer mal algunos números.')
    return sorted(paths.TEXT_CACHE.glob('*.txt'))
