"""generation_history.provenance: old databases upgrade without touching rows."""
import importlib
import os
import sqlite3

_PREVIOUS = "0015_voice_sync_prep"

_OLD_HISTORY = """
    CREATE TABLE generation_history (
        id TEXT PRIMARY KEY, text TEXT, mode TEXT, language TEXT, instruct TEXT,
        profile_id TEXT, audio_path TEXT, duration_seconds REAL, generation_time REAL,
        seed INTEGER DEFAULT NULL, starred INTEGER DEFAULT 0,
        design_recipe TEXT DEFAULT NULL, created_at REAL
    );
"""


def _alembic(name, db_path, target):
    from alembic import command
    from alembic.config import Config

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = Config(os.path.join(root, "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    getattr(command, name)(cfg, target)


def _cols(path):
    with sqlite3.connect(str(path)) as conn:
        return {r[1] for r in conn.execute("PRAGMA table_info(generation_history)")}


def _old_db(path):
    with sqlite3.connect(str(path)) as conn:
        conn.executescript(_OLD_HISTORY)
        conn.execute("INSERT INTO generation_history (id, text, mode, audio_path, created_at) "
                     "VALUES ('old1', 'hello', 'design', 'old1.wav', 1.0)")
    _alembic("stamp", path, _PREVIOUS)


def test_upgrade_adds_column_and_keeps_old_rows_null(tmp_path):
    db = tmp_path / "user.db"
    _old_db(db)
    _alembic("upgrade", db, "head")
    assert "provenance" in _cols(db)
    with sqlite3.connect(str(db)) as conn:
        assert conn.execute("SELECT text, provenance FROM generation_history WHERE id='old1'").fetchone() == ("hello", None)


def test_idempotent_on_fresh_install_and_converges_with_base_schema(tmp_path):
    base = importlib.import_module("core.db")._BASE_SCHEMA
    fresh = tmp_path / "fresh.db"
    with sqlite3.connect(str(fresh)) as conn:
        conn.executescript(base)
    _alembic("stamp", fresh, _PREVIOUS)
    _alembic("upgrade", fresh, "head")
    migrated = tmp_path / "migrated.db"
    _old_db(migrated)
    _alembic("upgrade", migrated, "head")
    assert _cols(fresh) == _cols(migrated)


def test_downgrade_drops_the_column(tmp_path):
    db = tmp_path / "user.db"
    _old_db(db)
    _alembic("upgrade", db, "head")
    _alembic("downgrade", db, _PREVIOUS)
    assert "provenance" not in _cols(db)


def test_db_without_alembic_self_heals(tmp_path, monkeypatch):
    core_db = importlib.import_module("core.db")
    db = tmp_path / "user.db"
    with sqlite3.connect(str(db)) as conn:
        conn.executescript(_OLD_HISTORY)
    conn = sqlite3.connect(str(db))
    core_db._reconcile_additive_columns(conn)
    conn.commit()
    conn.close()
    assert "provenance" in _cols(db)
