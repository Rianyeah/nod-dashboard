from services.management_imports import (
    FAULT_CSV_TO_COLUMN,
    _mark_duplicates,
    _parse_fault_file,
    _parse_non_inap_file,
    normalize_pic_key,
)


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
