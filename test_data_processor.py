"""Unit tests for data_processor.py covering cleaning, aggregation, and file ops."""

import csv
import json
import tempfile
import unittest
from pathlib import Path

from data_processor import (
    archive_input_files,
    build_summary_report,
    classify_order_tier,
    discover_csv_files,
    normalize_date,
    normalize_title,
    run_pipeline,
    validate_and_clean_rows,
)


class TestNormalization(unittest.TestCase):
    def test_normalize_date_supports_multiple_formats(self) -> None:
        self.assertEqual(normalize_date("2026-10-01"), "2026-10-01")
        self.assertEqual(normalize_date("2026/10/02"), "2026-10-02")
        self.assertEqual(normalize_date("10/03/2026"), "2026-10-03")
        self.assertIsNone(normalize_date("not-a-date"))
        self.assertIsNone(normalize_date(""))

    def test_normalize_title_trims_and_collapses_spaces(self) -> None:
        self.assertEqual(normalize_title("  alice   johnson "), "Alice Johnson")
        self.assertEqual(normalize_title("OFFICE SUPPLIES"), "Office Supplies")
        self.assertEqual(normalize_title(None), "")

    def test_classify_order_tier(self) -> None:
        self.assertEqual(classify_order_tier(25.0), "Small")
        self.assertEqual(classify_order_tier(75.0), "Medium")
        self.assertEqual(classify_order_tier(200.0), "Large")


class TestValidationAndAggregation(unittest.TestCase):
    def test_validate_and_clean_rows_filters_invalid_and_duplicates(self) -> None:
        raw = [
            {
                "order_id": "ord-1",
                "order_date": "2026/10/02",
                "customer": " alice lee ",
                "category": "electronics",
                "product": "Mouse",
                "region": "europe",
                "quantity": "2",
                "unit_price": "25.50",
            },
            {
                "order_id": "ORD-1",
                "order_date": "2026-10-02",
                "customer": "Alice Lee",
                "category": "Electronics",
                "product": "Mouse",
                "region": "Europe",
                "quantity": "2",
                "unit_price": "25.50",
            },
            {
                "order_id": "ORD-2",
                "order_date": "2026-10-03",
                "customer": "",
                "category": "Office",
                "product": "Pen",
                "region": "North America",
                "quantity": "3",
                "unit_price": "5.00",
            },
            {
                "order_id": "ORD-3",
                "order_date": "2026-10-04",
                "customer": "Bob",
                "category": "Office",
                "product": "Desk",
                "region": "Europe",
                "quantity": "-1",
                "unit_price": "100",
            },
        ]

        cleaned, rejected = validate_and_clean_rows(raw)
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(cleaned[0].order_id, "ORD-1")
        self.assertEqual(cleaned[0].line_total, 51.0)
        self.assertEqual(cleaned[0].order_tier, "Small")

        self.assertEqual(len(rejected), 3)
        self.assertIn("Duplicate", rejected[0].rejection_reason)
        self.assertIn("Missing customer", rejected[1].rejection_reason)
        self.assertIn("positive", rejected[2].rejection_reason)

        summary = build_summary_report(cleaned, rejected, ["batch.csv"])
        self.assertEqual(summary["metrics"]["valid_rows"], 1)
        self.assertEqual(summary["metrics"]["rejected_rows"], 3)
        self.assertEqual(summary["metrics"]["gross_revenue"], 51.0)


class TestFileOperations(unittest.TestCase):
    def test_pipeline_writes_outputs_and_archives_input(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            input_dir = root / "inbox"
            output_dir = root / "output"
            archive_dir = root / "archive"
            input_dir.mkdir()

            sample_csv = input_dir / "batch_01.csv"
            sample_csv.write_text(
                "order_id,order_date,customer,category,product,region,quantity,unit_price\n"
                "ORD-10,2026-10-01,Jane Doe,Tech,Keyboard,Europe,2,50.00\n"
                "ORD-11,invalid,John Doe,Tech,Mouse,Europe,1,20.00\n",
                encoding="utf-8",
            )

            discovered = discover_csv_files(input_dir)
            self.assertEqual(len(discovered), 1)

            result = run_pipeline(
                input_path=input_dir,
                output_dir=output_dir,
                archive_dir=archive_dir,
                move_processed=True,
            )

            self.assertEqual(result["summary"]["metrics"]["valid_rows"], 1)
            self.assertEqual(result["summary"]["metrics"]["rejected_rows"], 1)
            self.assertTrue((output_dir / "cleaned_sales.csv").exists())
            self.assertTrue((output_dir / "rejected_rows.csv").exists())
            self.assertTrue((output_dir / "summary_report.json").exists())

            # Moved input file should no longer sit in inbox and should exist in archive
            self.assertFalse(sample_csv.exists())
            archived = list(archive_dir.rglob("batch_01*.csv"))
            self.assertEqual(len(archived), 1)

            summary_json = json.loads(
                (output_dir / "summary_report.json").read_text(encoding="utf-8")
            )
            self.assertEqual(summary_json["metrics"]["gross_revenue"], 100.0)

            with (output_dir / "cleaned_sales.csv").open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["line_total"], "100.0")

    def test_archive_input_files_handles_name_collision(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "data.csv"
            src.write_text("a,b\n1,2\n", encoding="utf-8")
            archive_dir = root / "archive"

            first = archive_input_files([src], archive_dir, move_files=False)
            second = archive_input_files([src], archive_dir, move_files=False)
            self.assertNotEqual(first[0], second[0])
            self.assertTrue(first[0].exists())
            self.assertTrue(second[0].exists())


if __name__ == "__main__":
    unittest.main()
