"""The historical writer is inert without both explicit operator gates."""
import sys

from app.market_data import history_cli


def test_history_import_requires_flag_and_environment(monkeypatch, capsys):
    monkeypatch.setattr(history_cli, "load_dotenv", lambda: None)
    monkeypatch.delenv("ARBOR_HISTORICAL_CACHE_WRITE_ENABLED", raising=False)
    monkeypatch.setattr(sys, "argv", ["history_cli", "--from-day", "2026-08-18",
                                  "--to-day", "2026-08-19"])
    assert history_cli.main() == 2
    monkeypatch.setenv("ARBOR_HISTORICAL_CACHE_WRITE_ENABLED", "true")
    assert history_cli.main() == 2
    monkeypatch.setenv("ARBOR_HISTORICAL_CACHE_WRITE_ENABLED", "false")
    monkeypatch.setattr(sys, "argv", ["history_cli", "--from-day", "2026-08-18",
                                  "--to-day", "2026-08-19", "--write"])
    assert history_cli.main() == 2
    assert "requires both" in capsys.readouterr().err
