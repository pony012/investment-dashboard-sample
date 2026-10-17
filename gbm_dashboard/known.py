"""Sugerencias de clasificación para tickers comunes. Sólo son sugerencias: `gbm classify` te deja cambiarlas."""

TIPOS = ['Acción individual', 'ETF', 'FIBRA', 'Fondo de inversión', 'Deuda / bonos', 'Otro']
CLASES = ['Renta variable', 'Renta fija', 'Bienes raíces', 'Alternativos', 'Efectivo']
REGIONES = ['EE.UU.', 'México', 'Internacional desarrollado', 'Mercados emergentes', 'Global']
RIESGOS = ['Conservador', 'Moderado', 'Agresivo']
MONEDAS = ['USD', 'MXN']

# ticker: (nombre, tipo, clase, región, riesgo, moneda)
KNOWN = {
    # ETFs de EE.UU. (SIC)
    'VOO': ('Vanguard S&P 500', 'ETF', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    'IVV': ('iShares Core S&P 500', 'ETF', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    'SPY': ('SPDR S&P 500', 'ETF', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    'VTI': ('Vanguard Total Stock Market', 'ETF', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    'QQQ': ('Invesco QQQ (Nasdaq 100)', 'ETF', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'SCHD': ('Schwab US Dividend Equity', 'ETF', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    'VIG': ('Vanguard Dividend Appreciation', 'ETF', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    'VYM': ('Vanguard High Dividend Yield', 'ETF', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    'VT': ('Vanguard Total World Stock', 'ETF', 'Renta variable', 'Global', 'Moderado', 'USD'),
    'ACWI': ('iShares MSCI ACWI', 'ETF', 'Renta variable', 'Global', 'Moderado', 'USD'),
    'VEA': ('Vanguard FTSE Developed Markets', 'ETF', 'Renta variable', 'Internacional desarrollado', 'Moderado', 'USD'),
    'IEFA': ('iShares Core MSCI EAFE', 'ETF', 'Renta variable', 'Internacional desarrollado', 'Moderado', 'USD'),
    'VXUS': ('Vanguard Total International Stock', 'ETF', 'Renta variable', 'Internacional desarrollado', 'Moderado', 'USD'),
    'VWO': ('Vanguard FTSE Emerging Markets', 'ETF', 'Renta variable', 'Mercados emergentes', 'Agresivo', 'USD'),
    'IEMG': ('iShares Core MSCI Emerging Markets', 'ETF', 'Renta variable', 'Mercados emergentes', 'Agresivo', 'USD'),
    'QCLN': ('First Trust Clean Edge Green Energy', 'ETF', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'ARKK': ('ARK Innovation', 'ETF', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'SHV': ('iShares Short Treasury Bond', 'ETF', 'Renta fija', 'EE.UU.', 'Conservador', 'USD'),
    'SGOV': ('iShares 0-3 Month Treasury Bond', 'ETF', 'Renta fija', 'EE.UU.', 'Conservador', 'USD'),
    'BIL': ('SPDR 1-3 Month T-Bill', 'ETF', 'Renta fija', 'EE.UU.', 'Conservador', 'USD'),
    'SHY': ('iShares 1-3 Year Treasury Bond', 'ETF', 'Renta fija', 'EE.UU.', 'Conservador', 'USD'),
    'IEF': ('iShares 7-10 Year Treasury Bond', 'ETF', 'Renta fija', 'EE.UU.', 'Moderado', 'USD'),
    'TLT': ('iShares 20+ Year Treasury Bond', 'ETF', 'Renta fija', 'EE.UU.', 'Moderado', 'USD'),
    'BND': ('Vanguard Total Bond Market', 'ETF', 'Renta fija', 'EE.UU.', 'Conservador', 'USD'),
    'AGG': ('iShares Core US Aggregate Bond', 'ETF', 'Renta fija', 'EE.UU.', 'Conservador', 'USD'),
    'VNQ': ('Vanguard Real Estate', 'ETF', 'Bienes raíces', 'EE.UU.', 'Moderado', 'USD'),
    'GLD': ('SPDR Gold Shares', 'ETF', 'Alternativos', 'Global', 'Moderado', 'USD'),
    'IAU': ('iShares Gold Trust', 'ETF', 'Alternativos', 'Global', 'Moderado', 'USD'),
    # Acciones de EE.UU. (SIC)
    'AAPL': ('Apple', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'MSFT': ('Microsoft', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'GOOGL': ('Alphabet', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'GOOG': ('Alphabet', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'AMZN': ('Amazon', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'META': ('Meta Platforms', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'NVDA': ('NVIDIA', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'TSLA': ('Tesla', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'IBM': ('IBM', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'PINS': ('Pinterest', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'WORK': ('Slack (fusionada con Salesforce)', 'Acción individual', 'Renta variable', 'EE.UU.', 'Agresivo', 'USD'),
    'KO': ('Coca-Cola', 'Acción individual', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    'JNJ': ('Johnson & Johnson', 'Acción individual', 'Renta variable', 'EE.UU.', 'Moderado', 'USD'),
    # FIBRAs (BMV)
    'FUNO': ('Fibra Uno', 'FIBRA', 'Bienes raíces', 'México', 'Moderado', 'MXN'),
    'FIBRAPL': ('Fibra Prologis', 'FIBRA', 'Bienes raíces', 'México', 'Moderado', 'MXN'),
    'FMTY': ('Fibra Mty', 'FIBRA', 'Bienes raíces', 'México', 'Moderado', 'MXN'),
    'FIHO': ('Fibra Hotel', 'FIBRA', 'Bienes raíces', 'México', 'Moderado', 'MXN'),
    'DANHOS': ('Fibra Danhos', 'FIBRA', 'Bienes raíces', 'México', 'Moderado', 'MXN'),
    'FIBRAMQ': ('Fibra Macquarie', 'FIBRA', 'Bienes raíces', 'México', 'Moderado', 'MXN'),
    'TERRA': ('Fibra Terrafina', 'FIBRA', 'Bienes raíces', 'México', 'Moderado', 'MXN'),
    'FINN': ('Fibra Inn', 'FIBRA', 'Bienes raíces', 'México', 'Agresivo', 'MXN'),
    'FSHOP': ('Fibra Shop', 'FIBRA', 'Bienes raíces', 'México', 'Agresivo', 'MXN'),
    'FNOVA': ('Fibra Nova', 'FIBRA', 'Bienes raíces', 'México', 'Moderado', 'MXN'),
    # Acciones mexicanas (BMV)
    'BIMBO': ('Grupo Bimbo', 'Acción individual', 'Renta variable', 'México', 'Agresivo', 'MXN'),
    'WALMEX': ('Walmart de México', 'Acción individual', 'Renta variable', 'México', 'Moderado', 'MXN'),
    'AMX': ('América Móvil', 'Acción individual', 'Renta variable', 'México', 'Moderado', 'MXN'),
    'GFNORTE': ('Banorte', 'Acción individual', 'Renta variable', 'México', 'Agresivo', 'MXN'),
    'FEMSA': ('FEMSA', 'Acción individual', 'Renta variable', 'México', 'Moderado', 'MXN'),
    'CEMEX': ('Cemex', 'Acción individual', 'Renta variable', 'México', 'Agresivo', 'MXN'),
    # ETFs listados en México
    'NAFTRAC': ('iShares NAFTRAC (S&P/BMV IPC)', 'ETF', 'Renta variable', 'México', 'Moderado', 'MXN'),
    # Fondos de GBM
    'GBMF2': ('GBM Fondo de Deuda (corto plazo)', 'Fondo de inversión', 'Renta fija', 'México', 'Conservador', 'MXN'),
    'GBMF3': ('GBM Fondo de Deuda', 'Fondo de inversión', 'Renta fija', 'México', 'Conservador', 'MXN'),
    'GBMINT': ('GBM Fondo de renta variable internacional', 'Fondo de inversión', 'Renta variable', 'Global', 'Moderado', 'MXN'),
}


def suggest(ticker, info):
    """info: {'section': 'SIC'|'BMV'|'fondo_deuda'|..., 'serie': ...}. Devuelve un dict con la sugerencia."""
    if ticker in KNOWN:
        name, tipo, clase, region, riesgo, mon = KNOWN[ticker]
        return {'nombre': name, 'tipo': tipo, 'clase': clase, 'region': region, 'riesgo': riesgo, 'moneda': mon}
    section, serie = info.get('section', ''), str(info.get('serie', ''))
    if section == 'SIC':
        return {'nombre': ticker, 'tipo': 'Acción individual', 'clase': 'Renta variable', 'region': 'EE.UU.', 'riesgo': 'Agresivo', 'moneda': 'USD'}
    if section == 'fondo_deuda':
        return {'nombre': ticker, 'tipo': 'Fondo de inversión', 'clase': 'Renta fija', 'region': 'México', 'riesgo': 'Conservador', 'moneda': 'MXN'}
    if section.startswith('fondo'):
        return {'nombre': ticker, 'tipo': 'Fondo de inversión', 'clase': 'Renta variable', 'region': 'México', 'riesgo': 'Moderado', 'moneda': 'MXN'}
    if section == 'deuda':
        return {'nombre': ticker, 'tipo': 'Deuda / bonos', 'clase': 'Renta fija', 'region': 'México', 'riesgo': 'Conservador', 'moneda': 'MXN'}
    # BMV: las FIBRAs cotizan CBFIs con serie numérica (11, 12, 13, 14, 18...) y suelen empezar con F
    if serie.isdigit() and (ticker.startswith('F') or ticker in ('DANHOS', 'TERRA')):
        return {'nombre': ticker, 'tipo': 'FIBRA', 'clase': 'Bienes raíces', 'region': 'México', 'riesgo': 'Moderado', 'moneda': 'MXN'}
    return {'nombre': ticker, 'tipo': 'Acción individual', 'clase': 'Renta variable', 'region': 'México', 'riesgo': 'Agresivo', 'moneda': 'MXN'}
