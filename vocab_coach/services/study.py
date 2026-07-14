import math
import random
from datetime import datetime, timezone

from fsrs import Card
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from vocab_coach.models import FsrsState, Review, VocabCard
from vocab_coach.schemas import (
    FeedbackCard,
    ReviewResponse,
    SessionCard,
    SessionCardsResponse,
)
from vocab_coach.services.common import examples_from_json, from_timestamp, to_timestamp, utc_now
from vocab_coach.services.scheduler import RATING_BY_GRADE, build_scheduler, get_active_config


SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60


def status_for_stability(stability: float | None) -> str:
    return "mature" if (stability or 0) > 90 else "learning"


def _render_card(db: Session, vocab: VocabCard, state: FsrsState | None, now: datetime) -> SessionCard:
    examples = examples_from_json(vocab.examples_json)
    selected_examples = random.sample(examples, min(3, len(examples)))
    if state is None:
        return SessionCard(
            id=vocab.id,
            kind="new",
            word=vocab.word,
            translation=vocab.translation,
            origin_translation=vocab.origin_translation,
            phonetic_us=vocab.phonetic_us,
            phonetic_uk=vocab.phonetic_uk,
            examples=selected_examples,
        )

    config = get_active_config(db)
    scheduler = build_scheduler(config)
    fsrs_card = Card.from_json(state.fsrs_card_json)
    retrievability = scheduler.get_card_retrievability(fsrs_card, now)
    return SessionCard(
        id=vocab.id,
        kind="review",
        word=vocab.word,
        origin_translation=vocab.origin_translation,
        phonetic_us=vocab.phonetic_us,
        phonetic_uk=vocab.phonetic_uk,
        examples=selected_examples,
        retrievability=retrievability,
    )


def fetch_session_cards(
    db: Session, count: int, *, now: datetime | None = None
) -> SessionCardsResponse:
    now = now or utc_now()
    now_ts = to_timestamp(now)
    cutoff = now_ts - SEVEN_DAYS_SECONDS

    recent_stmt = (
        select(VocabCard, FsrsState)
        .join(FsrsState, FsrsState.card_id == VocabCard.id)
        .where(and_(FsrsState.due_at <= now_ts, FsrsState.due_at > cutoff))
        .order_by(FsrsState.due_at.desc())
        .limit(count)
    )
    selected = list(db.execute(recent_stmt).all())

    remaining = count - len(selected)
    if remaining:
        old_stmt = (
            select(VocabCard, FsrsState)
            .join(FsrsState, FsrsState.card_id == VocabCard.id)
            .where(FsrsState.due_at <= cutoff)
            .order_by(FsrsState.due_at.asc())
            .limit(remaining)
        )
        selected.extend(db.execute(old_stmt).all())

    remaining = count - len(selected)
    if remaining:
        new_stmt = (
            select(VocabCard)
            .outerjoin(FsrsState, FsrsState.card_id == VocabCard.id)
            .where(FsrsState.card_id.is_(None))
            .order_by(VocabCard.created_at.desc(), func.random())
            .limit(remaining)
        )
        selected.extend((vocab, None) for vocab in db.scalars(new_stmt).all())

    cards = [_render_card(db, vocab, state, now) for vocab, state in selected]
    return SessionCardsResponse(cards=cards, requested_count=count)


def review_card(
    db: Session,
    card_id: str,
    grade: str,
    *,
    now: datetime | None = None,
    enable_fuzzing: bool = True,
) -> ReviewResponse:
    now = now or utc_now()
    now = now.astimezone(timezone.utc)
    now_ts = to_timestamp(now)
    vocab = db.get(VocabCard, card_id)
    if vocab is None:
        raise LookupError("Vocabulary card not found")

    state = db.get(FsrsState, card_id)
    was_new = state is None
    config = get_active_config(db)
    scheduler = build_scheduler(config, enable_fuzzing=enable_fuzzing)
    fsrs_card = Card() if state is None else Card.from_json(state.fsrs_card_json)

    stability_before = fsrs_card.stability
    difficulty_before = fsrs_card.difficulty
    due_at_before = to_timestamp(fsrs_card.due) if state else None
    retrievability_before = None
    if state and fsrs_card.last_review and fsrs_card.stability is not None:
        retrievability_before = scheduler.get_card_retrievability(fsrs_card, now)

    previous_last_review = fsrs_card.last_review
    updated_card, _review_log = scheduler.review_card(
        fsrs_card, RATING_BY_GRADE[grade], review_datetime=now
    )
    due_at_after = to_timestamp(updated_card.due)
    retrievability_after = scheduler.get_card_retrievability(updated_card, now)
    elapsed_days = (
        max(0, math.floor((now - previous_last_review).total_seconds() / 86400))
        if previous_last_review
        else 0
    )
    scheduled_days = max(0, math.floor((updated_card.due - now).total_seconds() / 86400))

    if state is None:
        state = FsrsState(card_id=card_id, fsrs_card_json=updated_card.to_json(), due_at=due_at_after)
        db.add(state)
    state.fsrs_card_json = updated_card.to_json()
    state.due_at = due_at_after
    state.stability = updated_card.stability
    state.difficulty = updated_card.difficulty
    state.last_reviewed_at = now_ts
    state.review_count = (state.review_count or 0) + 1
    if grade == "again":
        state.lapse_count = (state.lapse_count or 0) + 1

    vocab.status = status_for_stability(updated_card.stability)
    vocab.updated_at = now_ts
    db.add(
        Review(
            card_id=card_id,
            word=vocab.word,
            grade=grade,
            reviewed_at=now_ts,
            retrievability_before=retrievability_before,
            retrievability_after=retrievability_after,
            stability_before=stability_before,
            stability_after=updated_card.stability,
            difficulty_before=difficulty_before,
            difficulty_after=updated_card.difficulty,
            due_at_before=due_at_before,
            due_at_after=due_at_after,
            elapsed_days=elapsed_days,
            scheduled_days=scheduled_days,
            fsrs_config_id=config.id,
            was_new=was_new,
            created_at=now_ts,
        )
    )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    feedback = None
    if grade == "again":
        feedback = FeedbackCard(card_id=card_id, word=vocab.word, translation=vocab.translation)
    return ReviewResponse(
        card_id=card_id,
        grade=grade,
        next_due_at=from_timestamp(due_at_after),
        retrievability=retrievability_after,
        status=vocab.status,
        feedback_card=feedback,
    )
