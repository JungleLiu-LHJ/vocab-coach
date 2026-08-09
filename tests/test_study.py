from datetime import datetime, timedelta, timezone

import pytest
from fsrs import Card
from sqlalchemy import func, select

from vocab_coach.models import FsrsState, Review, VocabCard
from vocab_coach.schemas import VocabularyCreate
from vocab_coach.services.study import (
    StaleReviewError,
    fetch_session_cards,
    review_card,
    status_for_stability,
)
from vocab_coach.services.vocabulary import create_vocabulary


def make_vocab(db, word: str, created_at: int) -> VocabCard:
    card = create_vocabulary(
        db,
        VocabularyCreate(
            word=word,
            translation=f"{word} 中文",
            origin_translation=f"Definition of {word}",
            phonetic_us="/test/",
            phonetic_uk="/test/",
            examples=[
                {
                    "sentence": f"This sentence contains {word}.",
                    "translation": f"这个句子包含 {word}。",
                }
            ],
        ),
    )
    card.created_at = created_at
    db.commit()
    return card


def make_due_state(db, vocab: VocabCard, due: datetime) -> None:
    card = Card(due=due, stability=10.0, difficulty=5.0, last_review=due - timedelta(days=10))
    db.add(
        FsrsState(
            card_id=vocab.id,
            fsrs_card_json=card.to_json(),
            due_at=int(due.timestamp()),
            stability=10.0,
            difficulty=5.0,
            last_reviewed_at=int((due - timedelta(days=10)).timestamp()),
            review_count=1,
            lapse_count=0,
        )
    )
    db.commit()


def test_session_order_matches_three_bucket_rule(db):
    now = datetime(2026, 7, 13, 8, tzinfo=timezone.utc)
    recent_1 = make_vocab(db, "recent-one", 1)
    recent_5 = make_vocab(db, "recent-five", 1)
    old_8 = make_vocab(db, "old-eight", 1)
    old_10 = make_vocab(db, "old-ten", 1)
    newest = make_vocab(db, "newest", 100)
    make_due_state(db, recent_1, now - timedelta(days=1))
    make_due_state(db, recent_5, now - timedelta(days=5))
    make_due_state(db, old_8, now - timedelta(days=8))
    make_due_state(db, old_10, now - timedelta(days=10))

    result = fetch_session_cards(db, 5, now=now)

    assert [card.word for card in result.cards] == [
        "recent-one",
        "recent-five",
        "old-ten",
        "old-eight",
        newest.word,
    ]
    assert result.cards[-1].kind == "new"
    assert result.cards[-1].translation == "newest 中文"
    assert result.cards[-1].examples[0].translation == "这个句子包含 newest。"
    assert all(card.translation is None for card in result.cards[:-1])


def test_again_creates_state_log_and_feedback_atomically(db):
    vocab = make_vocab(db, "resilient", 1)
    now = datetime(2026, 7, 13, 8, tzinfo=timezone.utc)

    result = review_card(db, vocab.id, "again", now=now, enable_fuzzing=False)

    state = db.get(FsrsState, vocab.id)
    log = db.scalar(select(Review).where(Review.card_id == vocab.id))
    assert state is not None
    assert state.review_count == 1
    assert state.lapse_count == 1
    assert log is not None and log.grade == "again" and log.was_new is True
    assert result.feedback_card is not None
    assert result.feedback_card.translation == "resilient 中文"
    assert result.next_due_at > now
    assert 0 <= result.retrievability <= 1
    assert db.get(VocabCard, vocab.id).status == "learning"


def test_rating_and_maturity_mapping():
    assert status_for_stability(None) == "learning"
    assert status_for_stability(90) == "learning"
    assert status_for_stability(90.01) == "mature"


def test_known_new_word_is_scheduled_later_than_unknown_word(db):
    known = make_vocab(db, "known-word", 2)
    unknown = make_vocab(db, "unknown-word", 1)
    now = datetime(2026, 7, 13, 8, tzinfo=timezone.utc)

    known_result = review_card(db, known.id, "easy", now=now, enable_fuzzing=False)
    unknown_result = review_card(db, unknown.id, "again", now=now, enable_fuzzing=False)

    assert known_result.next_due_at > unknown_result.next_due_at


def test_review_front_hides_chinese_and_response_reveals_it(db):
    vocab = make_vocab(db, "concealed", 1)
    now = datetime(2026, 7, 13, 8, tzinfo=timezone.utc)
    make_due_state(db, vocab, now - timedelta(days=1))

    front = fetch_session_cards(db, 1, now=now).cards[0]

    assert front.kind == "review"
    assert front.translation is None
    assert front.review_count == 1
    assert front.examples[0].translation == ""

    result = review_card(
        db,
        vocab.id,
        "good",
        now=now,
        enable_fuzzing=False,
        request_id="reveal-once",
        expected_review_count=1,
    )
    assert result.revealed_answer.translation == "concealed 中文"
    assert result.revealed_answer.examples[0].translation == "这个句子包含 concealed。"


def test_review_request_is_idempotent_and_rejects_stale_version(db):
    vocab = make_vocab(db, "idempotent", 1)
    now = datetime(2026, 7, 13, 8, tzinfo=timezone.utc)

    first = review_card(
        db,
        vocab.id,
        "easy",
        now=now,
        enable_fuzzing=False,
        request_id="same-request",
        expected_review_count=0,
    )
    repeated = review_card(
        db,
        vocab.id,
        "easy",
        now=now,
        enable_fuzzing=False,
        request_id="same-request",
        expected_review_count=0,
    )

    assert repeated == first
    assert db.scalar(select(func.count(Review.id))) == 1

    with pytest.raises(StaleReviewError):
        review_card(
            db,
            vocab.id,
            "good",
            now=now,
            enable_fuzzing=False,
            request_id="stale-request",
            expected_review_count=0,
        )


@pytest.mark.parametrize("grade", ["easy", "good", "hard", "again"])
def test_all_agent_grades_use_fsrs_and_reveal_answer(db, grade):
    vocab = make_vocab(db, f"grade-{grade}", 1)
    now = datetime(2026, 7, 13, 8, tzinfo=timezone.utc)

    result = review_card(
        db,
        vocab.id,
        grade,
        now=now,
        enable_fuzzing=False,
        request_id=f"request-{grade}",
        expected_review_count=0,
    )

    assert result.grade == grade
    assert result.revealed_answer.translation == f"grade-{grade} 中文"
    assert db.get(FsrsState, vocab.id).review_count == 1
