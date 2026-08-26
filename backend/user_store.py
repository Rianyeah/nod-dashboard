"""Database-backed dashboard users with a read-only legacy fallback account."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID, uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import text

from config import SecuritySettings
from database import async_session


ROLES = frozenset({"viewer", "data_admin", "sysadmin"})
ROLE_PERMISSIONS = {
    "viewer": frozenset({"dashboard:view"}),
    "data_admin": frozenset({"dashboard:view", "management_data:write"}),
    "sysadmin": frozenset(
        {"dashboard:view", "management_data:write", "users:manage"}
    ),
}
_password_hasher = PasswordHasher()


@dataclass(frozen=True)
class AppUser:
    id: str
    username: str
    password_hash: str
    role: str
    is_active: bool = True
    session_version: int = 1

    @property
    def permissions(self) -> tuple[str, ...]:
        return tuple(sorted(ROLE_PERMISSIONS.get(self.role, ())))


class UserStore(Protocol):
    async def get_by_username(self, username: str) -> AppUser | None: ...

    async def list_users(self) -> list[AppUser]: ...

    async def create_user(
        self,
        *,
        username: str,
        password: str,
        role: str,
        created_by: str,
    ) -> AppUser: ...

    async def update_user(
        self,
        *,
        user_id: str,
        role: str | None,
        is_active: bool | None,
        new_password: str | None,
    ) -> AppUser | None: ...


def password_is_valid(password_hash: str, password: str) -> bool:
    try:
        return bool(_password_hasher.verify(password_hash, password))
    except VerificationError:
        return False


class DatabaseUserStore:
    """Persist human dashboard accounts in Neon/Postgres."""

    async def get_by_username(self, username: str) -> AppUser | None:
        async with async_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id::text, username, password_hash, role, is_active, session_version
                    FROM app_users
                    WHERE LOWER(username) = LOWER(:username)
                    """
                ),
                {"username": username.strip()},
            )
            return _row_to_user(result.mappings().first())

    async def list_users(self) -> list[AppUser]:
        async with async_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id::text, username, password_hash, role, is_active, session_version
                    FROM app_users
                    ORDER BY LOWER(username)
                    """
                )
            )
            return [_row_to_user(row) for row in result.mappings()]

    async def create_user(
        self,
        *,
        username: str,
        password: str,
        role: str,
        created_by: str,
    ) -> AppUser:
        if role not in ROLES:
            raise ValueError("Invalid role")
        user_id = str(uuid4())
        password_hash = _password_hasher.hash(password)
        async with async_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO app_users (id, username, password_hash, role, created_by)
                    VALUES (CAST(:id AS uuid), :username, :password_hash, :role, :created_by)
                    RETURNING id::text, username, password_hash, role, is_active, session_version
                    """
                ),
                {
                    "id": user_id,
                    "username": username.strip(),
                    "password_hash": password_hash,
                    "role": role,
                    "created_by": created_by,
                },
            )
            await session.commit()
            return _row_to_user(result.mappings().one())

    async def update_user(
        self,
        *,
        user_id: str,
        role: str | None,
        is_active: bool | None,
        new_password: str | None,
    ) -> AppUser | None:
        if role is not None and role not in ROLES:
            raise ValueError("Invalid role")
        UUID(user_id)
        assignments = ["updated_at = NOW()", "session_version = session_version + 1"]
        params: dict[str, object] = {"id": user_id}
        if role is not None:
            assignments.append("role = :role")
            params["role"] = role
        if is_active is not None:
            assignments.append("is_active = :is_active")
            params["is_active"] = is_active
        if new_password:
            assignments.append("password_hash = :password_hash")
            params["password_hash"] = _password_hasher.hash(new_password)

        async with async_session() as session:
            result = await session.execute(
                text(
                    f"""
                    UPDATE app_users
                    SET {', '.join(assignments)}
                    WHERE id = CAST(:id AS uuid)
                    RETURNING id::text, username, password_hash, role, is_active, session_version
                    """
                ),
                params,
            )
            await session.commit()
            return _row_to_user(result.mappings().first())


class LegacyUserStore:
    """Keep the existing environment account available as a viewer during migration."""

    def __init__(self, settings: SecuritySettings):
        self._user = AppUser(
            id=f"legacy:{settings.dashboard_user.casefold()}",
            username=settings.dashboard_user,
            password_hash=settings.dashboard_password_hash,
            role="viewer",
        )

    async def get_by_username(self, username: str) -> AppUser | None:
        if secrets.compare_digest(username.strip().casefold(), self._user.username.casefold()):
            return self._user
        return None

    async def list_users(self) -> list[AppUser]:
        return []

    async def create_user(self, **_: object) -> AppUser:
        raise RuntimeError("Legacy account store is read-only")

    async def update_user(self, **_: object) -> AppUser | None:
        raise RuntimeError("Legacy account store is read-only")


class InMemoryUserStore:
    """Small deterministic store for API tests without a database connection."""

    def __init__(self, users: list[AppUser] | None = None):
        self._users = {user.username.casefold(): user for user in (users or [])}

    async def get_by_username(self, username: str) -> AppUser | None:
        return self._users.get(username.strip().casefold())

    async def list_users(self) -> list[AppUser]:
        return sorted(self._users.values(), key=lambda user: user.username.casefold())

    async def create_user(
        self,
        *,
        username: str,
        password: str,
        role: str,
        created_by: str,
    ) -> AppUser:
        del created_by
        key = username.strip().casefold()
        if key in self._users:
            raise ValueError("Username already exists")
        user = AppUser(
            id=str(uuid4()),
            username=username.strip(),
            password_hash=_password_hasher.hash(password),
            role=role,
        )
        self._users[key] = user
        return user

    async def update_user(
        self,
        *,
        user_id: str,
        role: str | None,
        is_active: bool | None,
        new_password: str | None,
    ) -> AppUser | None:
        current = next((user for user in self._users.values() if user.id == user_id), None)
        if current is None:
            return None
        updated = AppUser(
            id=current.id,
            username=current.username,
            password_hash=_password_hasher.hash(new_password) if new_password else current.password_hash,
            role=role or current.role,
            is_active=current.is_active if is_active is None else is_active,
            session_version=current.session_version + 1,
        )
        self._users[updated.username.casefold()] = updated
        return updated


class HybridUserStore:
    """Prefer database users and fall back only to the configured legacy viewer."""

    def __init__(self, settings: SecuritySettings):
        self.database = DatabaseUserStore()
        self.legacy = LegacyUserStore(settings)

    async def get_by_username(self, username: str) -> AppUser | None:
        try:
            user = await self.database.get_by_username(username)
        except Exception:
            user = None
        return user or await self.legacy.get_by_username(username)

    async def list_users(self) -> list[AppUser]:
        return await self.database.list_users()

    async def create_user(self, **kwargs: object) -> AppUser:
        return await self.database.create_user(**kwargs)

    async def update_user(self, **kwargs: object) -> AppUser | None:
        return await self.database.update_user(**kwargs)


def _row_to_user(row: object) -> AppUser | None:
    if row is None:
        return None
    return AppUser(
        id=str(row["id"]),
        username=str(row["username"]),
        password_hash=str(row["password_hash"]),
        role=str(row["role"]),
        is_active=bool(row["is_active"]),
        session_version=int(row["session_version"]),
    )
