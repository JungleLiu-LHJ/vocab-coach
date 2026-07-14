import csv
import io
import json

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from vocab_coach.models import VocabCard
from vocab_coach.schemas import VocabularyCreate, VocabularyOut
from vocab_coach.services.common import normalize_word
from vocab_coach.services.vocabulary import create_many_vocabulary


class ImportValidationError(ValueError):
    def __init__(self, errors: list[dict]):
        self.errors = errors
        super().__init__("Import validation failed")


def _load_rows(filename: str, content: bytes) -> list[dict]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportValidationError([{"row": 0, "message": "File must be UTF-8 encoded"}]) from exc

    if filename.lower().endswith(".json"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ImportValidationError([{"row": exc.lineno, "message": "Invalid JSON"}]) from exc
        if not isinstance(data, list):
            raise ImportValidationError([{"row": 0, "message": "JSON root must be an array"}])
        return data

    if filename.lower().endswith(".csv"):
        rows = list(csv.DictReader(io.StringIO(text)))
        for index, row in enumerate(rows, start=2):
            try:
                row["examples"] = json.loads(row.get("examples") or "[]")
            except json.JSONDecodeError:
                row["examples"] = None
                row["_examples_error"] = f"Row {index}: examples must be a JSON array"
        return rows

    raise ImportValidationError([{"row": 0, "message": "Only .csv and .json files are supported"}])


def validate_and_import(db: Session, filename: str, content: bytes) -> list[VocabularyOut]:
    rows = _load_rows(filename, content)
    if not rows:
        raise ImportValidationError([{"row": 0, "message": "Import file is empty"}])

    payloads: list[VocabularyCreate] = []
    errors: list[dict] = []
    seen: dict[str, int] = {}
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            errors.append({"row": index, "message": "Each item must be an object"})
            continue
        if row.pop("_examples_error", None):
            errors.append({"row": index, "message": "examples must be a JSON array"})
            continue
        try:
            payload = VocabularyCreate.model_validate(row)
        except ValidationError as exc:
            errors.append({"row": index, "message": exc.errors(include_url=False)})
            continue
        normalized = normalize_word(payload.word)
        if normalized in seen:
            errors.append(
                {"row": index, "message": f'Duplicate word in file; first seen at row {seen[normalized]}'}
            )
        else:
            seen[normalized] = index
            payloads.append(payload)

    if seen:
        existing = set(
            db.scalars(select(VocabCard.normalized_word).where(VocabCard.normalized_word.in_(seen))).all()
        )
        for word in existing:
            errors.append({"row": seen[word], "message": "Word already exists in the database"})
    if errors:
        raise ImportValidationError(errors)
    return create_many_vocabulary(db, payloads)

