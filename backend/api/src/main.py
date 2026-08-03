"""FairProcess 2.0 API Gateway

REST gateway for property-centric evidence platform.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.database import get_db, init_db
from src.routes import properties, evidence, timeline, search, upload, due_process, auth
from src.logging_config import setup_logging
from src.middleware import ErrorHandlerMiddleware, RequestLoggingMiddleware
from src.auth import AuthMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    log = setup_logging(level=settings.LOG_LEVEL)
    log.info("startup", service="api", version="2.0.0")
    await init_db()
    yield
    log.info("shutdown", service="api")


app = FastAPI(
    title="FairProcess 2.0 API",
    description="Evidence-first platform for property due-process analysis",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthMiddleware)
app.add_middleware(ErrorHandlerMiddleware)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(properties.router, prefix="/api/v1/properties", tags=["properties"])
app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["evidence"])
app.include_router(timeline.router, prefix="/api/v1/timeline", tags=["timeline"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(upload.router, prefix="/api/v1/upload", tags=["upload"])
app.include_router(due_process.router, prefix="/api/v1/due-process", tags=["due-process"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "service": "fairprocess-api"}
