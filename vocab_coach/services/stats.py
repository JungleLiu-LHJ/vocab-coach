from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from vocab_coach.models import FsrsState, Review, VocabCard
from vocab_coach.schemas import TodayStats


def get_today_stats(db: Session, timezone_offset_minutes: int = 0) -> TodayStats:
    now_utc = datetime.now(timezone.utc)
    local_now = now_utc - timedelta(minutes=timezone_offset_minutes)
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = local_midnight + timedelta(minutes=timezone_offset_minutes)
    start_ts = int(start_utc.timestamp())
    now_ts = int(now_utc.timestamp())

    totals = db.execute(
        select(
            func.count(Review.id),
            func.sum(case((Review.grade == "again", 1), else_=0)),
            func.sum(case((Review.was_new.is_(True), 1), else_=0)),
        ).where(Review.reviewed_at >= start_ts)
    ).one()
    due_count = db.scalar(select(func.count(FsrsState.card_id)).where(FsrsState.due_at <= now_ts)) or 0
    new_count = db.scalar(
        select(func.count(VocabCard.id))
        .outerjoin(FsrsState, FsrsState.card_id == VocabCard.id)
        .where(FsrsState.card_id.is_(None))
    ) or 0
    return TodayStats(
        review_count=totals[0] or 0,
        again_count=totals[1] or 0,
        new_cards_reviewed=totals[2] or 0,
        due_count=due_count,
        new_count=new_count,
    )

