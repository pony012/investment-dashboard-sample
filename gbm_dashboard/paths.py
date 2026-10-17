"""Ubicación de los archivos. Todo lo personal vive en private/ (o en la carpeta de `gbm --data-dir`), que está en .gitignore."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def set_private(folder):
    """Carpeta de datos personales (default private/; `gbm --data-dir` para otra, p. ej. un segundo contrato)."""
    global PRIVATE, STATEMENTS, TEXT_CACHE, PORTFOLIO, INSTRUMENTS, CREDENTIALS
    PRIVATE = Path(folder).expanduser().resolve()
    STATEMENTS = PRIVATE / 'statements'         # PDFs descargados: YYYY-MM.pdf
    TEXT_CACHE = PRIVATE / 'text'               # texto extraído (capa de texto u OCR): YYYY-MM.txt
    PORTFOLIO = PRIVATE / 'portfolio.json'      # resultado de `gbm parse`
    INSTRUMENTS = PRIVATE / 'instruments.json'  # resultado de `gbm classify`
    CREDENTIALS = PRIVATE / 'credentials.env'   # JWT e identificadores para `gbm download` (bórralo al terminar)


set_private(ROOT / 'private')
DIST = ROOT / 'dist'
TEMPLATE = ROOT / 'web' / 'template.html'
INPC = ROOT / 'data' / 'inpc.json'
