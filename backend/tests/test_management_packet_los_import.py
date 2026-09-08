import csv
from datetime import date
from decimal import Decimal
from io import BytesIO, StringIO
from types import SimpleNamespace

import pytest
from fastapi import UploadFile

import services.management_imports as management_imports
from user_store import AppUser


PACKET_HEADERS = [
    "WEEK", "DATE", "AREA", "REGION", "TWAMP", "SITE ID", "SITE NAME", "NOP",
    "CONNECTED ROUTER", "TRANSPORT OWNER", "TRANSPORT TYPE", "BW ACTUAL", "VLAN-U",
    "VLAN-C", "KABUPATEN", "DEPARTEMENT", "KECAMATAN", "DESA", "PROVINSI",
    "AVG_DL_IUBUSAGE", "MAX_DL_IUBUSAGE", "IDX_DL_IUBUSAGE", "STATUS_IUBUSAGE",
    "AVG PACKET LOSS", "DISTRIBUTION_PL", "LATENCY", "DISTRIBUTION_LAT", "JITTER",
    "PL STATUS - 0.1%", "FLAG PL STATUS", "REMARK PL STATUS 0.1%",
    "LATENCY_THRESHOLD", "LAT STATUS  NEW", "REMARK LAT STATUS", "JITTER STATUS",
    "REMARK JITTER STATUS", "THI STATUS", "REMARK THI", "pl_aging",
    "remark_aging_pl", "lat_aging", "remark_aging_lat", "jitter_aging",
    "remark_aging_jitter", "Nama_File_Sumber",
]


def packet_csv(*rows: dict[str, object]) -> bytes:
    output = StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=PACKET_HEADERS)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return output.getvalue().encode("utf-8")


def packet_row(**overrides: object) -> dict[str, object]:
    row = {
        "WEEK": "33",
        "DATE": "2026-08-20",
        "AREA": "3",
        "REGION": "06-JAWA TIMUR",
        "TWAMP": "HUAWEI",
        "SITE ID": "BDO001",
        "SITE NAME": "Bondowoso",
        "NOP": "JEMBER",
        "CONNECTED ROUTER": "ran-agg-hrhmad",
        "TRANSPORT OWNER": "TELKOM",
        "TRANSPORT TYPE": "FO_TELKOM",
        "VLAN-U": "2450",
        "VLAN-C": "2550.0",
        "KABUPATEN": "BONDOWOSO",
        "DEPARTEMENT": "NOP JEMBER",
        "KECAMATAN": "BONDOWOSO",
        "DESA": "KEL. DABASAH",
        "PROVINSI": "JAWA TIMUR",
        "AVG_DL_IUBUSAGE": "270.0042",
        "MAX_DL_IUBUSAGE": "343.94445",
        "IDX_DL_IUBUSAGE": "0.79",
        "STATUS_IUBUSAGE": "MINOR(P3)",
        "AVG PACKET LOSS": "0.0025",
        "DISTRIBUTION_PL": "0-0.1%",
        "LATENCY": "7.1316",
        "DISTRIBUTION_LAT": "5-10ms",
        "JITTER": "0.0487",
        "PL STATUS - 0.1%": "CLEAR",
        "FLAG PL STATUS": "PASS",
        "LATENCY_THRESHOLD": "20",
        "LAT STATUS  NEW": "PASS",
        "JITTER STATUS": "CLEAR",
        "THI STATUS": "PASS",
        "Nama_File_Sumber": "RAWDATA_4G_2026_W33_R06JAWA TIMUR.xlsb",
    }
    row.update(overrides)
    return row


class Result:
    def __init__(self, *, rows=(), scalar=None):
        self.rows = list(rows)
        self.scalar = scalar

    def __iter__(self):
        return iter(self.rows)

    def scalar_one(self):
        return self.scalar


class SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class PacketValidationSession:
    def __init__(self):
        self.executions = []
        self.committed = False

    async def execute(self, statement, parameters=None):
        sql = str(statement)
        self.executions.append((sql, parameters))
        if "FROM public.packet_los_jatim" in sql:
            return Result(rows=[SimpleNamespace(site_id="BDO001")])
        return Result()

    async def commit(self):
        self.committed = True


class PacketCommitSession:
    def __init__(self, expected_rows: int):
        self.expected_rows = expected_rows
        self.executions = []

    async def execute(self, statement, parameters=None):
        sql = str(statement)
        self.executions.append((sql, parameters))
        if "SELECT COUNT(*)" in sql:
            return Result(scalar=self.expected_rows)
        return Result()


def test_packet_csv_maps_all_45_columns_and_period_key():
    parsed = management_imports._parse_packet_los_file(
        "Data_PL_W33_2026.csv",
        packet_csv(packet_row()),
    )

    assert parsed.metadata == {"week": 33, "date": "2026-08-20"}
    assert parsed.warnings == []
    assert len(parsed.rows) == 1
    parsed_row = parsed.rows[0]
    assert parsed_row.errors == []
    assert parsed_row.row_key == "33|2026-08-20|BDO001"
    assert len(parsed_row.payload) == 45
    assert parsed_row.payload["week"] == 33
    assert parsed_row.payload["date"] == "2026-08-20"
    assert parsed_row.payload["avg_packet_loss"] == "0.0025"
    assert parsed_row.payload["pl_aging_2"] is None
    assert parsed_row.payload["nama_file_sumber"].startswith("RAWDATA_4G")


def test_packet_csv_rejects_multiple_periods_and_duplicate_site_keys():
    with pytest.raises(ValueError, match="tepat satu WEEK dan DATE"):
        management_imports._parse_packet_los_file(
            "mixed.csv",
            packet_csv(
                packet_row(),
                packet_row(**{"SITE ID": "BDO002", "DATE": "2026-08-27"}),
            ),
        )

    parsed = management_imports._parse_packet_los_file(
        "duplicate.csv",
        packet_csv(packet_row(), packet_row()),
    )
    management_imports._mark_duplicates(parsed.rows)
    assert all("duplikat" in error.casefold() for row in parsed.rows for error in row.errors)


def test_packet_csv_marks_missing_site_and_invalid_numeric_as_invalid():
    parsed = management_imports._parse_packet_los_file(
        "invalid.csv",
        packet_csv(packet_row(**{"SITE ID": "", "AVG PACKET LOSS": "bad-number"})),
    )

    assert parsed.rows[0].row_key is None
    assert "Site ID wajib diisi" in parsed.rows[0].errors
    assert any("AVG PACKET LOSS" in error for error in parsed.rows[0].errors)


@pytest.mark.asyncio
async def test_validate_packet_import_previews_existing_site_as_update(monkeypatch):
    session = PacketValidationSession()
    monkeypatch.setattr(management_imports, "async_session", lambda: SessionContext(session))
    actor = AppUser(
        id="user-1",
        username="data-admin",
        password_hash="unused",
        role="data_admin",
    )
    upload = UploadFile(
        file=BytesIO(packet_csv(packet_row())),
        filename="Data_PL_W33_2026.csv",
    )

    result = await management_imports.validate_import("packet_los_jatim", [upload], actor)

    assert result["strategy"] == "replace_period"
    assert result["updated_rows"] == 1
    assert result["inserted_rows"] == 0
    assert result["metadata"] == {"week": 33, "date": "2026-08-20", "existing_rows": 1}
    assert result["preview_rows"][0] == {
        "source_file": "Data_PL_W33_2026.csv",
        "source_row": 2,
        "row_key": "33|2026-08-20|BDO001",
        "change_kind": "update",
        "ticket_type": None,
        "ticket_date": "2026-08-20",
        "pic": None,
        "site_id": "BDO001",
        "period": "W33 / 2026-08-20",
        "nop": "JEMBER",
        "errors": [],
    }
    assert session.committed is True


@pytest.mark.asyncio
async def test_packet_period_commit_deletes_and_reinserts_only_selected_week_date():
    parsed = management_imports._parse_packet_los_file(
        "Data_PL_W33_2026.csv",
        packet_csv(
            packet_row(),
            packet_row(**{"SITE ID": "BDO002", "SITE NAME": "Maesan"}),
        ),
    )
    staged_rows = [
        {"payload": row.payload, "change_kind": "update"}
        for row in parsed.rows
    ]
    session = PacketCommitSession(expected_rows=2)

    inserted = await management_imports._commit_packet_los_period(
        session,
        staged_rows,
        parsed.metadata,
    )

    assert inserted == 2
    sql_calls = [sql for sql, _ in session.executions]
    assert "DELETE FROM public.packet_los_jatim" in sql_calls[0]
    assert "week = :week" in sql_calls[0]
    assert "date = CAST(:date AS date)" in sql_calls[0]
    assert "INSERT INTO public.packet_los_jatim" in sql_calls[1]
    assert "SELECT COUNT(*)" in sql_calls[2]
    delete_params = session.executions[0][1]
    assert delete_params == {"week": 33, "date": date(2026, 8, 20)}
    insert_params = session.executions[1][1]
    assert len(insert_params) == 2
    assert isinstance(insert_params[0]["date"], date)
    assert insert_params[0]["avg_packet_loss"] == Decimal("0.0025")

