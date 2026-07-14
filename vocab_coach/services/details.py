import json

from fsrs import Card
from sqlalchemy import select
from sqlalchemy.orm import Session

from vocab_coach.models import FsrsState, Review, VocabCard
from vocab_coach.schemas import FsrsStateOut, ReviewOut, VocabularyDetail
from vocab_coach.services.common import (
    examples_from_json,
    from_timestamp,
    normalize_word,
    utc_now,
)
from vocab_coach.services.scheduler import build_scheduler, get_active_config


def get_vocabulary_detail(
    db: Session, word: str, *, history_limit: int = 50
) -> VocabularyDetail | None:
    vocab = db.scalar(
        select(VocabCard).where(VocabCard.normalized_word == normalize_word(word))
    )
    if vocab is None:
        return None

    state = db.get(FsrsState, vocab.id)
    fsrs_state = None
    if state is not None:
        config = get_active_config(db)
        scheduler_card = json.loads(state.fsrs_card_json)
        retrievability = build_scheduler(config).get_card_retrievability(
            Card.from_json(state.fsrs_card_json), utc_now()
        )
        fsrs_state = FsrsStateOut(
            due_at=from_timestamp(state.due_at),
            last_reviewed_at=(
                from_timestamp(state.last_reviewed_at) if state.last_reviewed_at is not None else None
            ),
            stability=state.stability,
            difficulty=state.difficulty,
            review_count=state.review_count,
            lapse_count=state.lapse_count,
            retrievability=retrievability,
            scheduler_card=scheduler_card,
        )

    reviews = db.scalars(
        select(Review)
        .where(Review.card_id == vocab.id)
        .order_by(Review.reviewed_at.desc(), Review.id.desc())
        .limit(history_limit)
    ).all()
    return VocabularyDetail(
        id=vocab.id,
        word=vocab.word,
        normalized_word=vocab.normalized_word,
        translation=vocab.translation,
        origin_translation=vocab.origin_translation,
        phonetic_us=vocab.phonetic_us,
        phonetic_uk=vocab.phonetic_uk,
        examples=examples_from_json(vocab.examples_json),
        status=vocab.status,
        created_at=from_timestamp(vocab.created_at),
        updated_at=from_timestamp(vocab.updated_at),
        fsrs_state=fsrs_state,
        reviews=[
            ReviewOut(
                id=review.id,
                grade=review.grade,
                reviewed_at=from_timestamp(review.reviewed_at),
                retrievability_before=review.retrievability_before,
                retrievability_after=review.retrievability_after,
                stability_before=review.stability_before,
                stability_after=review.stability_after,
                difficulty_before=review.difficulty_before,
                difficulty_after=review.difficulty_after,
                due_at_before=(
                    from_timestamp(review.due_at_before) if review.due_at_before is not None else None
                ),
                due_at_after=from_timestamp(review.due_at_after),
                elapsed_days=review.elapsed_days,
                scheduled_days=review.scheduled_days,
                was_new=review.was_new,
                fsrs_config_id=review.fsrs_config_id,
            )
            for review in reviews
        ],
    )
