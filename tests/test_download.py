"""La descarga recorre los meses hacia atrás, se detiene sólo ante "no hay estado" confirmado y aborta ante errores."""
import json

import pytest

from gbm_dashboard import download, paths

PDF = b'spool line 1\nspool line 2\nspool line 3\n%PDF-1.4 fake'


@pytest.fixture
def env(tmp_path, monkeypatch):
    statements = tmp_path / 'statements'
    statements.mkdir()
    monkeypatch.setattr(paths, 'STATEMENTS', statements)
    monkeypatch.setattr(paths, 'CREDENTIALS', tmp_path / 'credentials.env')
    paths.CREDENTIALS.write_text('# prueba\nGBM_TOKEN="Bearer test-token"\nGBM_CONTRACT_ID=contract\nGBM_ACCOUNT_ID = account\n')
    paths.CREDENTIALS.chmod(0o600)
    for key in ('GBM_TOKEN', 'GBM_CONTRACT_ID', 'GBM_ACCOUNT_ID'):
        monkeypatch.delenv(key, raising=False)
    return statements


def fake_api(monkeypatch, available, errors=None, account='account', contract='contract'):
    """available: meses (YYYY-MM) con estado de cuenta; errors: {YYYY-MM: status}.
    GBM nombra la ruta al revés: /contracts/<GBM_ACCOUNT_ID>/accounts/<GBM_CONTRACT_ID>/."""
    calls = []

    def http_get(url, headers, timeout=30):
        if url.startswith('https://files/'):
            return 200, PDF
        if f'/contracts/{account}/accounts/{contract}/' not in url:
            return 404, b'{"message":"not found"}'
        ym = url.split('year=')[1].split('&')[0] + '-' + url.split('month=')[1].split('&')[0].zfill(2)
        calls.append(ym)
        assert headers['authorization'] == 'Bearer test-token'
        if errors and ym in errors:
            return errors[ym], b'{}'
        if ym in available:
            return 200, json.dumps({'url': f'https://files/{ym}', 'filename': 'CB_X_ABM00000.pdf'}).encode()
        return 404, b'{"message":"not found"}'

    monkeypatch.setattr(download, 'http_get', http_get)
    return calls


def test_walks_back_to_oldest_and_strips_spooler(env, monkeypatch):
    available = {'2025-12', '2025-11', '2025-10'}
    fake_api(monkeypatch, available)
    download.download(until='2026-02')
    assert sorted(path.name for path in env.iterdir()) == ['2025-10.pdf', '2025-11.pdf', '2025-12.pdf']
    assert (env / '2025-12.pdf').read_bytes().startswith(b'%PDF')


def test_unpublished_recent_months_do_not_stop_the_walk(env, monkeypatch):
    calls = fake_api(monkeypatch, {'2025-12'})
    download.download(until='2026-02', max_misses=2)
    # 2026-02 y 2026-01 sin publicar no cuentan; tras 2025-12 se detiene con 2 faltantes seguidos
    assert calls == ['2026-02', '2026-01', '2025-12', '2025-11', '2025-10']


def test_existing_files_are_skipped(env, monkeypatch):
    (env / '2025-12.pdf').write_bytes(b'%PDF existing')
    calls = fake_api(monkeypatch, {'2025-12', '2025-11'})
    download.download(until='2025-12', max_misses=1)
    assert '2025-12' not in calls
    assert (env / '2025-12.pdf').read_bytes() == b'%PDF existing'


@pytest.mark.parametrize('status', [401, 403, 429, 500])
def test_errors_abort_instead_of_looking_like_the_end(env, monkeypatch, status):
    fake_api(monkeypatch, {'2025-12', '2025-11', '2025-10'}, errors={'2025-11': status})
    with pytest.raises(SystemExit):
        download.download(until='2025-12')
    assert [path.name for path in env.iterdir()] == ['2025-12.pdf']


def test_since_limits_the_walk(env, monkeypatch):
    calls = fake_api(monkeypatch, {'2025-12', '2025-11', '2025-10', '2025-09'})
    download.download(until='2025-12', since='2025-11')
    assert calls == ['2025-12', '2025-11']


def test_credentials_file_is_kept_with_a_reminder_or_deleted(env, monkeypatch, capsys):
    fake_api(monkeypatch, {'2025-12'})
    download.download(until='2025-12', max_misses=1)
    assert paths.CREDENTIALS.exists()
    err = capsys.readouterr().err
    assert 'borra el archivo de credenciales' in err and 'test-token' not in err
    download.download(until='2025-12', max_misses=1, delete_credentials=True)
    assert not paths.CREDENTIALS.exists()


def test_credentials_are_deleted_even_when_the_download_aborts(env, monkeypatch):
    fake_api(monkeypatch, {'2025-12'}, errors={'2025-12': 401})
    with pytest.raises(SystemExit):
        download.download(until='2025-12', delete_credentials=True)
    assert not paths.CREDENTIALS.exists()


def test_environment_variables_are_not_used(env, monkeypatch):
    paths.CREDENTIALS.write_text('GBM_TOKEN=test-token\n')
    monkeypatch.setenv('GBM_CONTRACT_ID', 'contract')
    monkeypatch.setenv('GBM_ACCOUNT_ID', 'account')
    with pytest.raises(SystemExit, match='Faltan GBM_CONTRACT_ID'):
        download.download(until='2025-12')


def test_missing_credentials_file(env):
    paths.CREDENTIALS.unlink()
    with pytest.raises(SystemExit, match='credentials.example.env'):
        download.download(until='2025-12')


def test_wrong_ids_keep_the_credentials_and_explain_why(env, monkeypatch, capsys):
    fake_api(monkeypatch, set())                    # GBM no tiene nada para estos identificadores
    with pytest.raises(SystemExit) as exc:
        download.download(until='2025-12', delete_credentials=True)
    assert exc.value.code == download.KEEP_CREDENTIALS
    assert paths.CREDENTIALS.exists()
    err = capsys.readouterr().err
    assert 'No borré' in err and '--delete-credentials' in err
    assert '2025-12 HTTP 404' in err and 'test-token' not in err


def test_swapped_account_and_contract_are_fixed_at_runtime(env, monkeypatch, capsys):
    available = {'2025-12', '2025-11', '2025-10', '2025-09', '2025-08'}
    fake_api(monkeypatch, available, account='contract', contract='account')     # en el archivo vienen invertidos
    download.download(until='2026-01', max_misses=1, delete_credentials=True)
    assert sorted(path.stem for path in env.iterdir()) == sorted(available)
    assert not paths.CREDENTIALS.exists()                                        # terminó bien: sí se borra
    err = capsys.readouterr().err
    assert 'parecen estar invertidos' in err and 'Sigo con los valores intercambiados' in err
    assert 'Usé GBM_ACCOUNT_ID y GBM_CONTRACT_ID intercambiados' in err and 'test-token' not in err


def test_neither_order_works_keeps_credentials(env, monkeypatch, capsys):
    fake_api(monkeypatch, {'2025-12'}, account='otra', contract='cosa')
    with pytest.raises(SystemExit) as exc:
        download.download(until='2026-01', delete_credentials=True)
    assert exc.value.code == download.KEEP_CREDENTIALS and paths.CREDENTIALS.exists()
    assert 'invertidos' not in capsys.readouterr().err


def test_no_swap_once_any_statement_was_found(env, monkeypatch, capsys):
    calls = []
    fake_api(monkeypatch, {'2026-01'})
    original = download.statement_link
    monkeypatch.setattr(download, 'statement_link', lambda token, account, contract, year, month: (calls.append((account, contract)), original(token, account, contract, year, month))[1])
    download.download(until='2026-01', max_misses=6)
    assert set(calls) == {('account', 'contract')}            # nunca se probó el orden intercambiado
    assert 'invertidos' not in capsys.readouterr().err
