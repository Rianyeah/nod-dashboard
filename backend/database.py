"""
NeonDB async database connection module.
Uses SQLAlchemy 2.0 async engine with asyncpg driver.
"""
import os
from dotenv import load_dotenv
import runtime_compat  # noqa: F401
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncSession:
    """Dependency injection for FastAPI routes."""
    async with async_session() as session:
        yield session


async def check_db_connection() -> bool:
    """Health check — verify DB is reachable."""
    try:
        async with engine.connect() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
        return True
    except Exception:
        return False
