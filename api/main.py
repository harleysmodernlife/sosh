from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import admin, entries, media, pulses, trophies, users, votes


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="Sösh API",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten when web client ships
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# v0.1 routes
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(pulses.router, prefix="/pulses", tags=["pulses"])
app.include_router(entries.router, prefix="/entries", tags=["entries"])
app.include_router(votes.router, prefix="/votes", tags=["votes"])
app.include_router(trophies.router, prefix="/trophies", tags=["trophies"])
app.include_router(media.router, prefix="/media", tags=["media"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
