from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from vocab_coach.config import Settings
from vocab_coach.database import configure_database, get_session_factory, init_db
from vocab_coach.main import create_app
from vocab_coach.services.scheduler import ensure_default_config


@pytest.fixture
def db(tmp_path: Path) -> Generator[Session, None, None]:
    configure_database(f"sqlite:///{tmp_path / 'test.db'}")
    init_db()
    session = get_session_factory()()
    ensure_default_config(session)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(tmp_path: Path) -> Generator[TestClient, None, None]:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'api.db'}",
        llm_base_url=None,
        llm_api_key=None,
        llm_model=None,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
