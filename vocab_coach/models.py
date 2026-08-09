import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vocab_coach.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class VocabCard(Base):
    __tablename__ = "vocab_cards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    word: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_word: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    translation: Mapped[str] = mapped_column(Text, nullable=False)
    origin_translation: Mapped[str] = mapped_column(Text, nullable=False)
    phonetic_us: Mapped[str | None] = mapped_column(String(100))
    phonetic_uk: Mapped[str | None] = mapped_column(String(100))
    examples_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="new", index=True)
    created_at: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    updated_at: Mapped[int] = mapped_column(Integer, nullable=False)

    fsrs_state: Mapped["FsrsState | None"] = relationship(
        back_populates="card", uselist=False, cascade="all, delete-orphan"
    )


class FsrsState(Base):
    __tablename__ = "fsrs_states"

    card_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vocab_cards.id", ondelete="CASCADE"), primary_key=True
    )
    fsrs_card_json: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    stability: Mapped[float | None] = mapped_column(Float)
    difficulty: Mapped[float | None] = mapped_column(Float)
    last_reviewed_at: Mapped[int | None] = mapped_column(Integer)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lapse_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    card: Mapped[VocabCard] = relationship(back_populates="fsrs_state")


class FsrsConfig(Base):
    __tablename__ = "fsrs_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="default")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    weights_json: Mapped[str] = mapped_column(Text, nullable=False)
    target_retention: Mapped[float] = mapped_column(Float, nullable=False, default=0.9)
    maximum_interval: Mapped[int] = mapped_column(Integer, nullable=False, default=36500)
    learning_steps_json: Mapped[str | None] = mapped_column(Text)
    fsrs_version: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[int] = mapped_column(Integer, nullable=False)


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    card_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vocab_cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    word: Mapped[str] = mapped_column(String(255), nullable=False)
    grade: Mapped[str] = mapped_column(String(16), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    reviewed_at: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    retrievability_before: Mapped[float | None] = mapped_column(Float)
    retrievability_after: Mapped[float | None] = mapped_column(Float)
    stability_before: Mapped[float | None] = mapped_column(Float)
    stability_after: Mapped[float | None] = mapped_column(Float)
    difficulty_before: Mapped[float | None] = mapped_column(Float)
    difficulty_after: Mapped[float | None] = mapped_column(Float)
    due_at_before: Mapped[int | None] = mapped_column(Integer)
    due_at_after: Mapped[int] = mapped_column(Integer, nullable=False)
    elapsed_days: Mapped[int] = mapped_column(Integer, nullable=False)
    scheduled_days: Mapped[int] = mapped_column(Integer, nullable=False)
    fsrs_config_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("fsrs_configs.id"), nullable=False
    )
    was_new: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[int] = mapped_column(Integer, nullable=False)


Index("ix_reviews_reviewed_grade", Review.reviewed_at, Review.grade)
