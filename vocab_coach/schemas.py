from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


Grade = Literal["again", "hard", "good", "easy"]


class ExampleSentence(BaseModel):
    sentence: str = Field(min_length=1)
    translation: str = ""

    @field_validator("sentence", "translation")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return value.strip()


class VocabularyDraft(BaseModel):
    word: str = Field(min_length=1, max_length=255)
    translation: str | None = None
    origin_translation: str | None = None
    phonetic_us: str | None = Field(default=None, max_length=100)
    phonetic_uk: str | None = Field(default=None, max_length=100)
    examples: list[ExampleSentence] = Field(default_factory=list)

    @field_validator("word")
    @classmethod
    def clean_word(cls, value: str) -> str:
        value = " ".join(value.strip().split())
        if not value:
            raise ValueError("word cannot be blank")
        return value

    @field_validator("translation", "origin_translation", "phonetic_us", "phonetic_uk")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("examples")
    @classmethod
    def clean_examples(cls, values: list[ExampleSentence]) -> list[ExampleSentence]:
        unique: dict[str, ExampleSentence] = {}
        for value in values:
            unique.setdefault(value.sentence.casefold(), value)
        return list(unique.values())


class VocabularyCreate(VocabularyDraft):
    translation: str = Field(min_length=1)
    origin_translation: str = Field(min_length=1)
    phonetic_us: str = Field(min_length=1, max_length=100)
    phonetic_uk: str = Field(min_length=1, max_length=100)
    examples: list[ExampleSentence] = Field(min_length=1)

    @model_validator(mode="after")
    def require_complete_examples(self) -> "VocabularyCreate":
        if any(not example.translation for example in self.examples):
            raise ValueError("every example sentence requires a Chinese translation")
        return self


class VocabularyOut(BaseModel):
    id: str
    word: str
    translation: str
    origin_translation: str
    phonetic_us: str | None = None
    phonetic_uk: str | None = None
    examples: list[ExampleSentence]
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FsrsStateOut(BaseModel):
    due_at: datetime
    last_reviewed_at: datetime | None = None
    stability: float | None = None
    difficulty: float | None = None
    review_count: int
    lapse_count: int
    retrievability: float
    scheduler_card: dict[str, Any]


class ReviewOut(BaseModel):
    id: int
    grade: Grade
    reviewed_at: datetime
    retrievability_before: float | None = None
    retrievability_after: float | None = None
    stability_before: float | None = None
    stability_after: float | None = None
    difficulty_before: float | None = None
    difficulty_after: float | None = None
    due_at_before: datetime | None = None
    due_at_after: datetime
    elapsed_days: int
    scheduled_days: int
    was_new: bool
    fsrs_config_id: int


class VocabularyDetail(VocabularyOut):
    normalized_word: str
    updated_at: datetime
    fsrs_state: FsrsStateOut | None = None
    reviews: list[ReviewOut]


class SessionCard(BaseModel):
    id: str
    kind: Literal["new", "review"]
    word: str
    translation: str | None = None
    origin_translation: str
    phonetic_us: str | None = None
    phonetic_uk: str | None = None
    examples: list[ExampleSentence]
    retrievability: float | None = None
    review_count: int = 0


class SessionCardsResponse(BaseModel):
    cards: list[SessionCard]
    requested_count: int


class ReviewRequest(BaseModel):
    grade: Grade
    request_id: str | None = Field(default=None, min_length=1, max_length=64)
    expected_review_count: int | None = Field(default=None, ge=0)


class FeedbackCard(BaseModel):
    type: Literal["translation_feedback"] = "translation_feedback"
    card_id: str
    word: str
    translation: str


class RevealedAnswer(BaseModel):
    card_id: str
    word: str
    translation: str
    examples: list[ExampleSentence]


class ReviewResponse(BaseModel):
    card_id: str
    grade: Grade
    next_due_at: datetime
    retrievability: float
    status: str
    feedback_card: FeedbackCard | None = None
    revealed_answer: RevealedAnswer


class ImportResponse(BaseModel):
    imported_count: int
    cards: list[VocabularyOut]


class TodayStats(BaseModel):
    review_count: int
    again_count: int
    new_cards_reviewed: int
    due_count: int
    new_count: int
