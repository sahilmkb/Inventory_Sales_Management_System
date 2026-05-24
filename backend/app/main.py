from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.app.database import engine, Base
from backend.app.routes import parameters


# Frontend files are served by FastAPI so the app runs from one port.
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup and dispose the engine on shutdown."""
    print("🚀 Starting up RetailDash backend...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database connected and models loaded!")

    yield

    await engine.dispose()
    print("🛑 Database connection closed!")


app = FastAPI(
    title="RetailDash API",
    description="Backend service for Dashboard, Inventory & Retail Management",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# CORS remains open for local/demo use. Restrict origins before public deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this before deploying publicly.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes are mounted before static files so /api paths are handled by FastAPI.
app.include_router(parameters.router)


@app.get("/")
async def root():
    """Send visitors to the dashboard when they open the app root."""
    return RedirectResponse(url="/dashboard/dashboard.html")


# Static frontend mount must stay last so it does not intercept API routes.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
