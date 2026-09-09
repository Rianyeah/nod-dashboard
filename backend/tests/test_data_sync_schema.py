def test_data_sync_schema_contains_the_durable_job_contract():
    from data_sync_schema import data_sync_schema_statements

    statements = data_sync_schema_statements()
    schema = "\n".join(statements)

    assert statements
    assert "CREATE TABLE IF NOT EXISTS public.data_sync_jobs" in schema
    assert "callback_token_hash text NOT NULL" in schema
    assert "requested_by_username text NOT NULL" in schema
    assert "dispatch_unknown" in schema
    assert "rows_processed bigint" in schema
    assert "protocol_version integer NOT NULL DEFAULT 1" in schema
    assert "uq_data_sync_jobs_active_dataset" in schema
    assert "WHERE status IN ('dispatching', 'running', 'dispatch_unknown')" in schema


def test_data_sync_schema_parser_returns_executable_statements_without_semicolons():
    from data_sync_schema import data_sync_schema_statements

    statements = data_sync_schema_statements()

    assert len(statements) == 5
    assert all(statement.strip() == statement for statement in statements)
    assert all(not statement.endswith(";") for statement in statements)
    assert all(statement.count("(") == statement.count(")") for statement in statements)
