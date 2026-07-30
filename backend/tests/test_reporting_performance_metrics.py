from models.reporting import RevenueByKabupaten


def test_revenue_row_accepts_bps_backup_success_fields():
    row = RevenueByKabupaten(
        kabupaten="SIDOARJO",
        ticket_swfm_bps=20,
        backup_sukses_bps=5,
        backup_sukses_rate=25.0,
    )

    assert row.backup_sukses_bps == 5
    assert row.backup_sukses_rate == 25.0


def test_revenue_row_defaults_backup_success_safely():
    row = RevenueByKabupaten(kabupaten="SIDOARJO")

    assert row.backup_sukses_bps == 0
    assert row.backup_sukses_rate == 0.0
