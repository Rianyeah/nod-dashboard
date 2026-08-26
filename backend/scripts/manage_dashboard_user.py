"""Create or update a database-backed dashboard user without exposing passwords."""

from __future__ import annotations

import argparse
import asyncio
from getpass import getpass
from pathlib import Path
import sys

from dotenv import load_dotenv
from sqlalchemy import text


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

ROLES = frozenset({"viewer", "data_admin", "sysadmin"})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update a dashboard user")
    parser.add_argument("--env", type=Path, default=BACKEND_DIR / ".env")
    parser.add_argument("--username", required=True)
    parser.add_argument("--role", required=True, choices=sorted(ROLES))
    parser.add_argument("--created-by", default="bootstrap-cli")
    parser.add_argument("--deactivate", action="store_true")
    return parser.parse_args()


async def run(args: argparse.Namespace) -> None:
    from database import async_session
    from management_schema import management_schema_statements
    from user_store import DatabaseUserStore

    async with async_session() as session:
        for statement in management_schema_statements():
            await session.execute(text(statement))
        await session.commit()

    store = DatabaseUserStore()
    existing = await store.get_by_username(args.username)
    password = getpass("New password (minimum 12 characters): ")
    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters")
    if existing:
        updated = await store.update_user(
            user_id=existing.id,
            role=args.role,
            is_active=not args.deactivate,
            new_password=password,
        )
        print(f"Updated {updated.username} as {updated.role}; active={updated.is_active}")
        return
    if args.deactivate:
        raise ValueError("Cannot create a deactivated user")
    created = await store.create_user(
        username=args.username,
        password=password,
        role=args.role,
        created_by=args.created_by,
    )
    print(f"Created {created.username} as {created.role}")


if __name__ == "__main__":
    arguments = parse_args()
    load_dotenv(arguments.env, override=True)
    asyncio.run(run(arguments))
