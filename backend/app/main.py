from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.init_db import create_tables, ensure_uploads, seed_if_empty
from app.routers import (
    auth,
    clients,
    collections,
    contracts,
    dashboard,
    disbursements,
    erp,
    fiduciary,
    invoices,
    operations,
    quotations,
    validation,
    viafirma,
    webhooks,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_uploads()
    create_tables()
    seed_if_empty()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    description="Plataforma de factoring — API REST (OpenAPI).",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

v1 = settings.API_V1
app.include_router(auth.router, prefix=v1)
app.include_router(dashboard.router, prefix=v1)
app.include_router(clients.router, prefix=v1)
app.include_router(invoices.router, prefix=v1)
app.include_router(quotations.router, prefix=v1)
app.include_router(operations.router, prefix=v1)
app.include_router(contracts.router, prefix=v1)
app.include_router(disbursements.router, prefix=v1)
app.include_router(collections.router, prefix=v1)
app.include_router(validation.router, prefix=v1)
app.include_router(fiduciary.router, prefix=v1)
app.include_router(webhooks.router, prefix=v1)
app.include_router(viafirma.router, prefix=v1)
app.include_router(erp.router, prefix=v1)


@app.get("/health", tags=["Sistema"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "finecta-api"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
