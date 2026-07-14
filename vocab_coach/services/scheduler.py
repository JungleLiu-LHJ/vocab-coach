import json
from datetime import timedelta
from importlib.metadata import version

from fsrs import Rating, Scheduler
from sqlalchemy import select
from sqlalchemy.orm import Session

from vocab_coach.models import FsrsConfig
from vocab_coach.schemas import Grade
from vocab_coach.services.common import to_timestamp, utc_now


RATING_BY_GRADE: dict[Grade, Rating] = {
    "again": Rating.Again,
    "hard": Rating.Hard,
    "good": Rating.Good,
    "easy": Rating.Easy,
}


def ensure_default_config(db: Session) -> FsrsConfig:
    active = db.scalar(select(FsrsConfig).where(FsrsConfig.is_active.is_(True)))
    if active:
        return active

    now = to_timestamp(utc_now())
    default_scheduler = Scheduler()
    config = FsrsConfig(
        name="default",
        is_active=True,
        weights_json=json.dumps(list(default_scheduler.parameters)),
        target_retention=default_scheduler.desired_retention,
        maximum_interval=default_scheduler.maximum_interval,
        learning_steps_json=json.dumps(
            [int(step.total_seconds()) for step in default_scheduler.learning_steps]
        ),
        fsrs_version=version("fsrs"),
        created_at=now,
        updated_at=now,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def get_active_config(db: Session) -> FsrsConfig:
    config = db.scalar(select(FsrsConfig).where(FsrsConfig.is_active.is_(True)))
    if config is None:
        return ensure_default_config(db)
    return config


def build_scheduler(config: FsrsConfig, *, enable_fuzzing: bool = True) -> Scheduler:
    steps = json.loads(config.learning_steps_json or "[60, 600]")
    return Scheduler(
        parameters=json.loads(config.weights_json),
        desired_retention=config.target_retention,
        learning_steps=[timedelta(seconds=int(value)) for value in steps],
        maximum_interval=config.maximum_interval,
        enable_fuzzing=enable_fuzzing,
    )

