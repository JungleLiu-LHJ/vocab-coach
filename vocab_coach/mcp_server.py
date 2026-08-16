"""Local stdio MCP adapter for Hermes, OpenClaw, and other Agents."""

from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, Iterator

from pydantic import BaseModel
from sqlalchemy.orm import Session

from vocab_coach import __version__
from vocab_coach.adapters.chat import (
    render_agent_answer,
    render_agent_card,
    render_agent_empty,
)
from vocab_coach.config import Settings
from vocab_coach.database import (
    configure_database,
    get_session_factory,
    migrate_database,
)
from vocab_coach.services.details import get_vocabulary_detail
from vocab_coach.services.importer import (
    ImportValidationError,
    validate_and_import_with_report,
)
from vocab_coach.services.scheduler import ensure_default_config
from vocab_coach.services.stats import get_today_stats
from vocab_coach.services.study import (
    ReviewRequestConflictError,
    StaleReviewError,
    fetch_session_cards,
    review_card,
)

try:
    from mcp.server.fastmcp import FastMCP
except ImportError as exc:  # pragma: no cover - exercised by the CLI error path
    FastMCP = None  # type: ignore[assignment,misc]
    _MCP_IMPORT_ERROR = exc
else:
    _MCP_IMPORT_ERROR = None


def _ok(data: Any, presentation: dict[str, Any] | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "schema_version": "1",
        "status": "ok",
        "data": data,
    }
    if presentation is not None:
        result["presentation"] = presentation
    return result


def _error(error_type: str, detail: str) -> dict[str, Any]:
    return {
        "schema_version": "1",
        "status": "error",
        "error": {"type": error_type, "detail": detail},
    }


def _dump(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    return value


@contextmanager
def _database() -> Iterator[Session]:
    settings = Settings()
    migrate_database(settings.database_url)
    configure_database(settings.database_url)
    session = get_session_factory()()
    ensure_default_config(session)
    try:
        yield session
    finally:
        session.close()


def _require_mcp() -> Any:
    if FastMCP is None:
        raise RuntimeError(
            "MCP support is not installed; run `uv sync --extra agent` "
            "or install the `mcp` dependency"
        ) from _MCP_IMPORT_ERROR
    return FastMCP


def build_server() -> Any:
    mcp_type = _require_mcp()
    server = mcp_type("vocab-coach")

    @server.tool()
    def vocab_coach_doctor() -> dict[str, Any]:
        """Initialize and validate the local Vocab Coach database."""

        try:
            with _database():
                settings = Settings()
                return _ok(
                    {
                        "version": __version__,
                        "database_url": settings.database_url,
                    }
                )
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _error("internal_error", str(exc))

    @server.tool()
    def vocab_coach_import(
        items: list[dict[str, Any]],
        strict_existing: bool = False,
    ) -> dict[str, Any]:
        """Atomically import complete vocabulary records."""

        try:
            payload = json.dumps(
                items,
                ensure_ascii=False,
            ).encode("utf-8")
            with _database() as db:
                result = validate_and_import_with_report(
                    db,
                    "agent.json",
                    payload,
                    skip_existing=not strict_existing,
                )
                return _ok(
                    {
                        "imported_count": len(result.cards),
                        "skipped_existing_count": len(result.skipped_existing),
                        "skipped_existing": result.skipped_existing,
                        "cards": [_dump(card) for card in result.cards],
                    }
                )
        except ImportValidationError as exc:
            return _error("validation_error", json.dumps(exc.errors, ensure_ascii=False))
        except ValueError as exc:
            return _error("validation_error", str(exc))
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _error("internal_error", str(exc))

    @server.tool()
    def vocab_coach_lookup(
        word: str,
        history_limit: int = 50,
    ) -> dict[str, Any]:
        """Look up a vocabulary word and its FSRS history."""

        if not 0 <= history_limit <= 100:
            return _error("validation_error", "history_limit must be between 0 and 100")
        try:
            with _database() as db:
                detail = get_vocabulary_detail(db, word, history_limit=history_limit)
                if detail is None:
                    return _error("not_found", f'Vocabulary word "{word}" was not found')
                return _ok(_dump(detail))
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _error("internal_error", str(exc))

    @server.tool()
    def vocab_coach_next_card() -> dict[str, Any]:
        """Fetch exactly one due or new FSRS card for the current Agent session."""

        try:
            with _database() as db:
                result = fetch_session_cards(db, 1)
                if not result.cards:
                    presentation = render_agent_empty().model_dump(mode="json")
                    return {
                        **_error("empty_queue", "There are no due or new cards"),
                        "presentation": presentation,
                    }
                presentation = render_agent_card(result.cards[0]).model_dump(mode="json")
                return _ok(_dump(result.cards[0]), presentation)
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _error("internal_error", str(exc))

    @server.tool()
    def vocab_coach_review(
        card_id: str,
        grade: str,
        request_id: str,
        expected_review_count: int,
    ) -> dict[str, Any]:
        """Submit one idempotent FSRS review and reveal the answer."""

        if not card_id.strip():
            return _error("validation_error", "card_id must not be blank")
        if not 1 <= len(request_id.strip()) <= 64:
            return _error("validation_error", "request_id must contain 1 to 64 characters")
        if grade not in {"again", "hard", "good", "easy"}:
            return _error("validation_error", "grade must be one of again, hard, good, easy")
        if expected_review_count < 0:
            return _error("validation_error", "expected_review_count must be non-negative")
        try:
            with _database() as db:
                result = review_card(
                    db,
                    card_id,
                    grade,
                    request_id=request_id,
                    expected_review_count=expected_review_count,
                )
                presentation = render_agent_answer(result.revealed_answer).model_dump(mode="json")
                return _ok(_dump(result), presentation)
        except LookupError as exc:
            return _error("not_found", str(exc))
        except (StaleReviewError, ReviewRequestConflictError) as exc:
            return _error("review_conflict", str(exc))
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _error("internal_error", str(exc))

    @server.tool()
    def vocab_coach_stats(timezone_offset_minutes: int = 0) -> dict[str, Any]:
        """Read today's study statistics."""

        if not -840 <= timezone_offset_minutes <= 840:
            return _error(
                "validation_error",
                "timezone_offset_minutes must be between -840 and 840",
            )
        try:
            with _database() as db:
                return _ok(_dump(get_today_stats(db, timezone_offset_minutes)))
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _error("internal_error", str(exc))

    return server


def main() -> None:
    build_server().run(transport="stdio")


if __name__ == "__main__":
    main()
