"""Prompt para IA y validación/importación de su respuesta."""
import json

import pytest

from gbm_dashboard import ai, known, paths

INSTRUMENTS = {'VOO': {'serie': '*', 'section': 'SIC'}, 'FMTY': {'serie': '14', 'section': 'BMV'}}


def test_prompt_lists_tickers_and_allowed_values():
    prompt = ai.build_prompt(INSTRUMENTS, {'FMTY': {'nombre': 'Fibra Mty'}})
    assert '- VOO (serie *, SIC' in prompt and '- FMTY (serie 14, BMV' in prompt and '"Fibra Mty"' in prompt
    for value in known.TIPOS + known.REGIONES + ai.FRECUENCIAS:
        assert value in prompt
    assert '"meses_pago": [3, 6, 9, 12]' in prompt
    # el ejemplo dentro del prompt es JSON válido y pasa la validación
    example = ai.extract_json(prompt[prompt.index('{'):prompt.index('Reglas:')])
    clean, _ = ai.validate(example, ['VOO'])
    assert clean['VOO']['dividendos']['meses_pago'] == [3, 6, 9, 12]


def test_extract_json_with_fences_and_prose():
    reply = 'Claro, aquí está:\n```json\n{"instruments": {"VOO": {"tipo": "ETF"}}}\n```\nSaludos'
    assert ai.extract_json(reply) == {'instruments': {'VOO': {'tipo': 'ETF'}}}


def test_validate_keeps_only_allowed_values():
    reply = {'instrumentos': {
        'voo': {'tipo': 'ETF', 'moneda': 'Dólar', 'riesgo': 'Moderado', 'dividendos': {'frecuencia': 'trimestral', 'meses_pago': [12, 3, 3, 13, 'x'], 'yield_anual_aprox': 1.3}, 'confianza': 'alta'},
        'FMTY': {'tipo': 'REIT', 'clase': 'Bienes raíces', 'dividendos': {'frecuencia': 'cada rato', 'meses_pago': [1, 4, 7, 10]}},
        'ZZZZ': {'tipo': 'ETF'},
    }}
    clean, warnings = ai.validate(reply, ['VOO', 'FMTY'])
    assert clean['VOO'] == {'tipo': 'ETF', 'riesgo': 'Moderado', 'confianza': 'alta',
                            'dividendos': {'frecuencia': 'trimestral', 'meses_pago': [3, 12], 'yield_anual_aprox': 0.013}}
    assert clean['FMTY'] == {'clase': 'Bienes raíces', 'dividendos': {'meses_pago': [1, 4, 7, 10]}}
    text = ' '.join(warnings)
    assert 'moneda "Dólar"' in text and 'tipo "REIT"' in text and 'ZZZZ' in text


def test_import_reply_merges_into_instruments_json(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'PORTFOLIO', tmp_path / 'portfolio.json')
    monkeypatch.setattr(paths, 'INSTRUMENTS', tmp_path / 'instruments.json')
    paths.PORTFOLIO.write_text(json.dumps({'instruments': INSTRUMENTS}))
    paths.INSTRUMENTS.write_text(json.dumps({'instruments': {'VOO': {**known.suggest('VOO', {}), 'riesgo': 'Agresivo'}}, 'aliases': {'OCLN': 'QCLN'}}))
    reply = tmp_path / 'reply.json'
    reply.write_text('```json\n' + json.dumps({'instruments': {'FMTY': {'tipo': 'FIBRA', 'dividendos': {'frecuencia': 'trimestral', 'meses_pago': [2, 5, 8, 11]}}}}) + '\n```')
    ai.import_reply(str(reply))
    saved = json.loads(paths.INSTRUMENTS.read_text())
    assert saved['instruments']['VOO']['riesgo'] == 'Agresivo'                  # lo que no vino en la respuesta se conserva
    assert saved['instruments']['FMTY']['tipo'] == 'FIBRA'
    assert saved['instruments']['FMTY']['moneda'] == 'MXN'                       # completado con la sugerencia
    assert saved['instruments']['FMTY']['dividendos']['meses_pago'] == [2, 5, 8, 11]
    assert saved['aliases'] == {'OCLN': 'QCLN'}


def test_invalid_json_is_reported(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'PORTFOLIO', tmp_path / 'portfolio.json')
    monkeypatch.setattr(paths, 'INSTRUMENTS', tmp_path / 'instruments.json')
    paths.PORTFOLIO.write_text(json.dumps({'instruments': INSTRUMENTS}))
    reply = tmp_path / 'reply.txt'
    reply.write_text('{"instruments": {"VOO": ')
    with pytest.raises(SystemExit, match='JSON'):
        ai.import_reply(str(reply))
