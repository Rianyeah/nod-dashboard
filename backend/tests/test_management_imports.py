from datetime import date

import pytest
from fastapi import HTTPException

import services.management_imports as management_imports
from services.management_imports import (
    FAULT_CSV_TO_COLUMN,
    _mark_duplicates,
    _parse_fault_file,
    _parse_non_inap_file,
    normalize_pic_key,
)
from user_store import AppUser


class _Result:
    def __init__(self, *, first=None, rows=()):
        self._first = first
        self._rows = list(rows)

    def mappings(self):
        return self

    def first(self):
        return self._first

    def __iter__(self):
        return iter(self._rows)


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class _FailingCommitSession:
    def __init__(self):
        self.rolled_back = False

    async def execute(self, statement, parameters=None):
        sql = str(statement)
        if "SELECT * FROM data_import_jobs" in sql:
            return _Result(first={
                "id": "job-1",
                "target": "ticketing_swfm_non_inap",
                "status": "validated",
                "invalid_rows": 0,
                "actor_username": "nod-sysadmin",
            })
        if "SELECT payload, change_kind" in sql:
            return _Result(rows=[{
                "payload": {
                    "ticket_number": "FNA-001",
                    "ticket_type": "FNA",
                    "ticket_date": "2026-08-26",
                    "source_payload": {},
                },
                "change_kind": "insert",
            }])
        if "INSERT INTO ticketing_swfm_non_inap" in sql:
            raise RuntimeError("raw database failure")
        return _Result()

    async def rollback(self):
        self.rolled_back = True


class _FailureAuditSession:
    def __init__(self):
        self.committed = False

    async def execute(self, statement, parameters=None):
        return _Result()

    async def commit(self):
        self.committed = True


def test_fna_csv_normalizes_canonical_fields():
    content = (
        "No ticket;Pic name;Created at;Ticket status;Site Id;Site Name;NOP;Regional\n"
        "FNA-001;  Budi   Santoso ;26/08/2026 04:21;OPEN;S001;Site One;Surabaya;Jatim\n"
    ).encode()

    rows = _parse_non_inap_file("field-operation.csv", content)

    assert len(rows) == 1
    assert rows[0].errors == []
    assert rows[0].payload["ticket_type"] == "FNA"
    assert rows[0].payload["ticket_date"] == "2026-08-26"
    assert rows[0].payload["pic_takeover_raw"] == "Budi Santoso"
    assert rows[0].payload["pic_takeover_key"] == "budi santoso"


def test_pm_genset_uses_schedule_date_and_filename_fallback():
    content = "Ticket No;PIC;Schedule Date\nGEN-001;Siti;25/08/2026\n".encode()

    row = _parse_non_inap_file("PM Genset_weekly.csv", content)[0]

    assert row.payload["ticket_type"] == "PMG"
    assert row.payload["ticket_date"] == "2026-08-25"


def test_duplicate_ticket_rows_are_invalidated():
    content = "Ticket Number;Assignee Name;Date\nBBM-1;A;2026-08-01\nBBM-1;B;2026-08-02\n".encode()
    rows = _parse_non_inap_file("BBM.csv", content)

    _mark_duplicates(rows)

    assert all("duplikat" in row.errors[0] for row in rows)


def test_fault_center_requires_one_period_and_maps_all_allowlisted_columns():
    headers = list(FAULT_CSV_TO_COLUMN)
    values = {header: "" for header in headers}
    values.update({
        "Ticket Number SWFM": "SWFM-1",
        "Created At": "26/08/2026 08:30",
        "Tahun": "2026",
        "Periode/Bulan": "Agustus",
        "Tanggal": "26",
        "TakeOver": "TAKE OVER",
        "PIC Take Over Ticket": "Operator Satu",
    })
    content = (
        ";".join(headers) + "\n" + ";".join(values[header] for header in headers) + "\n"
    ).encode()

    parsed = _parse_fault_file("fault-center.csv", content)

    assert parsed.metadata == {"year": 2026, "period": "Agustus"}
    assert parsed.rows[0].errors == []
    assert parsed.rows[0].payload["created_at"] == "2026-08-26 08:30:00"
    assert set(parsed.rows[0].payload) == set(FAULT_CSV_TO_COLUMN.values())


def test_pic_key_collapses_whitespace_and_case():
    assert normalize_pic_key("  ANDI   Santoso ") == "andi santoso"


def test_non_inap_commit_payload_rehydrates_ticket_date_for_asyncpg():
    staged_rows = [{
        "payload": {
            "ticket_number": "FNA-001",
            "ticket_date": "2026-08-26",
            "source_payload": {},
        },
        "change_kind": "insert",
    }]

    changed = management_imports._prepare_non_inap_commit_rows(staged_rows, "job-1")

    assert changed[0]["ticket_date"] == date(2026, 8, 26)
    assert isinstance(changed[0]["ticket_date"], date)


@pytest.mark.asyncio
async def test_commit_import_returns_safe_api_error_after_database_failure(monkeypatch):
    primary = _FailingCommitSession()
    failure_audit = _FailureAuditSession()
    sessions = iter([primary, failure_audit])
    monkeypatch.setattr(
        management_imports,
        "async_session",
        lambda: _SessionContext(next(sessions)),
    )
    actor = AppUser(
        id="user-1",
        username="nod-sysadmin",
        password_hash="unused",
        role="sysadmin",
    )

    with pytest.raises(HTTPException) as caught:
        await management_imports.commit_import("00000000-0000-0000-0000-000000000001", actor)

    assert caught.value.status_code == 500
    assert caught.value.detail == (
        "Commit import gagal. Data target tidak berubah; silakan upload ulang. "
        "Jika masalah berulang, periksa log aplikasi."
    )
    assert primary.rolled_back is True
    assert failure_audit.committed is True
