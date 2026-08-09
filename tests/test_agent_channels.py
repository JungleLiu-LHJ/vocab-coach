from vocab_coach.adapters.chat import parse_action, parse_callback, parse_rating, render_card
from vocab_coach.schemas import ExampleSentence, SessionCard


def make_card(kind: str) -> SessionCard:
    return SessionCard(
        id="card-id",
        kind=kind,
        word="lucid",
        translation="清晰的" if kind == "new" else None,
        origin_translation="Clear and easy to understand.",
        phonetic_us="/test/",
        phonetic_uk="/test/",
        examples=[
            ExampleSentence(
                sentence="A lucid explanation.",
                translation="一个清晰的解释。" if kind == "new" else "",
            )
        ],
        review_count=0 if kind == "new" else 3,
    )


def test_channel_cards_apply_visibility_and_choice_rules():
    new_card = render_card(make_card("new"), channel="wechat")
    review_card = render_card(make_card("review"), channel="telegram")
    whatsapp_card = render_card(make_card("review"), channel="whatsapp")

    assert "清晰的" in new_card.text
    assert [choice.grade for choice in new_card.choices] == ["easy", "again"]
    assert "清晰的" not in review_card.text
    assert "一个清晰的解释" not in review_card.text
    assert [choice.grade for choice in review_card.choices] == [
        "easy",
        "good",
        "hard",
        "again",
    ]
    assert [choice.grade for choice in whatsapp_card.choices] == ["easy", "good", "again"]
    assert whatsapp_card.choices[1].label == "2/3 记得"


def test_rating_parser_handles_channel_numbers_and_text():
    assert parse_rating("１", card_kind="review", channel="wechat") == "easy"
    assert parse_rating("三", card_kind="review", channel="telegram") == "hard"
    assert parse_rating("3", card_kind="review", channel="whatsapp") == "good"
    assert parse_rating("忘了", card_kind="review", channel="wechat") == "again"
    assert parse_rating("2", card_kind="new", channel="telegram") == "again"
    assert parse_rating("hard", card_kind="new", channel="telegram") is None


def test_actions_and_stale_callbacks_are_unambiguous():
    assert parse_action("０") == "next"
    assert parse_action("暂停") == "pause"
    assert parse_action("今日统计") == "stats"
    assert parse_callback(
        "vocab:card-id:3:hard",
        active_card_id="card-id",
        active_review_count=3,
    ) == "hard"
    assert parse_callback(
        "vocab:old-card:3:hard",
        active_card_id="card-id",
        active_review_count=3,
    ) is None
