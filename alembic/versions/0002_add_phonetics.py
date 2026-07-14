"""Add American and British IPA fields.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("vocab_cards", sa.Column("phonetic_us", sa.String(length=100), nullable=True))
    op.add_column("vocab_cards", sa.Column("phonetic_uk", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("vocab_cards", "phonetic_uk")
    op.drop_column("vocab_cards", "phonetic_us")
