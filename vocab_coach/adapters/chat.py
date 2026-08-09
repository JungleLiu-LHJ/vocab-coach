import unicodedata
from typing import Literal, cast

from pydantic import BaseModel

from vocab_coach.schemas import Grade, RevealedAnswer, SessionCard


Channel = Literal["wechat", "telegram", "whatsapp"]
ChatAction = Literal["start", "pause", "resume", "end", "next", "stats"]


class ChatChoice(BaseModel):
    label: str
    grade: Grade
    callback_data: str


class ChatCard(BaseModel):
    text: str
    choices: list[ChatChoice]


def parse_action(text: str) -> ChatAction | None:
    value = unicodedata.normalize("NFKC", text).strip().casefold()
    return {
        "开始": "start",
        "开始复习": "start",
        "start": "start",
        "暂停": "pause",
        "pause": "pause",
        "继续": "resume",
        "continue": "resume",
        "resume": "resume",
        "结束": "end",
        "结束复习": "end",
        "stop": "end",
        "0": "next",
        "零": "next",
        "下一张": "next",
        "next": "next",
        "统计": "stats",
        "今日统计": "stats",
        "stats": "stats",
    }.get(value)


def parse_callback(
    callback_data: str,
    *,
    active_card_id: str,
    active_review_count: int,
) -> Grade | None:
    parts = callback_data.split(":")
    if len(parts) != 4 or parts[0] != "vocab":
        return None
    _, card_id, review_count, grade = parts
    if card_id != active_card_id or review_count != str(active_review_count):
        return None
    if grade not in {"again", "hard", "good", "easy"}:
        return None
    return cast(Grade, grade)


def parse_rating(text: str, *, card_kind: str, channel: Channel) -> Grade | None:
    value = unicodedata.normalize("NFKC", text).strip().casefold()
    words: dict[str, Grade] = {
        "easy": "easy",
        "认识": "easy",
        "简单": "easy",
        "good": "good",
        "知道": "good",
        "记得": "good",
        "hard": "hard",
        "困难": "hard",
        "模糊": "hard",
        "again": "again",
        "不认识": "again",
        "忘了": "again",
    }
    if value in words:
        grade = words[value]
        if card_kind == "new" and grade not in {"easy", "again"}:
            return None
        return grade

    if card_kind == "new":
        return {"1": "easy", "一": "easy", "2": "again", "二": "again"}.get(value)
    if channel == "whatsapp":
        return {
            "1": "easy",
            "一": "easy",
            "2": "good",
            "二": "good",
            "3": "good",
            "三": "good",
            "4": "again",
            "四": "again",
        }.get(value)
    return {
        "1": "easy",
        "一": "easy",
        "2": "good",
        "二": "good",
        "3": "hard",
        "三": "hard",
        "4": "again",
        "四": "again",
    }.get(value)


def render_card(
    card: SessionCard,
    *,
    channel: Channel,
    position: int | None = None,
    total: int | None = None,
) -> ChatCard:
    progress = f" {position}/{total}" if position is not None and total is not None else ""
    kind = "新词" if card.kind == "new" else "复习"
    phonetics = " · ".join(
        item
        for item in (
            f"US {card.phonetic_us}" if card.phonetic_us else "",
            f"UK {card.phonetic_uk}" if card.phonetic_uk else "",
        )
        if item
    )
    lines = [f"{kind}{progress}", card.word]
    if phonetics:
        lines.append(phonetics)
    lines.append(card.origin_translation)
    if card.kind == "new" and card.translation:
        lines.append(f"中文：{card.translation}")
    if card.examples:
        lines.append("例句：")
        for index, example in enumerate(card.examples, start=1):
            lines.append(f"{index}. {example.sentence}")
            if card.kind == "new" and example.translation:
                lines.append(f"   {example.translation}")

    choices = _choices(card, channel)
    lines.append("评分：" + "  ".join(choice.label for choice in choices))
    if channel in {"telegram", "whatsapp"}:
        lines[1] = f"*{lines[1]}*"
    return ChatCard(text="\n".join(lines), choices=choices)


def render_answer(answer: RevealedAnswer, *, channel: Channel) -> str:
    word = f"*{answer.word}*" if channel in {"telegram", "whatsapp"} else answer.word
    lines = ["答案", word, f"中文：{answer.translation}"]
    if answer.examples:
        lines.append("例句翻译：")
        for index, example in enumerate(answer.examples, start=1):
            lines.append(f"{index}. {example.sentence}")
            if example.translation:
                lines.append(f"   {example.translation}")
    lines.append("回复 0 或“下一张”继续。")
    return "\n".join(lines)


def _choices(card: SessionCard, channel: Channel) -> list[ChatChoice]:
    if card.kind == "new":
        pairs: list[tuple[str, Grade]] = [("1 认识", "easy"), ("2 不认识", "again")]
    elif channel == "whatsapp":
        pairs = [("1 Easy", "easy"), ("2/3 记得", "good"), ("4 Again", "again")]
    else:
        pairs = [
            ("1 Easy", "easy"),
            ("2 Good", "good"),
            ("3 Hard", "hard"),
            ("4 Again", "again"),
        ]
    return [
        ChatChoice(
            label=label,
            grade=grade,
            callback_data=f"vocab:{card.id}:{card.review_count}:{grade}",
        )
        for label, grade in pairs
    ]
