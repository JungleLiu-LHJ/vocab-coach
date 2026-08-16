from pathlib import Path

from vocab_coach.adapters.chat import render_agent_card
from vocab_coach.mcp_server import build_server
from vocab_coach.schemas import ExampleSentence, SessionCard, VocabularyCreate


def _tool(server, name: str):
    return server._tool_manager._tools[name].fn


def _item() -> VocabularyCreate:
    return VocabularyCreate(
        word="lucid",
        translation="清晰的",
        origin_translation="Clear and easy to understand.",
        phonetic_us="/test/",
        phonetic_uk="/test/",
        examples=[ExampleSentence(sentence="A lucid explanation.", translation="一个清晰的解释。")],
    )


def test_agent_presentation_keeps_four_review_grades_and_hides_answer():
    card = SessionCard(
        id="card-id",
        kind="review",
        word="lucid",
        translation=None,
        origin_translation="Clear and easy to understand.",
        phonetic_us="/test/",
        phonetic_uk="/test/",
        examples=[ExampleSentence(sentence="A lucid explanation.", translation="")],
        review_count=3,
    )

    presentation = render_agent_card(card)

    assert [action.value for action in presentation.actions] == [
        "easy",
        "good",
        "hard",
        "again",
    ]
    assert "清晰的" not in presentation.text
    assert "清晰的" not in presentation.fallback_text


def test_mcp_tools_import_next_and_review(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("VOCAB_DATABASE_URL", f"sqlite:///{tmp_path / 'mcp.db'}")
    server = build_server()
    imported = _tool(server, "vocab_coach_import")([_item().model_dump(mode="json")])

    assert imported["status"] == "ok"
    assert imported["data"]["imported_count"] == 1

    next_card = _tool(server, "vocab_coach_next_card")()
    assert next_card["status"] == "ok"
    card = next_card["data"]
    assert next_card["presentation"]["kind"] == "new_card"
    assert "中文：清晰的" in next_card["presentation"]["text"]

    reviewed = _tool(server, "vocab_coach_review")(
        card["id"],
        "easy",
        "request-1",
        card["review_count"],
    )
    assert reviewed["status"] == "ok"
    assert reviewed["presentation"]["kind"] == "answer"
    assert "中文：清晰的" in reviewed["presentation"]["text"]

    retried = _tool(server, "vocab_coach_review")(
        card["id"],
        "easy",
        "request-1",
        card["review_count"],
    )
    assert retried["status"] == "ok"
    assert retried["data"]["card_id"] == card["id"]


def test_mcp_empty_queue_is_typed_error(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("VOCAB_DATABASE_URL", f"sqlite:///{tmp_path / 'empty.db'}")
    server = build_server()

    result = _tool(server, "vocab_coach_next_card")()

    assert result["status"] == "error"
    assert result["error"]["type"] == "empty_queue"
    assert result["presentation"]["kind"] == "empty"


def test_mcp_review_validates_grade_before_touching_database(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("VOCAB_DATABASE_URL", f"sqlite:///{tmp_path / 'validation.db'}")
    server = build_server()

    result = _tool(server, "vocab_coach_review")("card", "maybe", "request", 0)

    assert result == {
        "schema_version": "1",
        "status": "error",
        "error": {
            "type": "validation_error",
            "detail": "grade must be one of again, hard, good, easy",
        },
    }
