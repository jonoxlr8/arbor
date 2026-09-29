"""The one-time import requires six exact classes and guarded destinations."""
from types import SimpleNamespace

from app.market_data import nav_history_cli
from app.market_data.models import TOAP_FUNDS


def test_nav_import_requires_local_opt_in(monkeypatch, tmp_path):
    monkeypatch.delenv("ARBOR_LOCAL_NAV_IMPORT", raising=False)
    assert nav_history_cli.main([str(tmp_path), "--write-local"]) == 2
    assert nav_history_cli.main([str(tmp_path)]) == 2


def test_nav_import_refuses_nonlocal_target(monkeypatch, tmp_path):
    monkeypatch.setenv("ARBOR_LOCAL_NAV_IMPORT", "1")
    for key, value in nav_history_cli.LOCAL_PG.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("PGHOST", "hosted.example")
    assert nav_history_cli.main([str(tmp_path), "--write-local"]) == 2


def test_nav_import_requires_all_six_and_uses_one_transaction(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("ARBOR_LOCAL_NAV_IMPORT", "1")
    for key, value in nav_history_cli.LOCAL_PG.items():
        monkeypatch.setenv(key, value)
    assert nav_history_cli.main([str(tmp_path), "--write-local"]) == 1
    for product, name in TOAP_FUNDS.items():
        (tmp_path / f"{product}.csv").write_text(
            f"fund_name,date,navpu\n{name},2026-09-24,100.125\n", encoding="utf-8")
    calls = []
    def run(command, **kwargs):
        calls.append((command, kwargs))
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(nav_history_cli.subprocess, "run", run)
    assert nav_history_cli.main([str(tmp_path), "--write-local"]) == 0
    assert len(calls) == 1
    command, options = calls[0]
    assert command[command.index("-h") + 1] == "127.0.0.1"
    assert command[command.index("-d") + 1] == "arbor_nav_test"
    assert options["input"].startswith("begin;\n") and options["input"].endswith("commit;\n")
    assert options["input"].count("insert into public.arbor_historical_market_observations") == 1
    assert "roi" not in options["input"].lower() and "ytd" not in options["input"].lower()
    assert capsys.readouterr().out.count("source NAV observations") == 6


def test_hosted_import_requires_exact_project_opt_in(monkeypatch, tmp_path):
    monkeypatch.setenv("SUPABASE_URL", "https://known-project.supabase.co")
    assert nav_history_cli.main([str(tmp_path), "--write-hosted", "--project-ref", "known-project"]) == 2
    monkeypatch.setenv("ARBOR_HOSTED_NAV_IMPORT", "1")
    assert nav_history_cli.main([str(tmp_path), "--write-hosted", "--project-ref", "other-project"]) == 2
    assert nav_history_cli.main([str(tmp_path), "--write-hosted"]) == 2


def test_hosted_import_validates_all_files_before_shared_cache_write(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("SUPABASE_URL", "https://known-project.supabase.co")
    monkeypatch.setenv("SUPABASE_MARKET_DATA_KEY", "sb_secret_testvalue")
    monkeypatch.setenv("ARBOR_HOSTED_NAV_IMPORT", "1")
    monkeypatch.setattr(nav_history_cli, "EXPECTED_COUNTS", {product: 1 for product in TOAP_FUNDS})
    writes = []

    class FakeCache:
        def __init__(self, client, url, key):
            assert url == "https://known-project.supabase.co"
            assert key == "sb_secret_testvalue"

        def write_history(self, observations):
            writes.append(observations)

    monkeypatch.setattr(nav_history_cli, "SharedCache", FakeCache)
    args = [str(tmp_path), "--write-hosted", "--project-ref", "known-project"]
    assert nav_history_cli.main(args) == 1
    assert writes == []
    for product, name in TOAP_FUNDS.items():
        (tmp_path / f"{product}.csv").write_text(
            f"fund_name,date,navpu\n{name},2026-09-24,100.125\n", encoding="utf-8")
    assert nav_history_cli.main(args) == 0
    assert len(writes) == 1 and len(writes[0]) == 6
    assert all(item.source == "toap" and item.kind == "nav" for item in writes[0])
    assert "Total: 6" in capsys.readouterr().out
