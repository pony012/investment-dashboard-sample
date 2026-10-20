# Dashboard de inversiones con tus estados de cuenta de GBM

Convierte tus estados de cuenta mensuales de GBM (PDF) en un dashboard local: un solo archivo HTML que abres en el
navegador, sin servidor y sin enviar tus datos a ningún lado.

**Secciones:** Insights · Evolución del portafolio · Composición · Rendimiento por instrumento · Riesgo vs.
rendimiento por perfil · Dividendos, distribuciones e impuestos · Flujos · Detalle de instrumento · Inflación y valor
del dinero · Proyección de retiro · FIRE · Todos los instrumentos.

¿Sólo quieres verlo? `uv run gbm build --demo` genera `dist/demo.html` con datos sintéticos.

## Requisitos

- [uv](https://docs.astral.sh/uv/) (instala Python y las dependencias por ti).
- [tesseract](https://github.com/tesseract-ocr/tesseract) sólo si tienes estados de cuenta antiguos que vienen como
  imagen (en nuestras pruebas, hasta marzo de 2022): `brew install tesseract` o `sudo apt install tesseract-ocr`.

## Uso

```bash
# 1. Crea el archivo de credenciales (sólo tú puedes leerlo)
cp config/credentials.example.env private/credentials.env
```

```bash
chmod 600 private/credentials.env
```

Ábrelo en tu editor y llena `GBM_TOKEN`, `GBM_ACCOUNT_ID` (tu cuenta completa de GBM) y `GBM_CONTRACT_ID` (tu
contrato de trading). Cómo obtenerlos desde el navegador: [docs/credenciales.md](docs/credenciales.md). Ojo: la API
de GBM nombra la cuenta y el contrato al revés; la guía explica cuál es cuál.

```bash
# 2. Descarga tus estados de cuenta y borra el archivo de credenciales al terminar
uv run gbm download --delete-credentials
```

```bash
# 3. Extrae, interpreta, clasifica y genera el dashboard
uv run gbm all
```

> [!IMPORTANT]
> **4. Abre tu dashboard: `dist/index.html`.** `gbm all` no lo abre solo. Es un archivo HTML local: ábrelo con
> doble clic o desde la terminal:
>
> - macOS: `open dist/index.html`
> - Linux: `xdg-open dist/index.html`
> - Windows: `start dist\index.html`
>
> Necesita conexión a internet al abrirlo (carga la librería de gráficas desde un CDN); tus datos no salen de tu
> computadora.

> [!WARNING]
> `dist/index.html` contiene **todos tus montos**. No lo compartas ni lo subas a ningún lado (`dist/` está en
> `.gitignore`). Usa el botón "Ocultar montos" si vas a mostrar tu pantalla.

Las credenciales nunca se pasan con `export` ni en la línea de comandos: sólo en `private/credentials.env`, que está
en `.gitignore`. Bórralo en cuanto termine la descarga.

`gbm all` equivale a correr, en orden:

| Comando | Qué hace |
|---|---|
| `gbm extract` | PDF → texto. Usa la capa de texto del PDF o, si no tiene, OCR. Se cachea en `private/text/`. |
| `gbm parse` | Texto → `private/portfolio.json`: tenencias, compras/ventas, depósitos, dividendos, ISR, comisiones por mes. |
| `gbm classify` | Te pregunta, con sugerencias, qué es cada instrumento (ETF, acción, FIBRA, fondo…), si está dolarizado, su clase de activo, región y riesgo. Sólo pregunta por los nuevos; `--all` para revisar todos, `--yes` para aceptar las sugerencias. |
| `gbm build` | Genera `dist/index.html` con todo embebido. |
| `gbm prompt` / `gbm import-ai` | Opcional: completa la clasificación y el calendario de dividendos con una IA (ver abajo). |

Cada mes, después de que GBM publique tu estado de cuenta: vuelve a crear `private/credentials.env` con un JWT nuevo,
corre `uv run gbm download --delete-credentials` y luego `uv run gbm all`.

### Completar la clasificación con IA

Para no contestar instrumento por instrumento, puedes pedírselo a cualquier IA (ChatGPT, Claude, Gemini…). El prompt
sólo incluye tus tickers, no tus montos, y pide la respuesta en JSON: tipo, moneda (¿dolarizado?), clase de activo,
región, riesgo y **calendario de pagos de dividendos** (frecuencia, meses de pago y yield aproximado).

- **Desde el dashboard**: "Todos los instrumentos" → "Completar con IA". Copias el prompt, pegas la respuesta e
  importas; se valida y se guarda en el navegador. "Exportar clasificación" la descarga para `private/instruments.json`.
- **Desde la terminal**: `uv run gbm prompt` imprime el prompt; guarda la respuesta en un archivo y corre
  `uv run gbm import-ai respuesta.json` (o `-` para pegarla en la entrada estándar). Luego `uv run gbm build`.

Sólo se aceptan los valores de las listas permitidas; lo demás se ignora con un aviso. El calendario de pagos aparece
en la tabla de instrumentos y se usa para estimar las próximas distribuciones de los instrumentos que aún no te han
pagado. Revisa lo que responde la IA: puede equivocarse.

## Tus datos

Todo lo personal vive en `private/` (o en la subcarpeta que indiques con `gbm --data-dir`), que está en `.gitignore`:

```
private/
  credentials.env          JWT e identificadores (temporal: bórralo después de descargar)
  statements/YYYY-MM.pdf   estados de cuenta (nombre, RFC, domicilio, CLABE)
  text/YYYY-MM.txt         texto extraído
  portfolio.json           datos interpretados
  instruments.json         tu clasificación y calendario de dividendos (ver config/instruments.example.json)
dist/index.html            el dashboard, con tus montos
```

**Idioma / Language**: el dashboard está en español e inglés. El botón ES/EN del encabezado lo cambia (se recuerda en
el navegador); por defecto usa el idioma de tu navegador. También puedes fijarlo al generarlo con
`uv run gbm build --lang en` o abrir `dist/index.html?lang=en`. Los nombres de tus instrumentos, las descripciones de
los movimientos (tal como vienen de GBM) y los avisos del parser se muestran como están.

El dashboard guarda en el navegador (localStorage) tus preferencias: periodo, tema, supuestos de retiro y FIRE y los
cambios de clasificación que hagas en la tabla. "Exportar clasificación" descarga un `instruments.json` para
reemplazar el de `private/`.

## Cómo se calculan los rendimientos

- **Por mes y por instrumento**, con Modified Dietz: `generado = valor final − valor inicial − flujo neto` y
  `rendimiento = generado ÷ (valor inicial + ½ flujo neto)`. Los meses se encadenan (TWR), así que depósitos y
  retiros no distorsionan el rendimiento.
- **Flujo neto de un instrumento** = compras − ventas (con comisión e IVA) − efectivo de eventos corporativos.
  Con la casilla "Incluir dividendos", las distribuciones netas de ISR cuentan como rendimiento del instrumento que
  las pagó; sin ella, sólo plusvalías.
- **Efectivo y reporto** es un instrumento más: recibe depósitos, ventas y dividendos y paga compras, retiros y
  comisiones. Así la suma de flujos de todos los instrumentos siempre cuadra con tus depósitos − retiros. No entra en
  los rankings de rendimiento.
- **Primer estado de cuenta**: lo que ya tenías ese mes se toma como aportación inicial (GBM sólo conserva unos
  años de estados de cuenta, así que el primero descargado rara vez es la apertura de la cuenta).
- Como verificación, el dashboard compara mes a mes el rendimiento calculado contra el que reporta GBM en el propio
  estado de cuenta (tabla "Año por año" y gráfica "Rendimiento mensual que reporta GBM").

Detalles de las versiones de estado de cuenta, OCR, avisos y casos especiales (títulos en garantía, fusiones,
dividendos en especie): [docs/estados-de-cuenta.md](docs/estados-de-cuenta.md).

## Qué se calcula al vuelo, con qué supuestos y dónde interviene la IA

Casi todo el dashboard sale directo de tus estados de cuenta. Estas partes, en cambio, son **estimaciones o
modelos** que el dashboard calcula en tu navegador cada vez que lo abres; dependen del periodo seleccionado y de
supuestos que puedes cambiar. Ninguna es una predicción ni una recomendación.

### Próximas distribuciones (estimadas)

Para cada instrumento que tienes hoy:

1. **Si te pagó en los últimos 12 meses**, se asume que vuelve a pagar en los mismos meses del año siguiente.
   Monto estimado = lo que te pagó neto de ISR ese mismo mes hace un año × (valor de tu posición hoy ÷ valor de tu
   posición entonces). El ajuste se limita a entre 0.2× y 5× para que una compra o venta grande no lo distorsione.
2. **Si todavía no te ha pagado** (lo compraste hace poco) y tiene calendario de pagos (de "Completar con IA" o de
   `private/instruments.json`): un pago en cada mes de `meses_pago`, por valor de tu posición hoy × yield anual
   aproximado ÷ número de pagos al año, menos 10% de ISR si es del SIC. Estas filas dicen "calendario importado".
3. Si no hay historial ni calendario, no se estima nada.

Las fechas y montos reales los anuncia cada emisora; la tabla trae un enlace para verificarlos.

### Otras partes calculadas

| Sección / gráfica | Cómo se calcula | Supuestos que puedes cambiar | IA |
|---|---|---|---|
| Índice base 100 | Encadena los rendimientos mensuales (TWR) del portafolio y de cada grupo | Periodo, "Agrupar por", dividendos sí/no | — |
| Eficiencia | % de las ganancias del periodo ÷ peso promedio en el portafolio | Periodo | — |
| Atípicos | Instrumento con menos de 6 meses en el periodo y anualizado mayor a ±50% (p. ej. una acción que se fusionó a los 2 meses). Se oculta del ranking, riesgo vs. rendimiento, mapa de calor e insights, pero sigue contando en los totales del portafolio | Casilla "Ocultar atípicos"; botón "Atípico" en la tabla para marcar o desmarcar cualquiera ("Excluir" lo quita de todo) | — |
| Yield y yield de 12 meses | Distribuciones netas ÷ valor promedio invertido (anualizado) | Periodo | — |
| ¿Quién paga y cada cuándo? | Frecuencia observada = meses distintos con pago en los últimos 12 meses (≥ 9 mensual, 3–5 trimestral, 2 semestral, 1 anual); si el instrumento lleva menos de 12 meses contigo, usa el calendario importado | — | Calendario de "Completar con IA" (opcional) |
| Riesgo vs. rendimiento por perfil | Volatilidad = desviación estándar mensual × √12; peor caída; Sharpe = (rendimiento − tasa libre de riesgo) ÷ volatilidad. El perfil sale de la columna Riesgo | Tasa libre de riesgo (CETES), clasificación de riesgo | Riesgo de "Completar con IA" (opcional) |
| ¿Qué hubiera pasado si…? | Aplica los rendimientos históricos de cada perfil a otra mezcla, rebalanceada cada mes | % a mover y entre qué perfiles | — |
| Frontera eficiente | Markowitz con medias y covarianzas históricas de tus perfiles | Tasa libre de riesgo | — |
| Animación en el tiempo (▶) | En sunburst, mapa del portafolio, ranking, riesgo vs. rendimiento, dividendos por instrumento y frontera eficiente: cada cuadro recalcula todo como si el periodo terminara en ese mes. "Acumulado" va desde "Desde"; "Últimos 12 m" usa una ventana móvil. La frontera empieza a los 6 meses y riesgo vs. rendimiento a los 3. En el ranking y en dividendos por instrumento las barras se reacomodan como carrera | Mes (barra), ventana, periodo | — |
| Inflación y valor del dinero | INPC real de INEGI (`data/inpc.json`) para el pasado; después del último dato, tu inflación supuesta | Inflación a futuro, montos y fechas de las calculadoras | — |
| Proyección de retiro | Interés compuesto mensual con aportación que puede crecer con la inflación; tres formas de retiro: simple (saldo ÷ meses), fija y creciente con inflación | Edad, edad de retiro, tasa (por defecto tu TWR), aportación (por defecto tu ahorro neto promedio de 12 meses), retiro deseado | — |
| FIRE | Retiro desde hoy de la tasa elegida, ajustado por inflación. Monte Carlo de 700 escenarios con semilla fija (rendimientos normales con tu volatilidad) y curvas de éxito por tasa de retiro | Saldo, tasa de retiro, rendimiento, volatilidad (por defecto la de tu mezcla), gasto mensual, horizonte | — |
| Clasificación de instrumentos (tipo, moneda, clase, región, riesgo) | Sugerencias por ticker conocido o por mercado (SIC/BMV) que confirmas con `gbm classify` o editas en la tabla | Todo, en la tabla "Todos los instrumentos" | "Completar con IA" (opcional) |

Los supuestos que cambias en el dashboard se guardan en tu navegador. Lo que viene de la IA se valida (sólo valores
de las listas permitidas) pero puede estar mal: revísalo en la tabla de instrumentos.

## Desarrollo

```bash
uv run pytest            # pruebas con estados de cuenta sintéticos (tests/fixtures)
uv run gbm build --demo  # dashboard con datos sintéticos
```

- `gbm_dashboard/`: descarga, extracción, parser, clasificación y armado del HTML.
- `web/`: plantilla, estilos y JavaScript del dashboard (ECharts). `gbm build` los une en un solo archivo.
- `data/inpc.json`: INPC mensual de INEGI (base 2Q julio 2018 = 100). Para actualizarlo agrega los meses nuevos
  publicados por INEGI en `values`; después del último dato el dashboard usa la inflación supuesta.

Esto es una herramienta de análisis personal, no una recomendación de inversión.
