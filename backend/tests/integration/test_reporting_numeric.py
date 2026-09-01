import os
from pathlib import Path
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine


sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


SOURCE_DDL = (
    '''
    CREATE TABLE public.traktor_data (
        id bigserial PRIMARY KEY, trx_month text, site_id text,
        rev bigint, traffic bigint, payload bigint,
        rev_voice bigint, rev_bb bigint, rev_dig bigint, rev_sms bigint, rev_ir bigint,
        pld_2g bigint, pld_3g bigint, pld_4g bigint, pld_5g bigint,
        trf_2g bigint, trf_3g bigint, trf_4g bigint
    )
    ''',
    '''
    CREATE TABLE public.data_site_master (
        row_number bigint, "Siteid" text, "Site Name" text, "Status Site" text,
        "Site Class" text, "NOP" text, "Kabupaten/KOTA" text, "Transport Type" text
    )
    ''',
    '''
    CREATE TABLE public.site_month_metrics (
        tahun integer, bulan integer, site_id text,
        total_outage_menit numeric, total_time_in_minutes numeric,
        updated_at timestamptz DEFAULT now()
    )
    ''',
    '''
    CREATE TABLE public.availability_logs_jatim (
        "Tahun" bigint, "Bulan" bigint, "SITE ID" text,
        jumlah_cell bigint, "outgage (menit)" text
    )
    ''',
    '''
    CREATE TABLE public.ticketing_fault_center (
        created_at timestamp, site_id text, nop text, kabupaten_kota text,
        kategori_tt text, backup_sukses text
    )
    ''',
    '''
    CREATE TABLE public.proker_enom_jatim_2026 (
        create_date date, site_id text, nop text, kabupaten text, status text
    )
    ''',
)


DROP_OBJECTS = (
    "public.reporting_metric_thresholds",
    "public.reporting_revenue_targets",
    "public.reporting_source_refresh",
    "public.proker_enom_jatim_2026",
    "public.ticketing_fault_center",
    "public.availability_logs_jatim",
    "public.site_month_metrics",
    "public.data_site_master",
    "public.traktor_data",
)


@pytest_asyncio.fixture
async def reporting_db_session():
    if os.getenv("RUN_REPORTING_DB_TESTS") != "1":
        pytest.skip("Reporting PostgreSQL integration service is not enabled")

    database_url = os.environ["REPORTING_TEST_DATABASE_URL"]
    engine = create_async_engine(database_url)
    async with engine.begin() as connection:
        for table in DROP_OBJECTS:
            await connection.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
        await connection.execute(text("DROP FUNCTION IF EXISTS public.touch_reporting_source_refresh() CASCADE"))
        for statement in SOURCE_DDL:
            await connection.execute(text(statement))

    session = AsyncSession(engine, expire_on_commit=False)
    try:
        from queries.reporting_foundation import ensure_reporting_foundation

        await ensure_reporting_foundation(session)
        yield session
    finally:
        await session.close()
        async with engine.begin() as connection:
            for table in DROP_OBJECTS:
                await connection.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
            await connection.execute(text("DROP FUNCTION IF EXISTS public.touch_reporting_source_refresh() CASCADE"))
        await engine.dispose()


async def _seed_numeric_facts(session):
    await session.execute(
        text(
            '''
            INSERT INTO public.data_site_master
                (row_number, "Siteid", "Site Name", "Status Site", "Site Class", "NOP", "Kabupaten/KOTA", "Transport Type")
            VALUES
                (1, 'AAA001', 'Alpha', 'Active', 'Gold', 'NOP SIDOARJO', 'SIDOARJO', 'FO'),
                (2, 'BBB001', 'Beta', 'Inactive', 'Silver', 'NOP SIDOARJO', 'SIDOARJO', 'MW')
            '''
        )
    )
    await session.execute(
        text(
            '''
            INSERT INTO public.traktor_data
                (trx_month, site_id, rev, traffic, payload, rev_voice, rev_bb, rev_dig, rev_sms, rev_ir,
                 pld_2g, pld_3g, pld_4g, pld_5g, trf_2g, trf_3g, trf_4g)
            VALUES
                ('2026-06', 'AAA001', 150, 6, 15, 10, 20, 30, 40, 50, 1, 2, 11, 1, 1, 2, 3),
                ('2026-06', 'BBB001', 100, 4, 10, 10, 20, 20, 20, 30, 1, 2, 6, 1, 1, 1, 2),
                ('2026-06', 'ZZZ001', 80, 3, 8, 10, 10, 20, 20, 20, 1, 1, 5, 1, 1, 1, 1),
                ('2026-07', 'AAA001', 200, 8, 20, 20, 30, 40, 50, 60, 2, 3, 14, 1, 2, 2, 4),
                ('2026-07', 'BBB001', 100, 4, 10, 10, 20, 20, 20, 30, 1, 2, 6, 1, 1, 1, 2),
                ('2026-07', 'ZZZ001', 100, 4, 10, 10, 20, 20, 20, 30, 1, 2, 6, 1, 1, 1, 2)
            '''
        )
    )
    await session.execute(
        text(
            '''
            INSERT INTO public.site_month_metrics
                (tahun, bulan, site_id, total_time_in_minutes, total_outage_menit)
            VALUES
                (2026, 6, 'AAA001', 1000, 5),
                (2026, 6, 'BBB001', 1000, 15),
                (2026, 6, 'ZZZ001', 1000, 20),
                (2026, 7, 'AAA001', 1000, 10),
                (2026, 7, 'BBB001', 1000, 20),
                (2026, 7, 'ZZZ001', 1000, 30)
            '''
        )
    )
    await session.execute(
        text(
            '''
            INSERT INTO public.ticketing_fault_center
                (created_at, site_id, nop, kabupaten_kota, kategori_tt, backup_sukses)
            VALUES
                ('2026-07-05', 'AAA001', 'NOP SIDOARJO', 'SIDOARJO', 'BPS', 'BU Genset'),
                ('2026-07-06', 'BBB001', 'NOP SIDOARJO', 'SIDOARJO', 'BPS', 'Gagal'),
                ('2026-07-07', 'AAA001', 'NOP SIDOARJO', 'SIDOARJO', 'TS', NULL)
            '''
        )
    )
    await session.execute(
        text(
            '''
            INSERT INTO public.proker_enom_jatim_2026
                (create_date, site_id, nop, kabupaten, status)
            VALUES
                ('2026-07-08', 'AAA001', 'NOP SIDOARJO', 'SIDOARJO', 'OPEN'),
                ('2026-07-09', 'BBB001', 'NOP SIDOARJO', 'SIDOARJO', 'CLOSE')
            '''
        )
    )
    await session.execute(
        text(
            '''
            INSERT INTO public.reporting_revenue_targets (nop_key, trx_month, target_revenue, note)
            VALUES ('SIDOARJO', '2026-07', 300, 'numeric integration fixture')
            ON CONFLICT (nop_key, trx_month) DO UPDATE
            SET target_revenue = EXCLUDED.target_revenue, note = EXCLUDED.note, updated_at = now()
            '''
        )
    )
    await session.execute(
        text(
            '''
            INSERT INTO public.reporting_metric_thresholds
                (metric, threshold_key, site_class, effective_month, threshold_value, unit, updated_by)
            VALUES
                ('availability', 'target', 'DIAMOND', '2026-01', 99.87, 'percent', 'integration'),
                ('availability', 'target', 'PLATINUM', '2026-01', 99.73, 'percent', 'integration'),
                ('availability', 'target', 'GOLD', '2026-01', 99.68, 'percent', 'integration'),
                ('availability', 'target', 'SILVER', '2026-01', 99.67, 'percent', 'integration'),
                ('availability', 'target', 'BRONZE', '2026-01', 99.73, 'percent', 'integration'),
                ('revenue', 'u30_upper', '*', '2026-01', 30000000, 'idr', 'integration'),
                ('revenue', 'u60_upper', '*', '2026-01', 60000000, 'idr', 'integration'),
                ('payload', 'target', '*', '2026-01', 15, 'tb', 'integration')
            ON CONFLICT (metric, threshold_key, site_class, effective_month) DO UPDATE
            SET threshold_value = EXCLUDED.threshold_value, updated_at = now()
            '''
        )
    )
    await session.commit()


@pytest.mark.asyncio
async def test_reporting_numbers_reconcile_across_overview_areas_drilldown_and_pivot(reporting_db_session):
    from models.reporting import ReportingPivotRequest, ReportingSiteQuery
    from periods import resolve_month_period
    from services.reporting_drilldown import load_reporting_sites
    from services.reporting_overview import load_reporting_areas, load_reporting_overview
    from services.reporting_pivot import execute_reporting_pivot

    await _seed_numeric_facts(reporting_db_session)
    period = resolve_month_period(period_start="2026-07", period_end="2026-07")
    selected = await load_reporting_overview(reporting_db_session, period, "SIDOARJO")
    regional = await load_reporting_overview(reporting_db_session, period, None)
    areas = await load_reporting_areas(reporting_db_session, period, None)

    assert regional.scorecards.total_sites == 3
    assert sum(row.total_sites for row in areas) == 3
    assert sum(row.revenue for row in areas) == regional.scorecards.total_revenue == 400
    assert sum(row.payload for row in areas) == regional.scorecards.total_payload == 40
    assert selected.scorecards.total_sites == 2
    assert selected.revenue.contribution.contribution_pct == pytest.approx(75.0)
    assert selected.payload.contribution.contribution_pct == pytest.approx(75.0)
    assert selected.availability.value == pytest.approx(98.5)
    assert selected.availability.contribution.difference_pp == pytest.approx(0.5)
    assert selected.availability.contribution.contribution_pct == pytest.approx(50.0)
    assert selected.revenue.target.complete is True
    assert selected.revenue.target.target_revenue == 300

    unmapped = await load_reporting_sites(
        reporting_db_session,
        period=period,
        nop=None,
        area_key="unmapped",
        query=ReportingSiteQuery(
            sort_by="availability",
            sort_dir="asc",
            target_status="unavailable",
        ),
    )
    assert [item.site_id for item in unmapped.items] == ["ZZZ001"]
    assert unmapped.items[0].site_class is None

    performance_pivot = await execute_reporting_pivot(
        reporting_db_session,
        ReportingPivotRequest(
            dataset="performance",
            period_start="2026-07",
            period_end="2026-07",
            rows=["mapping_status"],
            values=[
                {"field": "revenue", "aggregation": "sum"},
                {"field": "availability", "aggregation": "weighted_avg"},
            ],
        ),
    )
    assert sum(int(row.values["revenue"]) for row in performance_pivot.rows) == 400
    mapped = next(row for row in performance_pivot.rows if row.dimensions["mapping_status"] == "Mapped")
    assert mapped.values["availability"] == pytest.approx(98.5)

    ticket_pivot = await execute_reporting_pivot(
        reporting_db_session,
        ReportingPivotRequest(
            dataset="ticketing",
            period_start="2026-07",
            period_end="2026-07",
            rows=["kabupaten"],
            values=[{"field": "backup_success_rate", "aggregation": "ratio"}],
        ),
    )
    assert ticket_pivot.rows[0].values["backup_success_rate"] == pytest.approx(50.0)


@pytest.mark.asyncio
async def test_site_target_boundaries_are_evaluated_before_pagination(reporting_db_session):
    from models.reporting import ReportingSiteQuery
    from periods import resolve_month_period
    from services.reporting_drilldown import load_reporting_sites

    await _seed_numeric_facts(reporting_db_session)
    await reporting_db_session.execute(
        text(
            '''
            UPDATE public.traktor_data
            SET rev = 60000000, payload = 15728640
            WHERE trx_month = '2026-07' AND site_id = 'AAA001'
            '''
        )
    )
    await reporting_db_session.execute(
        text(
            '''
            UPDATE public.site_month_metrics
            SET total_outage_menit = 3.2
            WHERE tahun = 2026 AND bulan = 7 AND site_id = 'AAA001'
            '''
        )
    )
    await reporting_db_session.commit()
    period = resolve_month_period(period_start="2026-07", period_end="2026-07")

    achieved = await load_reporting_sites(
        reporting_db_session,
        period=period,
        nop="SIDOARJO",
        area_key="SIDOARJO",
        query=ReportingSiteQuery(target_status="achieved", page_size=1),
    )
    missed = await load_reporting_sites(
        reporting_db_session,
        period=period,
        nop="SIDOARJO",
        area_key="SIDOARJO",
        query=ReportingSiteQuery(target_status="not_achieved", page_size=1),
    )

    assert achieved.total == 1
    assert achieved.items[0].site_id == "AAA001"
    assert achieved.items[0].availability_target_status == "achieved"
    assert achieved.items[0].revenue_band == "achieved"
    assert achieved.items[0].payload_target_status == "achieved"
    assert achieved.items[0].overall_target_status == "achieved"
    assert missed.total == 1
    assert missed.items[0].site_id == "BBB001"


@pytest.mark.asyncio
async def test_reporting_availability_falls_back_to_raw_log_when_cache_row_is_missing(reporting_db_session):
    from periods import resolve_month_period
    from services.reporting_overview import load_reporting_overview

    await _seed_numeric_facts(reporting_db_session)
    await reporting_db_session.execute(
        text("INSERT INTO public.traktor_data (trx_month, site_id, rev, traffic, payload) VALUES ('2026-08', 'AAA001', 10, 1, 1)")
    )
    await reporting_db_session.execute(
        text(
            '''
            INSERT INTO public.availability_logs_jatim
                ("Tahun", "Bulan", "SITE ID", jumlah_cell, "outgage (menit)")
            VALUES (2026, 8, 'AAA001', 1, '446.4')
            '''
        )
    )
    await reporting_db_session.commit()

    overview = await load_reporting_overview(
        reporting_db_session,
        resolve_month_period(period_start="2026-08", period_end="2026-08"),
        "SIDOARJO",
    )

    assert overview.scorecards.total_sites == 1
    assert overview.availability.value == pytest.approx(99.0)


@pytest.mark.asyncio
async def test_mapped_site_with_blank_nop_stays_in_its_kabupaten_not_unmapped(reporting_db_session):
    from models.reporting import ReportingSiteQuery
    from periods import resolve_month_period
    from services.reporting_drilldown import load_reporting_sites

    await _seed_numeric_facts(reporting_db_session)
    await reporting_db_session.execute(
        text(
            '''
            INSERT INTO public.data_site_master
                (row_number, "Siteid", "Site Name", "Status Site", "Site Class", "NOP", "Kabupaten/KOTA", "Transport Type")
            VALUES (3, 'CCC001', 'Gamma', 'Active', 'Bronze', NULL, 'GRESIK', 'FO')
            '''
        )
    )
    await reporting_db_session.execute(
        text("INSERT INTO public.traktor_data (trx_month, site_id, rev, traffic, payload) VALUES ('2026-07', 'CCC001', 20, 1, 2)")
    )
    await reporting_db_session.commit()
    period = resolve_month_period(period_start="2026-07", period_end="2026-07")

    gresik = await load_reporting_sites(
        reporting_db_session,
        period=period,
        nop=None,
        area_key="GRESIK",
        query=ReportingSiteQuery(),
    )
    unmapped = await load_reporting_sites(
        reporting_db_session,
        period=period,
        nop=None,
        area_key="unmapped",
        query=ReportingSiteQuery(),
    )

    assert [item.site_id for item in gresik.items] == ["CCC001"]
    assert "CCC001" not in [item.site_id for item in unmapped.items]
