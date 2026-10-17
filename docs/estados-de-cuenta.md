# Estados de cuenta de GBM: versiones, OCR y casos especiales

## Versiones

GBM ha cambiado el formato de sus estados de cuenta. `gbm extract` no decide por fecha sino por contenido:

| Versión | Ejemplo | Cómo se lee |
|---|---|---|
| PDF sólo con imágenes | en nuestras pruebas, mayo 2021 – marzo 2022 | OCR con tesseract (página renderizada a ~216 dpi, `--psm 6`) |
| PDF con capa de texto | abril 2022 en adelante | pdfplumber |

Si la capa de texto de un PDF trae menos de 200 caracteres, se trata como imagen. El texto queda en
`private/text/YYYY-MM.txt` con una primera línea `#MODE ocr` o `#MODE texto`; `gbm extract --force` lo regenera.

## Qué se extrae de cada mes

- **Resumen del portafolio**: valor del portafolio, efectivo y garantías al cierre.
- **Desglose del portafolio**: cada sección (deuda en reporto, fondos de inversión, ACCIONES de la BMV, ACCIONES DEL
  SIC…) con títulos y valor de mercado. El reporto se suma al efectivo.
- **Desglose de movimientos**: compras, ventas, depósitos y retiros de efectivo, dividendos, resultado fiscal y
  reembolso de capital de FIBRAs, ISR retenido, comisiones e IVA, eventos corporativos, títulos en garantía.
- **Rendimiento del portafolio**: los 12 meses que reporta GBM (incluye meses anteriores al primer estado).

El signo de cada movimiento se toma de la columna SALDO (saldo de efectivo corriente), no de la descripción.

## OCR: qué se corrige solo y qué revisar

El OCR de los estados antiguos confunde letras y números. El parser:

- Resuelve tickers contra los que aparecen en los estados con capa de texto y en la constancia fiscal
  (`OCLN` → `QCLN`, `Vvoo`/`V00` → `VOO`). Un ticker que sólo existe en meses de OCR se acepta si títulos × precio
  cuadra con el valor.
- Lee `fo)`, `to)`, `oO`, `°` como cero en las columnas de títulos.
- Si el neto o el saldo de un movimiento no se pudo leer, prueba candidatos (neto, saldo, cambio de saldo y, en
  compras/ventas, títulos × precio ± comisión e IVA) y se queda con el que hace cuadrar la siguiente línea.
- Si falta el renglón "VALOR DEL PORTAFOLIO", lo reconstruye con los totales de deuda y renta variable + efectivo.

Todo lo que no cuadra se reporta: en la terminal al correr `gbm parse` y en el dashboard, bajo los KPIs
("N avisos al leer los estados de cuenta"). Si un ticker quedó mal, agrega un alias en `private/instruments.json`:

```json
{ "instruments": { ... }, "aliases": { "OCLN": "QCLN" } }
```

## Avisos

`gbm parse` (en la terminal) y el dashboard (debajo de los KPIs) listan lo que no se pudo leer limpio. Cada aviso
tiene un nivel:

- **Corregido automáticamente**: el parser reconstruyó el valor y lo confirmó con el saldo de efectivo del propio
  estado de cuenta. No tienes que hacer nada.
- **Para revisar**: el parser no pudo confirmarlo. Sigue la indicación del aviso.

| Aviso | Nivel | Qué significa | Qué hacer |
|---|---|---|---|
| `el OCR no leyó bien el monto; se usó X (…) y cuadra con el saldo de la línea siguiente` | Corregido | El neto o el saldo de ese movimiento venía ilegible; se reconstruyó (títulos × precio ± comisión e IVA, o el cambio de saldo) y el saldo siguiente lo confirma | Nada. Si quieres confirmarlo, busca el movimiento (día y descripción) en `private/statements/YYYY-MM.pdf` |
| `… sin poder confirmarlo` | Revisar | Igual, pero no hubo forma de comprobarlo | Busca el movimiento en el PDF; si el monto es otro, corrígelo en `private/text/YYYY-MM.txt` y corre `uv run gbm parse && uv run gbm build` |
| `sin "VALOR DEL PORTAFOLIO" legible` | Corregido | El OCR perdió el renglón del resumen; se usó la suma del desglose | Nada |
| `el desglose suma X pero el valor del portafolio es Y` | Revisar | Algún renglón del desglose (títulos o valor) se leyó mal, o falta una emisora | Compara el desglose del PDF con el `.txt`; corrige y vuelve a correr `gbm parse && gbm build` |
| `no cuadran títulos × precio con el valor` | Revisar | Un renglón del desglose tiene un número mal leído | Igual que el anterior |
| `sin emisora reconocida` / `Tickers sólo vistos por OCR y sin resolver` | Revisar | El OCR leyó mal un ticker | Agrega un alias en `private/instruments.json`: `"aliases": {"OCLN": "QCLN"}` |
| `falta el estado de cuenta de …` | Revisar | Hay un hueco en tus PDFs; el rendimiento del mes siguiente abarca el hueco | Descárgalo: `uv run gbm download --since YYYY-MM --until YYYY-MM` |
| `movimiento no reconocido` | Revisar | Un tipo de movimiento que el parser no conoce; su efectivo queda en "Efectivo y reporto" | Si importa, agrégalo a `RULES` en `gbm_dashboard/parse.py` |
| `compra/venta con signo inesperado` | Revisar | El saldo sugiere lo contrario a la descripción | Revisa el movimiento en el PDF |

Corregir `private/text/YYYY-MM.txt` a mano es seguro: `gbm extract` no lo vuelve a generar mientras el PDF no
cambie (salvo con `gbm extract --force`).

## Casos especiales

| Caso | Cómo aparece | Cómo se trata |
|---|---|---|
| Títulos en garantía (caución) | "Constitucion/Liberacion Val en Garantia" y el renglón GARANTÍAS del resumen; los títulos desaparecen del desglose | Se siguen contando como tuyos, valuados al último precio; sin flujo |
| Fusión / compra de la empresa | "Retiro Titulos Fusión" + "REEMBOLSO DISTRIBUCION DE CAPITAL" / "PAGO DE FRACCIONES POR DERECHO" | El efectivo recibido es una venta del instrumento |
| Dividendo en especie | "Deposito Titulos Dividendo Especie", "Deposito de CBFIs por Resultado Fiscal" | Títulos × precio del mes; es rendimiento si incluyes dividendos, aportación si no |
| Cancelaciones | "Cancelación abono Resultado fiscal / Reembolso de capital", "CARGO DIVIDENDO" | Restan de la distribución original |
| ISR sin emisora | "CARGO RETENCION ISR", "Cargo ISR retenido fibras ejercicio ant" | Cuenta como ISR retenido, sin instrumento |
| Efectivo negativo | Compras que liquidan antes que el depósito | Se permite; el efectivo no entra en rankings |

## Limitaciones

- El primer estado de cuenta descargado se toma como punto de partida (aportación inicial): no hay costo de
  adquisición ni rendimiento de antes.
- Los instrumentos del SIC se valúan en pesos, como en el estado de cuenta: su rendimiento incluye el tipo de cambio.
- El INPC de `data/inpc.json` empieza en enero 2019: para meses anteriores se usa ese primer valor (la inflación de
  esos meses no se refleja).
- Si falta el estado de cuenta de algún mes, el rendimiento del mes siguiente abarca el hueco (se avisa en el dashboard).
- Un solo contrato por dashboard (ver docs/credenciales.md para varios contratos).
- El rendimiento calculado y el que reporta GBM pueden diferir unas décimas por mes (fechas de liquidación,
  comisiones, método de GBM).
