import argparse
import json
import os
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from pydantic import BaseModel
from sqlalchemy.orm import Session

from vocab_coach import __version__
from vocab_coach.adapters.chat import (
    render_agent_answer,
    render_agent_card,
    render_answer,
)
from vocab_coach.config import Settings
from vocab_coach.database import (
    configure_database,
    get_session_factory,
    migrate_database,
)
from vocab_coach.services.details import get_vocabulary_detail
from vocab_coach.services.importer import ImportValidationError, validate_and_import_with_report
from vocab_coach.services.scheduler import ensure_default_config
from vocab_coach.services.stats import get_today_stats
from vocab_coach.services.study import (
    ReviewRequestConflictError,
    StaleReviewError,
    fetch_session_cards,
    review_card,
)


def _json_value(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    return value


def _print_json(value: Any, *, stream: Any = sys.stdout) -> None:
    print(json.dumps(_json_value(value), ensure_ascii=False, indent=2), file=stream)


@contextmanager
def _database(database_url: str) -> Iterator[Session]:
    migrate_database(database_url)
    configure_database(database_url)
    session = get_session_factory()()
    ensure_default_config(session)
    try:
        yield session
    finally:
        session.close()


def _read_import(source: str, file_format: str | None) -> tuple[str, bytes]:
    if source == "-":
        suffix = file_format or "json"
        return f"stdin.{suffix}", sys.stdin.buffer.read()
    path = Path(source)
    return path.name, path.read_bytes()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="vocab-coach")
    parser.add_argument(
        "--database-url",
        default=None,
        help="Override VOCAB_DATABASE_URL for this command",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("doctor", help="Initialize and validate the local database")

    import_parser = subparsers.add_parser("import", help="Atomically import CSV or JSON")
    import_parser.add_argument("source", nargs="?", default="-")
    import_parser.add_argument("--format", choices=("json", "csv"))
    import_parser.add_argument(
        "--strict-existing",
        action="store_true",
        help="Reject words already in the database instead of skipping them",
    )

    lookup_parser = subparsers.add_parser("lookup", help="Look up a word")
    lookup_parser.add_argument("word")
    lookup_parser.add_argument("--history-limit", type=int, default=50)

    cards_parser = subparsers.add_parser("cards", help="Get due and new study cards")
    cards_parser.add_argument("--count", type=int, default=20)
    cards_parser.add_argument("--channel", choices=("wechat", "telegram", "whatsapp"))

    review_parser = subparsers.add_parser("review", help="Submit one FSRS review")
    review_parser.add_argument("card_id")
    review_parser.add_argument("grade", choices=("again", "hard", "good", "easy"))
    review_parser.add_argument("--request-id", default=None)
    review_parser.add_argument("--expected-review-count", required=True, type=int)
    review_parser.add_argument("--channel", choices=("wechat", "telegram", "whatsapp"))

    stats_parser = subparsers.add_parser("stats", help="Read today's study statistics")
    stats_parser.add_argument("--timezone-offset-minutes", type=int, default=0)

    serve_parser = subparsers.add_parser("serve", help="Run the local web/API server")
    serve_parser.add_argument("--host", default=None)
    serve_parser.add_argument("--port", type=int, default=None)
    return parser


def main() -> None:
    parser = _parser()
    args = parser.parse_args()
    settings = Settings()
    database_url = args.database_url or settings.database_url

    if args.command == "serve":
        import uvicorn

        os.environ["VOCAB_DATABASE_URL"] = database_url
        uvicorn.run(
            "vocab_coach.main:app",
            host=args.host or settings.host,
            port=args.port or settings.port,
            reload=False,
        )
        return

    try:
        with _database(database_url) as db:
            if args.command == "doctor":
                _print_json(
                    {
                        "status": "ok",
                        "version": __version__,
                        "database_url": database_url,
                    }
                )
            elif args.command == "import":
                filename, content = _read_import(args.source, args.format)
                result = validate_and_import_with_report(
                    db,
                    filename,
                    content,
                    skip_existing=not args.strict_existing,
                )
                _print_json(
                    {
                        "imported_count": len(result.cards),
                        "skipped_existing_count": len(result.skipped_existing),
                        "skipped_existing": result.skipped_existing,
                        "cards": [card.model_dump(mode="json") for card in result.cards],
                    }
                )
            elif args.command == "lookup":
                detail = get_vocabulary_detail(db, args.word, history_limit=args.history_limit)
                if detail is None:
                    raise LookupError(f'Vocabulary word "{args.word}" was not found')
                _print_json(detail)
            elif args.command == "cards":
                if not 1 <= args.count <= 100:
                    parser.error("--count must be between 1 and 100")
                result = fetch_session_cards(db, args.count)
                payload = result.model_dump(mode="json")
                if args.channel:
                    payload["rendered"] = [
                        render_agent_card(
                            card,
                            position=index,
                            total=len(result.cards),
                        ).model_dump(mode="json")
                        for index, card in enumerate(result.cards, start=1)
                    ]
                _print_json(payload)
            elif args.command == "review":
                result = review_card(
                    db,
                    args.card_id,
                    args.grade,
                    request_id=args.request_id or str(uuid.uuid4()),
                    expected_review_count=args.expected_review_count,
                )
                payload = result.model_dump(mode="json")
                if args.channel:
                    payload["presentation"] = render_agent_answer(
                        result.revealed_answer,
                    ).model_dump(mode="json")
                    # Keep the v0.2 string field for existing shell integrations.
                    payload["rendered_answer"] = render_answer(
                        result.revealed_answer,
                        channel=args.channel,
                    )
                _print_json(payload)
            elif args.command == "stats":
                if not -840 <= args.timezone_offset_minutes <= 840:
                    parser.error("--timezone-offset-minutes must be between -840 and 840")
                _print_json(get_today_stats(db, args.timezone_offset_minutes))
    except ImportValidationError as exc:
        _print_json({"error": "import_validation", "details": exc.errors}, stream=sys.stderr)
        raise SystemExit(2) from exc
    except (StaleReviewError, ReviewRequestConflictError) as exc:
        _print_json({"error": "review_conflict", "detail": str(exc)}, stream=sys.stderr)
        raise SystemExit(3) from exc
    except LookupError as exc:
        _print_json({"error": "not_found", "detail": str(exc)}, stream=sys.stderr)
        raise SystemExit(4) from exc


if __name__ == "__main__":
    main()
