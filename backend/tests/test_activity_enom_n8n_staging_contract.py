import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = ROOT / "backend" / "sql" / "activity_enom_staging.sql"
DOC_PATH = ROOT / "docs" / "activity_enom_n8n.md"


class ActivityEnomN8nStagingContractTests(unittest.TestCase):
    def test_migration_defines_batch_staging_and_atomic_replacement(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8")

        required_fragments = (
            "CREATE TABLE IF NOT EXISTS public.proker_enom_jatim_2026_stage",
            "PRIMARY KEY (batch_id, sheet_row_number)",
            "CREATE OR REPLACE FUNCTION public.replace_proker_enom_jatim_2026_month",
            "pg_advisory_xact_lock",
            "Staged row count",
            "DELETE FROM public.proker_enom_jatim_2026",
            "DELETE FROM public.proker_enom_jatim_2026_stage",
        )

        for fragment in required_fragments:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, sql)

    def test_documentation_uses_monthly_batch_replacement(self):
        content = DOC_PATH.read_text(encoding="utf-8")

        required_fragments = (
            "Staging + Atomic Monthly Replace",
            "batch_id",
            "Run Once for All Items",
            "replace_proker_enom_jatim_2026_month",
            "expected_rows",
        )

        for fragment in required_fragments:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, content)

        self.assertNotIn("ON CONFLICT (unique_activity) DO UPDATE", content)


if __name__ == "__main__":
    unittest.main()
