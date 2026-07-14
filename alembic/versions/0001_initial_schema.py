"""Initial vocabulary and FSRS schema.

Revision ID: 0001
Revises:
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fsrs_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("weights_json", sa.Text(), nullable=False),
        sa.Column("target_retention", sa.Float(), nullable=False),
        sa.Column("maximum_interval", sa.Integer(), nullable=False),
        sa.Column("learning_steps_json", sa.Text(), nullable=True),
        sa.Column("fsrs_version", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fsrs_configs_is_active", "fsrs_configs", ["is_active"])
    op.create_table(
        "vocab_cards",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("word", sa.String(length=255), nullable=False),
        sa.Column("normalized_word", sa.String(length=255), nullable=False),
        sa.Column("translation", sa.Text(), nullable=False),
        sa.Column("origin_translation", sa.Text(), nullable=False),
        sa.Column("examples_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vocab_cards_created_at", "vocab_cards", ["created_at"])
    op.create_index(
        "ix_vocab_cards_normalized_word", "vocab_cards", ["normalized_word"], unique=True
    )
    op.create_index("ix_vocab_cards_status", "vocab_cards", ["status"])
    op.create_table(
        "fsrs_states",
        sa.Column("card_id", sa.String(length=36), nullable=False),
        sa.Column("fsrs_card_json", sa.Text(), nullable=False),
        sa.Column("due_at", sa.Integer(), nullable=False),
        sa.Column("stability", sa.Float(), nullable=True),
        sa.Column("difficulty", sa.Float(), nullable=True),
        sa.Column("last_reviewed_at", sa.Integer(), nullable=True),
        sa.Column("review_count", sa.Integer(), nullable=False),
        sa.Column("lapse_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["vocab_cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("card_id"),
    )
    op.create_index("ix_fsrs_states_due_at", "fsrs_states", ["due_at"])
    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("card_id", sa.String(length=36), nullable=False),
        sa.Column("word", sa.String(length=255), nullable=False),
        sa.Column("grade", sa.String(length=16), nullable=False),
        sa.Column("reviewed_at", sa.Integer(), nullable=False),
        sa.Column("retrievability_before", sa.Float(), nullable=True),
        sa.Column("retrievability_after", sa.Float(), nullable=True),
        sa.Column("stability_before", sa.Float(), nullable=True),
        sa.Column("stability_after", sa.Float(), nullable=True),
        sa.Column("difficulty_before", sa.Float(), nullable=True),
        sa.Column("difficulty_after", sa.Float(), nullable=True),
        sa.Column("due_at_before", sa.Integer(), nullable=True),
        sa.Column("due_at_after", sa.Integer(), nullable=False),
        sa.Column("elapsed_days", sa.Integer(), nullable=False),
        sa.Column("scheduled_days", sa.Integer(), nullable=False),
        sa.Column("fsrs_config_id", sa.Integer(), nullable=False),
        sa.Column("was_new", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["vocab_cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fsrs_config_id"], ["fsrs_configs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reviews_card_id", "reviews", ["card_id"])
    op.create_index("ix_reviews_reviewed_at", "reviews", ["reviewed_at"])
    op.create_index("ix_reviews_reviewed_grade", "reviews", ["reviewed_at", "grade"])


def downgrade() -> None:
    op.drop_index("ix_reviews_reviewed_grade", table_name="reviews")
    op.drop_index("ix_reviews_reviewed_at", table_name="reviews")
    op.drop_index("ix_reviews_card_id", table_name="reviews")
    op.drop_table("reviews")
    op.drop_index("ix_fsrs_states_due_at", table_name="fsrs_states")
    op.drop_table("fsrs_states")
    op.drop_index("ix_vocab_cards_status", table_name="vocab_cards")
    op.drop_index("ix_vocab_cards_normalized_word", table_name="vocab_cards")
    op.drop_index("ix_vocab_cards_created_at", table_name="vocab_cards")
    op.drop_table("vocab_cards")
    op.drop_index("ix_fsrs_configs_is_active", table_name="fsrs_configs")
    op.drop_table("fsrs_configs")
