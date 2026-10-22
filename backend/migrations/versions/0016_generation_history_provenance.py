"""Music / sound-effect takes: provenance on generation_history

Revision ID: 0016_generation_history_provenance
Revises: 0015_voice_sync_prep
Create Date: 2026-10-22 00:00:00.000000

Adds ``generation_history.provenance TEXT DEFAULT NULL`` — the JSON record of the
model, exact weight revision, licence class, declared use, quality profile and
parameters behind a music or sound-effect take (``mode`` = ``music`` / ``sfx``).
Rows written before this column stay NULL and are shown as "not recorded":
nothing is inferred about their permitted use.

Additive + idempotent (guarded by PRAGMA table_info, matching 0013), so a fresh
install whose ``_BASE_SCHEMA`` already declares the column is a no-op. The same
column is mirrored into ``core/db.py::_BASE_SCHEMA`` and healed by
``_reconcile_additive_columns`` where alembic cannot run.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016_generation_history_provenance"
down_revision: Union[str, None] = "0015_voice_sync_prep"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    rows = bind.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    row = bind.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
        {"n": name},
    ).fetchone()
    return row is not None


def upgrade() -> None:
    if not _has_table("generation_history"):
        return
    if not _has_column("generation_history", "provenance"):
        op.add_column(
            "generation_history",
            sa.Column("provenance", sa.Text(), nullable=True, server_default=None),
        )


def downgrade() -> None:
    if _has_table("generation_history") and _has_column("generation_history", "provenance"):
        op.drop_column("generation_history", "provenance")
