import json

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vocab_coach.models import VocabCard
from vocab_coach.schemas import VocabularyCreate, VocabularyDraft, VocabularyOut
from vocab_coach.services.common import normalize_word, to_timestamp, utc_now, vocab_to_schema


class DuplicateWordError(ValueError):
    pass


def create_vocabulary(db: Session, payload: VocabularyCreate, *, commit: bool = True) -> VocabCard:
    normalized = normalize_word(payload.word)
    existing = db.scalar(select(VocabCard.id).where(VocabCard.normalized_word == normalized))
    if existing:
        raise DuplicateWordError(f'Word "{payload.word}" already exists')

    if (
        not payload.translation.strip()
        or not payload.origin_translation.strip()
        or not payload.phonetic_us
        or not payload.phonetic_uk
        or not payload.examples
        or any(not example.translation for example in payload.examples)
    ):
        raise ValueError(
            "translations, American/British phonetics, and translated examples are required"
        )

    now = to_timestamp(utc_now())
    card = VocabCard(
        word=payload.word.strip(),
        normalized_word=normalized,
        translation=payload.translation.strip(),
        origin_translation=payload.origin_translation.strip(),
        phonetic_us=payload.phonetic_us,
        phonetic_uk=payload.phonetic_uk,
        examples_json=json.dumps(
            [example.model_dump() for example in payload.examples], ensure_ascii=False
        ),
        status="new",
        created_at=now,
        updated_at=now,
    )
    db.add(card)
    if commit:
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise DuplicateWordError(f'Word "{payload.word}" already exists') from exc
        db.refresh(card)
    else:
        db.flush()
    return card


def create_many_vocabulary(db: Session, payloads: list[VocabularyCreate]) -> list[VocabularyOut]:
    cards: list[VocabCard] = []
    try:
        for payload in payloads:
            cards.append(create_vocabulary(db, payload, commit=False))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return [vocab_to_schema(card) for card in cards]


def update_vocabulary_content(
    db: Session, card: VocabCard, payload: VocabularyDraft
) -> VocabCard:
    if (
        not payload.translation
        or not payload.origin_translation
        or not payload.phonetic_us
        or not payload.phonetic_uk
        or not payload.examples
        or any(not example.translation for example in payload.examples)
    ):
        raise ValueError("Enriched vocabulary content is incomplete")
    card.translation = payload.translation
    card.origin_translation = payload.origin_translation
    card.phonetic_us = payload.phonetic_us
    card.phonetic_uk = payload.phonetic_uk
    card.examples_json = json.dumps(
        [example.model_dump() for example in payload.examples], ensure_ascii=False
    )
    card.updated_at = to_timestamp(utc_now())
    db.commit()
    db.refresh(card)
    return card
