"""FairProcess 2.0 API Gateway

REST + GraphQL gateway for property-centric evidence platform.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.database import get_db, init_db
from src.models import property as property_models
from src.models import evidence as evidence_models
from src.routes import properties, evidence, timeline, search, upload, due_process
from src.services.search_index import SearchIndexService


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="FairProcess 2.0 API",
    description="Evidence-first platform for property due-process analysis",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(properties.router, prefix="/api/v1/properties", tags=["properties"])
app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["evidence"])
app.include_router(timeline.router, prefix="/api/v1/timeline", tags=["timeline"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(upload.router, prefix="/api/v1/upload", tags=["upload"])
app.include_router(due_process.router, prefix="/api/v1/due-process", tags=["due-process"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
