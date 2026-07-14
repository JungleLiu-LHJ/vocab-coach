import json
from datetime import datetime, timezone

from vocab_coach.models import VocabCard
from vocab_coach.schemas import ExampleSentence, VocabularyOut


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_timestamp(value: datetime) -> int:
    return int(value.timestamp())


def from_timestamp(value: int) -> datetime:
    return datetime.fromtimestamp(value, tz=timezone.utc)


def normalize_word(word: str) -> str:
    return " ".join(word.strip().casefold().split())


def examples_from_json(value: str) -> list[ExampleSentence]:
    data = json.loads(value)
    if not isinstance(data, list):
        return []
    examples: list[ExampleSentence] = []
    for item in data:
        if isinstance(item, str):
            examples.append(ExampleSentence(sentence=item, translation=""))
        elif isinstance(item, dict):
            examples.append(ExampleSentence.model_validate(item))
    return examples


def vocab_to_schema(card: VocabCard) -> VocabularyOut:
    return VocabularyOut(
        id=card.id,
        word=card.word,
        translation=card.translation,
        origin_translation=card.origin_translation,
        phonetic_us=card.phonetic_us,
        phonetic_uk=card.phonetic_uk,
        examples=examples_from_json(card.examples_json),
        status=card.status,
        created_at=from_timestamp(card.created_at),
    )
