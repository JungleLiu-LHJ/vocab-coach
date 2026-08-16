import unicodedata
from typing import Literal, cast

from pydantic import BaseModel, Field

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


class AgentAction(BaseModel):
    """A channel-neutral action that an Agent can render as a button or text."""

    id: str
    label: str
    value: Grade


class AgentPresentation(BaseModel):
    """A stable presentation contract for MCP and other Agent integrations."""

    kind: Literal["new_card", "review_card", "answer", "empty"]
    text: str
    fallback_text: str
    actions: list[AgentAction] = Field(default_factory=list)
    card_id: str | None = None
    card_kind: Literal["new", "review"] | None = None
    review_count: int | None = None


def render_agent_card(
    card: SessionCard,
    *,
    position: int | None = None,
    total: int | None = None,
) -> AgentPresentation:
    """Render one card without making assumptions about the destination channel."""

    progress = f" {position}/{total}" if position is not None and total is not None else ""
    kind = "新词" if card.kind == "new" else "复习"
    lines = _card_content_lines(card, header=f"{kind}{progress}")
    actions = _agent_actions(card)
    action_text = "评分：" + "  ".join(action.label for action in actions)
    text = "\n".join([*lines, action_text])
    fallback = "\n".join(
        [*lines, "回复：" + " / ".join(action.label for action in actions)]
    )
    return AgentPresentation(
        kind="new_card" if card.kind == "new" else "review_card",
        text=text,
        fallback_text=fallback,
        actions=actions,
        card_id=card.id,
        card_kind=card.kind,
        review_count=card.review_count,
    )


def render_agent_answer(answer: RevealedAnswer) -> AgentPresentation:
    lines = ["答案", answer.word, f"中文：{answer.translation}"]
    if answer.examples:
        lines.append("例句翻译：")
        for index, example in enumerate(answer.examples, start=1):
            lines.append(f"{index}. {example.sentence}")
            if example.translation:
                lines.append(f"   {example.translation}")
    lines.append("回复 0 或“下一张”继续。")
    text = "\n".join(lines)
    return AgentPresentation(kind="answer", text=text, fallback_text=text)


def render_agent_empty() -> AgentPresentation:
    text = "当前没有到期或待学习的单词。"
    return AgentPresentation(kind="empty", text=text, fallback_text=text)


def _card_content_lines(card: SessionCard, *, header: str) -> list[str]:
    phonetics = " · ".join(
        item
        for item in (
            f"US {card.phonetic_us}" if card.phonetic_us else "",
            f"UK {card.phonetic_uk}" if card.phonetic_uk else "",
        )
        if item
    )
    lines = [header, card.word]
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
    return lines


def _agent_actions(card: SessionCard) -> list[AgentAction]:
    pairs: list[tuple[str, Grade]]
    if card.kind == "new":
        pairs = [("1 认识", "easy"), ("2 不认识", "again")]
    else:
        pairs = [
            ("1 Easy", "easy"),
            ("2 Good", "good"),
            ("3 Hard", "hard"),
            ("4 Again", "again"),
        ]
    return [
        AgentAction(
            id=f"vocab:{card.id}:{card.review_count}:{grade}",
            label=label,
            value=grade,
        )
        for label, grade in pairs
    ]


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


def parse_rating(
    text: str,
    *,
    card_kind: str,
    channel: Channel | None = None,
) -> Grade | None:
    """Parse the channel-neutral rating vocabulary.

    ``channel`` remains an accepted, ignored compatibility argument for callers of v0.2.
    Native channel adapters should pass button values directly to the Agent protocol.
    """
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
