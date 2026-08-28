import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook

import services.management_imports as management_imports
from services.management_imports import (
    FAULT_CSV_TO_COLUMN,
    _mark_duplicates,
    _parse_fault_file,
    _parse_non_inap_file,
    normalize_pic_key,
)
from user_store import AppUser


RAW_FAULT_HEADERS = [
    "Ticket Number Inap", "Ticket Number SWFM", "Severity", "Type Ticket", "Site Id",
    "Site Name", "Site Class", "Cluster TO", "Sub Cluster", "Impact", "Occured Time",
    "Created At", "Duration Ticket", "Age Ticket", "NE Class", "Ticket Inap Status",
    "Ticket SWFM Status", "PIC Take Over Ticket", "NOP", "Regional", "Area",
    "Is Escalate", "Escalate To", "Cleared Time", "Is Auto Resolved", "RH Start",
    "RH Start Time", "RH Stop", "RH Stop Time", "RC Owner", "RC Category", "RC 1",
    "RC 2", "Note", "Resolution Action", "Take Over Date", "Check In At", "INAP RC 1",
    "INAP RC 2", "INAP Resolution Action", "SLA Status", "Fault Level", "NOSSA No",
    "Assignee Group", "Summary", "Description", "Submitted Time", "Incident Priority",
    "Hub", "Is Excluded In KPI", "Ticket Creation", "Ticket Creator", "Site Cleared On",
    "Rank", "Closed At", "Dispatch By", "Dispatch Date", "Follow Up At",
    "RC Owner Engineer", "RC Category Engineer", "RC 1 Engineer", "RC 2 Engineer",
    "RCA Validated", "RCA Validate At", "RCA Validated By", "Holding Status",
    "Is Force Dispatch", "PIC Email", "RAT", "Parking Status",
]


def _raw_fault_xlsx(*rows: dict[str, object]) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.append(RAW_FAULT_HEADERS)
    for row in rows:
        worksheet.append([row.get(header) for header in RAW_FAULT_HEADERS])
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def _tabular_xlsx(headers: list[str], *rows: dict[str, object]) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.append(headers)
    for row in rows:
        worksheet.append([row.get(header) for header in headers])
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


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
    def __init__(self, fail_on="insert"):
        self.fail_on = fail_on
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
        if "pg_advisory_xact_lock" in sql and self.fail_on == "advisory_lock":
            raise RuntimeError("raw advisory lock failure")
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
        self.executed_sql = []

    async def execute(self, statement, parameters=None):
        self.executed_sql.append(str(statement))
        return _Result()

    async def commit(self):
        self.committed = True


class _ImportValidationSession:
    def __init__(self, site_rows=None):
        self.executions = []
        self.committed = False
        self.site_rows = (
            [{"site_id": "MJO105", "cluster": "TO JOMBANG", "kabupaten": "MOJOKERTO"}]
            if site_rows is None else site_rows
        )

    async def execute(self, statement, parameters=None):
        sql = str(statement)
        self.executions.append((sql, parameters))
        if 'FROM data_site_master' in sql:
            return _Result(rows=self.site_rows)
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


def test_pms_uses_submitted_date_without_fallback_and_maps_site_location_fields():
    content = _tabular_xlsx(
        [
            "Ticket No", "Submitted Date", "Created Date", "Schedule Date", "Site",
            "Site Name", "Cluster", "Kabupaten", "Status", "PIC",
        ],
        {
            "Ticket No": "PMS-202608-000000000001",
            "Submitted Date": datetime(2026, 8, 26, 14, 30),
            "Created Date": datetime(2026, 8, 1, 8, 0),
            "Schedule Date": datetime(2026, 8, 20),
            "Site": "MJO025",
            "Site Name": "PURI",
            "Cluster": "TO JOMBANG",
            "Kabupaten": "MOJOKERTO",
            "Status": "SUBMITTED",
            "PIC": "Operator PMS",
        },
        {
            "Ticket No": "PMS-202608-000000000002",
            "Submitted Date": None,
            "Created Date": datetime(2026, 8, 2, 8, 0),
            "Schedule Date": datetime(2026, 8, 21),
            "Site": "JMB001",
            "Site Name": "JOMBANG",
            "Cluster": "TO JOMBANG",
            "Status": "OPEN",
            "PIC": None,
        },
    )

    rows = _parse_non_inap_file("PM Site_26-08-2026.xlsx", content)

    assert rows[0].payload["ticket_date"] == "2026-08-26"
    assert rows[1].payload["ticket_date"] is None
    assert rows[0].payload["site_id"] == "MJO025"
    assert rows[0].payload["cluster"] == "TO JOMBANG"
    assert rows[0].payload["kabupaten"] == "MOJOKERTO"


@pytest.mark.parametrize("submitted_header", ["Submitted Time", "Submit Time"])
def test_bbm_uses_submitted_time_aliases_without_date_fallback(submitted_header):
    content = _tabular_xlsx(
        [
            "Ticket Number", "Assignee Name", submitted_header, "Date", "Site",
            "Site Name", "Status",
        ],
        {
            "Ticket Number": "BBM-202608-000000000001",
            "Assignee Name": "Operator BBM",
            submitted_header: datetime(2026, 8, 27, 21, 45),
            "Date": datetime(2026, 8, 1, 8, 0),
            "Site": "JMB036",
            "Site Name": "TUNGGORONOJOMBANG",
            "Status": "SUBMITTED",
        },
        {
            "Ticket Number": "BBM-202608-000000000002",
            "Assignee Name": None,
            submitted_header: None,
            "Date": datetime(2026, 8, 2, 8, 0),
            "Site": "PSN002",
            "Site Name": "PANDAAN",
            "Status": "OPEN",
        },
    )

    rows = _parse_non_inap_file("ExportBBMFixedGensetRefill.xlsx", content)

    assert rows[0].payload["ticket_date"] == "2026-08-27"
    assert rows[1].payload["ticket_date"] is None
    assert rows[0].payload["site_id"] == "JMB036"


@pytest.mark.asyncio
async def test_validate_non_inap_enriches_only_missing_location_fields(monkeypatch):
    pms_content = _tabular_xlsx(
        ["Ticket No", "Submitted Date", "Site", "Site Name", "Cluster", "PIC"],
        {
            "Ticket No": "PMS-202608-000000000001",
            "Submitted Date": datetime(2026, 8, 26),
            "Site": "MJO025",
            "Site Name": "PURI",
            "Cluster": "FILE CLUSTER",
            "PIC": "Operator PMS",
        },
    )
    bbm_content = _tabular_xlsx(
        ["Ticket Number", "Assignee Name", "Submit Time", "Site", "Site Name"],
        {
            "Ticket Number": "BBM-202608-000000000001",
            "Assignee Name": "Operator BBM",
            "Submit Time": datetime(2026, 8, 27, 21, 45),
            "Site": "JMB036",
            "Site Name": "TUNGGORONOJOMBANG",
        },
    )
    original_pms_hash = _parse_non_inap_file("PM Site.xlsx", pms_content)[0].payload["source_hash"]
    session = _ImportValidationSession(site_rows=[
        {"site_id": "MJO025", "cluster": "MASTER CLUSTER 1", "kabupaten": "MOJOKERTO"},
        {"site_id": "JMB036", "cluster": "MASTER CLUSTER 2", "kabupaten": "JOMBANG"},
    ])
    monkeypatch.setattr(management_imports, "async_session", lambda: _SessionContext(session))
    actor = AppUser(
        id="user-1",
        username="nod-sysadmin",
        password_hash="unused",
        role="sysadmin",
    )
    uploads = [
        UploadFile(file=BytesIO(pms_content), filename="PM Site.xlsx"),
        UploadFile(file=BytesIO(bbm_content), filename="ExportBBMFixedGensetRefill.xlsx"),
    ]

    result = await management_imports.validate_import("ticketing_swfm_non_inap", uploads, actor)

    assert result["valid_rows"] == 2
    staged_call = next(
        parameters
        for sql, parameters in session.executions
        if "INSERT INTO data_import_job_rows" in sql
    )
    staged = {item["row_key"]: json.loads(item["payload"]) for item in staged_call}
    assert staged["PMS-202608-000000000001"]["cluster"] == "FILE CLUSTER"
    assert staged["PMS-202608-000000000001"]["kabupaten"] == "MOJOKERTO"
    assert staged["BBM-202608-000000000001"]["cluster"] == "MASTER CLUSTER 2"
    assert staged["BBM-202608-000000000001"]["kabupaten"] == "JOMBANG"
    assert staged["PMS-202608-000000000001"]["source_hash"] != original_pms_hash


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


def test_fault_center_raw_swfm_xlsx_derives_existing_table_payload():
    content = _raw_fault_xlsx({
        "Ticket Number Inap": "IM-20260801-00000001",
        "Ticket Number SWFM": "BPS-2026-000001857508",
        "Severity": "Minor",
        "Type Ticket": "Event",
        "Site Id": "MJO105",
        "Site Name": "MLIRM41",
        "Site Class": "Bronze",
        "Cluster TO": "TO JOMBANG",
        "Impact": "3-MODERATE",
        "Occured Time": datetime(2026, 8, 1, 8, 0),
        "Created At": datetime(2026, 8, 1, 8, 10),
        "Ticket Inap Status": "CLOSED",
        "Ticket SWFM Status": "CLOSED",
        "PIC Take Over Ticket": "A'ang Fauzi",
        "NOP": "NOP SIDOARJO",
        "Regional": "R06_Jawa Timur",
        "Area": "AREA 3",
        "Is Escalate": False,
        "Cleared Time": datetime(2026, 8, 1, 9, 30),
        "Is Auto Resolved": "Manual Resolved",
        "RH Start": 1200.5,
        "RH Start Time": datetime(2026, 8, 1, 8, 40),
        "RH Stop": 1204.0,
        "Take Over Date": datetime(2026, 8, 1, 8, 15),
        "Check In At": datetime(2026, 8, 1, 8, 45),
        "Fault Level": "Enva Site GSB",
        "Submitted Time": datetime(2026, 8, 1, 8, 12, 30, 341000),
        "Is Excluded In KPI": "NO",
        "Rank": 1,
        "Closed At": datetime(2026, 8, 1, 12, 30),
        "Follow Up At": datetime(2026, 8, 1, 8, 20),
        "Holding Status": "Dispatched",
    })

    parsed = _parse_fault_file("Ticket_SWFM_27-08-2026.xlsx", content)

    assert parsed.metadata == {"year": 2026, "period": "August", "source_format": "raw_swfm"}
    assert parsed.warnings == []
    assert len(parsed.rows) == 1
    assert parsed.rows[0].errors == []
    payload = parsed.rows[0].payload
    assert set(payload) == set(FAULT_CSV_TO_COLUMN.values())
    assert payload["kategori_tt"] == "BPS"
    assert payload["kabupaten_kota"] is None
    assert payload["tahun"] == 2026
    assert payload["periode_bulan"] == "August"
    assert payload["tanggal"] == 1
    assert payload["mttr"] == "1:30:00"
    assert payload["respon_time"] == "0:05:00"
    assert payload["takeover"] == "TAKE OVER"
    assert payload["pln_downtime"] == "90.00"
    assert payload["durasi"] == "1-2 Jam"
    assert payload["visitation"] == "Visit site"
    assert payload["backup_sukses"] == "BU Genset"
    assert payload["chek_in_at"] == "2026-08-01 08:45:00"
    assert payload["fault_text"] == "Enva Site GSB"
    assert payload["submitted_time"] == "2026-08-01 08:12:30"
    assert payload["closed_at"] == "2026-08-01 12:30:00"
    assert payload["follow_up_at"] == "2026-08-01 08:20:00"
    assert payload["holding_status"] == "Dispatched"


def test_raw_fault_uses_occurrence_takeover_date_and_rh_start_time_semantics():
    content = _raw_fault_xlsx({
        "Ticket Number SWFM": "TS-2026-000001132656",
        "Site Id": "MJO105",
        "Site Name": "MLIRM41",
        "Occured Time": datetime(2026, 8, 31, 23, 50),
        "Created At": datetime(2026, 9, 1, 0, 10),
        "Cleared Time": datetime(2026, 9, 1, 0, 50),
        "PIC Take Over Ticket": "A'ang Fauzi",
        "Take Over Date": None,
        "RH Start": 1200.5,
        "RH Start Time": None,
        "Is Escalate": False,
        "Is Excluded In KPI": "NO",
        "Rank": 1,
    })

    parsed = _parse_fault_file("Ticket_SWFM_27-08-2026.xlsx", content)

    assert parsed.metadata == {"year": 2026, "period": "August", "source_format": "raw_swfm"}
    payload = parsed.rows[0].payload
    assert payload["tanggal"] == 31
    assert payload["takeover"] == "NOT TAKEN"
    assert payload["respon_time"] == "0:00:00"
    assert payload["backup_sukses"] == "Not BU Genset"


def test_fault_duration_uses_established_59_minute_boundary():
    assert management_imports._fault_duration_bucket(59 * 60 - 1) == "<1 Jam"
    assert management_imports._fault_duration_bucket(59 * 60) == "1-2 Jam"


def test_fault_period_variants_cover_english_and_indonesian_month_names():
    assert set(management_imports._period_variants("August")) == {"august", "agustus"}
    assert set(management_imports._period_variants("Agustus")) == {"august", "agustus"}


@pytest.mark.asyncio
async def test_validate_raw_fault_enriches_kabupaten_from_existing_site_master(monkeypatch):
    content = _raw_fault_xlsx({
        "Ticket Number SWFM": "BPS-2026-000001857508",
        "Site Id": "MJO105",
        "Site Name": "MLIRM41",
        "Occured Time": datetime(2026, 8, 1, 8, 0),
        "Created At": datetime(2026, 8, 1, 8, 10),
        "Cleared Time": datetime(2026, 8, 1, 9, 30),
        "RH Start": 0,
        "RH Stop": 0,
        "Is Escalate": False,
        "Is Excluded In KPI": "NO",
        "Rank": 1,
    })
    session = _ImportValidationSession()
    monkeypatch.setattr(management_imports, "async_session", lambda: _SessionContext(session))
    actor = AppUser(
        id="user-1",
        username="nod-sysadmin",
        password_hash="unused",
        role="sysadmin",
    )
    upload = UploadFile(file=BytesIO(content), filename="Ticket_SWFM_27-08-2026.xlsx")

    result = await management_imports.validate_import("ticketing_fault_center", [upload], actor)

    assert result["valid_rows"] == 1
    assert result["invalid_rows"] == 0
    staged_call = next(
        parameters
        for sql, parameters in session.executions
        if "INSERT INTO data_import_job_rows" in sql
    )
    staged_payload = json.loads(staged_call[0]["payload"])
    assert staged_payload["kabupaten_kota"] == "MOJOKERTO"
    assert session.committed is True


@pytest.mark.asyncio
async def test_validate_raw_fault_uses_site_name_code_when_export_site_id_is_epm(monkeypatch):
    content = _raw_fault_xlsx({
        "Ticket Number SWFM": "TS-2026-000001132656",
        "Site Id": "EPM106",
        "Site Name": "SDA284_SDA_SMKN1BUDURANOLEG",
        "Occured Time": datetime(2026, 8, 1, 8, 0),
        "Created At": datetime(2026, 8, 1, 8, 10),
        "Cleared Time": datetime(2026, 8, 1, 9, 30),
        "RH Start": 0,
        "RH Stop": 0,
        "Is Escalate": False,
        "Is Excluded In KPI": "NO",
        "Rank": 1,
    })
    session = _ImportValidationSession(
        site_rows=[{"site_id": "SDA284", "kabupaten": "SIDOARJO"}],
    )
    monkeypatch.setattr(management_imports, "async_session", lambda: _SessionContext(session))
    actor = AppUser(
        id="user-1",
        username="nod-sysadmin",
        password_hash="unused",
        role="sysadmin",
    )
    upload = UploadFile(file=BytesIO(content), filename="Ticket_SWFM_27-08-2026.xlsx")

    result = await management_imports.validate_import("ticketing_fault_center", [upload], actor)

    assert result["valid_rows"] == 1
    staged_call = next(
        parameters
        for sql, parameters in session.executions
        if "INSERT INTO data_import_job_rows" in sql
    )
    staged_payload = json.loads(staged_call[0]["payload"])
    assert staged_payload["kabupaten_kota"] == "SIDOARJO"


@pytest.mark.asyncio
async def test_validate_raw_fault_rejects_unresolved_kabupaten_without_writing_target(monkeypatch):
    content = _raw_fault_xlsx({
        "Ticket Number SWFM": "TS-2026-000001132656",
        "Site Id": "UNKNOWN001",
        "Site Name": "UNKNOWN_SITE",
        "Occured Time": datetime(2026, 8, 1, 8, 0),
        "Created At": datetime(2026, 8, 1, 8, 10),
        "Cleared Time": datetime(2026, 8, 1, 9, 30),
        "RH Start": 0,
        "RH Stop": 0,
        "Is Escalate": False,
        "Is Excluded In KPI": "NO",
        "Rank": 1,
    })
    session = _ImportValidationSession(site_rows=[])
    monkeypatch.setattr(management_imports, "async_session", lambda: _SessionContext(session))
    actor = AppUser(
        id="user-1",
        username="nod-sysadmin",
        password_hash="unused",
        role="sysadmin",
    )
    upload = UploadFile(file=BytesIO(content), filename="Ticket_SWFM_27-08-2026.xlsx")

    result = await management_imports.validate_import("ticketing_fault_center", [upload], actor)

    assert result["valid_rows"] == 0
    assert result["invalid_rows"] == 1
    assert result["preview_rows"][0]["errors"] == [
        "Kabupaten Kota tidak ditemukan untuk Site Id UNKNOWN001",
    ]
    assert all("DELETE FROM ticketing_fault_center" not in sql for sql, _ in session.executions)


@pytest.mark.asyncio
async def test_validate_raw_fault_rejects_placeholder_kabupaten(monkeypatch):
    content = _raw_fault_xlsx({
        "Ticket Number SWFM": "BPS-2026-000001857508",
        "Site Id": "MJO105",
        "Site Name": "MLIRM41",
        "Occured Time": datetime(2026, 8, 1, 8, 0),
        "Created At": datetime(2026, 8, 1, 8, 10),
        "Cleared Time": datetime(2026, 8, 1, 9, 30),
        "Is Escalate": False,
        "Is Excluded In KPI": "NO",
        "Rank": 1,
    })
    session = _ImportValidationSession(
        site_rows=[{"site_id": "MJO105", "kabupaten": "#N/A"}],
    )
    monkeypatch.setattr(management_imports, "async_session", lambda: _SessionContext(session))
    actor = AppUser(
        id="user-1",
        username="nod-sysadmin",
        password_hash="unused",
        role="sysadmin",
    )
    upload = UploadFile(file=BytesIO(content), filename="Ticket_SWFM_27-08-2026.xlsx")

    result = await management_imports.validate_import("ticketing_fault_center", [upload], actor)

    assert result["valid_rows"] == 0
    assert result["invalid_rows"] == 1


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


def test_non_inap_upsert_writes_location_columns_on_insert_and_update():
    statement = management_imports._non_inap_upsert_statement()

    assert "cluster, kabupaten" in statement
    assert ":cluster, :kabupaten" in statement
    assert "cluster = EXCLUDED.cluster" in statement
    assert "kabupaten = EXCLUDED.kabupaten" in statement


def test_fault_commit_payload_rehydrates_postgres_types_for_asyncpg():
    staged_rows = [{
        "payload": {
            "occured_time": "2026-08-01 00:38:49",
            "created_at": "2026-08-01 00:59:02",
            "cleared_time": None,
            "mttr": "1:57:05",
            "respon_time": "-0:20:13",
            "pln_downtime": "117.08",
            "rh_start": None,
            "tahun": 2026,
            "is_escalate": False,
        },
        "change_kind": "insert",
    }]

    prepared = management_imports._prepare_fault_commit_rows(staged_rows)

    assert prepared[0]["occured_time"] == datetime(2026, 8, 1, 0, 38, 49)
    assert prepared[0]["created_at"] == datetime(2026, 8, 1, 0, 59, 2)
    assert prepared[0]["cleared_time"] is None
    assert prepared[0]["mttr"] == timedelta(hours=1, minutes=57, seconds=5)
    assert prepared[0]["respon_time"] == -timedelta(minutes=20, seconds=13)
    assert prepared[0]["pln_downtime"] == Decimal("117.08")
    assert prepared[0]["rh_start"] is None
    assert prepared[0]["tahun"] == 2026
    assert prepared[0]["is_escalate"] is False


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


@pytest.mark.asyncio
async def test_commit_import_safely_fails_before_target_write_without_overwriting_completed_job(
    monkeypatch,
):
    primary = _FailingCommitSession(fail_on="advisory_lock")
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
    assert primary.rolled_back is True
    assert failure_audit.committed is True
    assert "status <> 'completed'" in failure_audit.executed_sql[0]
