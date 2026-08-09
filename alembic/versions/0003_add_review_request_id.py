"""Add idempotency key to reviews.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("reviews") as batch_op:
        batch_op.add_column(sa.Column("request_id", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("uq_reviews_request_id", ["request_id"])


def downgrade() -> None:
    with op.batch_alter_table("reviews") as batch_op:
        batch_op.drop_constraint("uq_reviews_request_id", type_="unique")
        batch_op.drop_column("request_id")
