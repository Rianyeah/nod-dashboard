from pathlib import Path


BACKEND = Path(__file__).parents[1]


def test_management_schema_contains_audited_rbac_and_import_tables():
    schema = (BACKEND / "sql" / "management_data.sql").read_text(encoding="utf-8")

    for table in (
        "app_users",
        "data_import_jobs",
        "data_import_job_rows",
        "ticketing_pic_aliases",
        "ticketing_swfm_non_inap",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table}" in schema
    assert "'viewer', 'data_admin', 'sysadmin'" in schema
    assert "source_hash TEXT NOT NULL" in schema


def test_non_inap_schema_adds_nullable_location_columns_idempotently():
    schema = (BACKEND / "sql" / "management_data.sql").read_text(encoding="utf-8")

    assert "cluster TEXT" in schema
    assert "kabupaten TEXT" in schema
    assert "ADD COLUMN IF NOT EXISTS cluster TEXT" in schema
    assert "ADD COLUMN IF NOT EXISTS kabupaten TEXT" in schema


def test_takeover_ranking_unions_fault_center_and_non_inap_by_type():
    source = (BACKEND / "routers" / "ticketing.py").read_text(encoding="utf-8")
    model = (BACKEND / "models" / "ticketing.py").read_text(encoding="utf-8")

    assert "TAKEOVER_RANKING_QUERY" in source
    assert "UPPER(TRIM(t.takeover)) = 'TAKE OVER'" in source
    assert "ticketing_swfm_non_inap" in source
    assert "ticketing_pic_aliases" in source
    for ticket_type in ("BPS", "TS", "PMS", "PMG", "FNA", "BBM"):
        assert ticket_type in source
    assert "MIN(event_date)::date AS coverage_start" in source
    assert "DISTINCT EXTRACT(YEAR FROM event_date)::int" in source
    assert "AS active_years" in source
    assert "fault_center: int" not in model
    assert "bps: int" in model
    assert "ts: int" in model
    assert "avg_daily: float" in model
    assert "add_takeover_daily_average" in source
    assert "takeover_ranking=takeover_ranking" in source
    assert "class TicketingTakeoverRankingItem" in model
