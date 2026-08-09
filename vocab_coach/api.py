from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from vocab_coach.config import Settings, get_settings
from vocab_coach.database import get_db
from vocab_coach.models import VocabCard
from vocab_coach.schemas import (
    ImportResponse,
    ReviewRequest,
    ReviewResponse,
    SessionCardsResponse,
    TodayStats,
    VocabularyCreate,
    VocabularyDetail,
    VocabularyDraft,
    VocabularyOut,
)
from vocab_coach.services.common import examples_from_json, normalize_word, vocab_to_schema
from vocab_coach.services.enrichment import (
    EnrichmentNotConfiguredError,
    EnrichmentResponseError,
    enrich_vocabulary,
)
from vocab_coach.services.details import get_vocabulary_detail
from vocab_coach.services.importer import ImportValidationError, validate_and_import
from vocab_coach.services.stats import get_today_stats
from vocab_coach.services.study import (
    ReviewRequestConflictError,
    StaleReviewError,
    fetch_session_cards,
    review_card,
)
from vocab_coach.services.vocabulary import (
    DuplicateWordError,
    create_vocabulary,
    update_vocabulary_content,
)


router = APIRouter(prefix="/api")
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/sessions/cards", response_model=SessionCardsResponse)
def session_cards(
    db: DbSession,
    count: Annotated[int, Query(ge=1, le=100)] = 20,
) -> SessionCardsResponse:
    return fetch_session_cards(db, count)


@router.post("/cards/{card_id}/reviews", response_model=ReviewResponse)
def submit_review(card_id: str, payload: ReviewRequest, db: DbSession) -> ReviewResponse:
    try:
        return review_card(
            db,
            card_id,
            payload.grade,
            request_id=payload.request_id,
            expected_review_count=payload.expected_review_count,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (StaleReviewError, ReviewRequestConflictError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/vocabulary/enrich", response_model=VocabularyDraft)
def enrich(
    payload: VocabularyDraft,
    settings: Annotated[Settings, Depends(get_settings)],
) -> VocabularyDraft:
    try:
        return enrich_vocabulary(payload, settings)
    except EnrichmentNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except EnrichmentResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post(
    "/vocabulary",
    response_model=VocabularyOut,
    status_code=status.HTTP_201_CREATED,
)
def add_vocabulary(payload: VocabularyCreate, db: DbSession) -> VocabularyOut:
    try:
        return vocab_to_schema(create_vocabulary(db, payload))
    except DuplicateWordError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


def _lookup_vocabulary(
    word: str, history_limit: int, db: Session
) -> VocabularyDetail:
    detail = get_vocabulary_detail(db, word, history_limit=history_limit)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'Vocabulary word "{word}" was not found',
        )
    return detail


@router.get("/vocabulary/lookup", response_model=VocabularyDetail)
def lookup_vocabulary(
    db: DbSession,
    word: Annotated[str, Query(min_length=1, max_length=255)],
    history_limit: Annotated[int, Query(ge=0, le=100)] = 50,
) -> VocabularyDetail:
    """Look up a word safely, including terms that contain slashes or spaces."""
    return _lookup_vocabulary(word, history_limit, db)


@router.post("/vocabulary/{word}/enrich-missing", response_model=VocabularyOut)
def enrich_existing_vocabulary(
    word: str,
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> VocabularyOut:
    """Explicitly fill missing phonetics and bilingual examples on an existing card."""
    card = db.scalar(
        select(VocabCard).where(VocabCard.normalized_word == normalize_word(word))
    )
    if card is None:
        raise HTTPException(status_code=404, detail=f'Vocabulary word "{word}" was not found')
    draft = VocabularyDraft(
        word=card.word,
        translation=card.translation,
        origin_translation=card.origin_translation,
        phonetic_us=card.phonetic_us,
        phonetic_uk=card.phonetic_uk,
        examples=examples_from_json(card.examples_json),
    )
    try:
        enriched = enrich_vocabulary(draft, settings)
        return vocab_to_schema(update_vocabulary_content(db, card, enriched))
    except EnrichmentNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except EnrichmentResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


@router.post(
    "/vocabulary/import",
    response_model=ImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_vocabulary(
    db: DbSession,
    file: Annotated[UploadFile, File(description="A UTF-8 CSV or JSON vocabulary file")],
) -> ImportResponse:
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Import file must be 10 MB or smaller")
    try:
        cards = validate_and_import(db, file.filename or "", content)
    except ImportValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors) from exc
    return ImportResponse(imported_count=len(cards), cards=cards)


@router.get("/stats/today", response_model=TodayStats)
def today_stats(
    db: DbSession,
    timezone_offset_minutes: Annotated[int, Query(ge=-840, le=840)] = 0,
) -> TodayStats:
    return get_today_stats(db, timezone_offset_minutes)


@router.get("/vocabulary/{word}", response_model=VocabularyDetail)
def get_vocabulary_by_word(
    word: str,
    db: DbSession,
    history_limit: Annotated[int, Query(ge=0, le=100)] = 50,
) -> VocabularyDetail:
    """Convenience endpoint for simple one-word lookups."""
    return _lookup_vocabulary(word, history_limit, db)
