from datetime import date
import unittest

from ticketing_metrics import rank_fop_performance, resolve_trend_granularity


class TicketingMetricsTest(unittest.TestCase):
    def test_month_periods_choose_daily_weekly_and_monthly_trends(self):
        self.assertEqual(resolve_trend_granularity(month_count=1), "day")
        self.assertEqual(resolve_trend_granularity(month_count=2), "week")
        self.assertEqual(resolve_trend_granularity(month_count=3), "week")
        self.assertEqual(resolve_trend_granularity(month_count=4), "month")

    def test_custom_date_boundaries_choose_expected_trend_granularity(self):
        self.assertEqual(
            resolve_trend_granularity(
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 31),
            ),
            "day",
        )
        self.assertEqual(
            resolve_trend_granularity(
                start_date=date(2026, 1, 1),
                end_date=date(2026, 2, 1),
            ),
            "week",
        )
        self.assertEqual(
            resolve_trend_granularity(
                start_date=date(2026, 1, 1),
                end_date=date(2026, 4, 3),
            ),
            "week",
        )
        self.assertEqual(
            resolve_trend_granularity(
                start_date=date(2026, 1, 1),
                end_date=date(2026, 4, 4),
            ),
            "month",
        )

    def test_fop_score_uses_confirmed_weights_and_inverse_response(self):
        ranked = rank_fop_performance([
            {
                "pic": "Volume",
                "takeover_tickets": 10,
                "visitation_tickets": 0,
                "backup_sukses_tickets": 0,
                "average_response_minutes": 30.0,
            },
            {
                "pic": "Speed",
                "takeover_tickets": 0,
                "visitation_tickets": 10,
                "backup_sukses_tickets": 10,
                "average_response_minutes": 10.0,
            },
        ])

        self.assertEqual(ranked[0]["pic"], "Volume")
        self.assertEqual(ranked[0]["performance_score"], 50.0)
        self.assertEqual(ranked[1]["pic"], "Speed")
        self.assertEqual(ranked[1]["performance_score"], 50.0)
        self.assertEqual([row["rank"] for row in ranked], [1, 2])

    def test_fop_score_handles_equal_zero_counts_and_missing_response(self):
        ranked = rank_fop_performance([
            {
                "pic": "Valid",
                "takeover_tickets": 5,
                "visitation_tickets": 0,
                "backup_sukses_tickets": 0,
                "average_response_minutes": 20.0,
            },
            {
                "pic": "Missing",
                "takeover_tickets": 5,
                "visitation_tickets": 0,
                "backup_sukses_tickets": 0,
                "average_response_minutes": None,
            },
        ])

        self.assertEqual(ranked[0]["pic"], "Valid")
        self.assertEqual(ranked[0]["performance_score"], 60.0)
        self.assertEqual(ranked[1]["pic"], "Missing")
        self.assertEqual(ranked[1]["performance_score"], 50.0)

    def test_fop_ranking_uses_deterministic_business_tie_breakers(self):
        ranked = rank_fop_performance([
            {
                "pic": "Zulu",
                "takeover_tickets": 3,
                "visitation_tickets": 2,
                "backup_sukses_tickets": 1,
                "average_response_minutes": None,
            },
            {
                "pic": "Alpha",
                "takeover_tickets": 3,
                "visitation_tickets": 2,
                "backup_sukses_tickets": 1,
                "average_response_minutes": None,
            },
        ])

        self.assertEqual([row["pic"] for row in ranked], ["Alpha", "Zulu"])
        self.assertEqual([row["rank"] for row in ranked], [1, 2])


if __name__ == "__main__":
    unittest.main()
