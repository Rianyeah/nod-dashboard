import os
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DATA_SYNC_DB_TESTS") != "1",
    reason="local PostgreSQL integration test is opt-in",
)


@pytest.mark.asyncio
async def test_schema_is_idempotent_and_enforces_one_active_job_per_dataset():
    from data_sync_schema import ensure_data_sync_schema

    database_url = os.environ["DATA_SYNC_TEST_DATABASE_URL"]
    engine = create_async_engine(database_url)
    first_id = uuid4()
    second_id = uuid4()
    insert = text(
        """
        INSERT INTO public.data_sync_jobs (
            id, dataset, status, requested_by_user_id, requested_by_username,
            requested_by_role, callback_token_hash, correlation_id,
            protocol_version, started_at
        ) VALUES (
            :id, 'activity_enom', 'running', 'integration-user', 'integration-user',
            'viewer', :token_hash, :correlation_id, 1, now()
        )
        """
    )
    try:
        await ensure_data_sync_schema(engine)
        await ensure_data_sync_schema(engine)

        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await connection.execute(
                    insert,
                    {
                        "id": first_id,
                        "token_hash": "a" * 64,
                        "correlation_id": uuid4(),
                    },
                )
                savepoint = await connection.begin_nested()
                with pytest.raises(IntegrityError):
                    await connection.execute(
                        insert,
                        {
                            "id": second_id,
                            "token_hash": "b" * 64,
                            "correlation_id": uuid4(),
                        },
                    )
                await savepoint.rollback()
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()
