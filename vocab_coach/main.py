from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from vocab_coach.api import router
from vocab_coach.config import Settings, get_settings
from vocab_coach.database import configure_database, get_session_factory, migrate_database
from vocab_coach.services.scheduler import ensure_default_config


PACKAGE_DIR = Path(__file__).resolve().parent
STATIC_DIR = PACKAGE_DIR / "static"


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        configure_database(resolved_settings.database_url)
        migrate_database(resolved_settings.database_url)
        with get_session_factory()() as db:
            ensure_default_config(db)
        yield

    application = FastAPI(
        title="Vocab Coach",
        version="0.1.0",
        description="Local-first FSRS vocabulary learning",
        lifespan=lifespan,
    )
    application.dependency_overrides[get_settings] = lambda: resolved_settings
    application.include_router(router)
    application.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @application.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    return application


app = create_app()


def run() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run("vocab_coach.main:app", host=settings.host, port=settings.port, reload=False)


if __name__ == "__main__":
    run()
