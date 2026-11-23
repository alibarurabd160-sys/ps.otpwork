#!/usr/bin/env python3
"""Data Processing and File Manipulation Pipeline.

Demonstrates idiomatic Python 3 standard-library capabilities:
1. File manipulation via pathlib and shutil (directory scanning, output
   scaffolding, safe path confinement, and timestamped archiving).
2. CSV ingestion, cleaning, date normalization, deduplication, and validation.
3. Quarantine of malformed rows with explicit rejection reasons.
4. Aggregation of revenue, unit counts, and breakdowns into JSON + CSV reports.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import shutil
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

logger = logging.getLogger("data_processor")

SUPPORTED_DATE_FORMATS = (
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%d/%m/%Y",
)

SAMPLE_CSV_CONTENT = """order_id,order_date,customer,category,product,region,quantity,unit_price
ORD-1001,2026-10-01,  alice johnson ,electronics,Wireless Mouse,north america,2,29.99
ORD-1002,2026/10/02,Bob Smith,OFFICE SUPPLIES,Standing Desk Mat,Europe,1,54.50
ORD-1003,10/03/2026,clara chen,Electronics,USB-C Hub,asia pacific,3,42.00
ORD-1004,2026-10-04,David Kim,Furniture,Ergonomic Chair,North America,1,320.00
ORD-1001,2026-10-01,Alice Johnson,Electronics,Wireless Mouse,North America,2,29.99
ORD-1005,2026-10-05,,Electronics,Mechanical Keyboard,Europe,1,115.00
ORD-1006,2026-10-06,Elena Rossi,Office Supplies,Notebook Pack,Europe,-4,12.50
ORD-1007,bad-date,Frank Miller,Furniture,Monitor Stand,North America,2,45.00
ORD-1008,2026-10-08,grace lee,electronics,4K Webcam,Asia Pacific,2,89.95
ORD-1009,2026-10-09,Henry Patel,furniture,Desk Lamp,Europe,4,36.25
ORD-1010,2026-10-10,Irene Novak,Office Supplies,Gel Pen Set,North America,5,abc
ORD-1011,2026-10-11,james wright,Electronics,Noise-Canceling Headphones,North America,1,249.00
"""


@dataclass(frozen=True)
class CleanedRecord:
    order_id: str
    order_date: str
    customer: str
    category: str
    product: str
    region: str
    quantity: int
    unit_price: float
    line_total: float
    order_tier: str


@dataclass(frozen=True)
class RejectedRecord:
    row_number: int
    order_id: str
    raw_data: str
    rejection_reason: str


def normalize_text(value: str | None) -> str:
    """Trim outer whitespace and collapse internal spacing."""
    if not value:
        return ""
    return " ".join(value.strip().split())


def normalize_title(value: str | None) -> str:
    """Normalize text to clean title case."""
    cleaned = normalize_text(value)
    return cleaned.title() if cleaned else ""


def normalize_date(raw_date: str | None) -> str | None:
    """Parse common date formats and return ISO-8601 YYYY-MM-DD."""
    cleaned = normalize_text(raw_date)
    if not cleaned:
        return None
    for fmt in SUPPORTED_DATE_FORMATS:
        try:
            parsed = datetime.strptime(cleaned, fmt)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def classify_order_tier(line_total: float) -> str:
    """Categorize order size based on line total value."""
    if line_total >= 200.0:
        return "Large"
    if line_total >= 75.0:
        return "Medium"
    return "Small"


def validate_and_clean_rows(
    rows: Iterable[dict[str, str]],
) -> tuple[list[CleanedRecord], list[RejectedRecord]]:
    """Validate, deduplicate, and normalize raw CSV row dictionaries."""
    cleaned_records: list[CleanedRecord] = []
    rejected_records: list[RejectedRecord] = []
    seen_order_ids: set[str] = set()

    for idx, row in enumerate(rows, start=2):
        order_id = normalize_text(row.get("order_id")).upper()
        raw_snapshot = json.dumps(row, ensure_ascii=False)

        if not order_id:
            rejected_records.append(
                RejectedRecord(idx, "", raw_snapshot, "Missing order_id")
            )
            continue

        if order_id in seen_order_ids:
            rejected_records.append(
                RejectedRecord(
                    idx, order_id, raw_snapshot, f"Duplicate order_id ({order_id})"
                )
            )
            continue

        iso_date = normalize_date(row.get("order_date"))
        if not iso_date:
            rejected_records.append(
                RejectedRecord(
                    idx,
                    order_id,
                    raw_snapshot,
                    f"Invalid order_date ({normalize_text(row.get('order_date'))})",
                )
            )
            continue

        customer = normalize_title(row.get("customer"))
        if not customer:
            rejected_records.append(
                RejectedRecord(idx, order_id, raw_snapshot, "Missing customer name")
            )
            continue

        category = normalize_title(row.get("category")) or "Uncategorized"
        product = normalize_text(row.get("product"))
        if not product:
            rejected_records.append(
                RejectedRecord(idx, order_id, raw_snapshot, "Missing product name")
            )
            continue

        region = normalize_title(row.get("region")) or "Unspecified"

        try:
            quantity = int(normalize_text(row.get("quantity")))
        except (TypeError, ValueError):
            rejected_records.append(
                RejectedRecord(
                    idx,
                    order_id,
                    raw_snapshot,
                    f"Non-integer quantity ({normalize_text(row.get('quantity'))})",
                )
            )
            continue

        if quantity <= 0:
            rejected_records.append(
                RejectedRecord(
                    idx,
                    order_id,
                    raw_snapshot,
                    f"Quantity must be positive (got {quantity})",
                )
            )
            continue

        try:
            unit_price = round(float(normalize_text(row.get("unit_price"))), 2)
        except (TypeError, ValueError):
            rejected_records.append(
                RejectedRecord(
                    idx,
                    order_id,
                    raw_snapshot,
                    f"Invalid unit_price ({normalize_text(row.get('unit_price'))})",
                )
            )
            continue

        if unit_price < 0:
            rejected_records.append(
                RejectedRecord(
                    idx,
                    order_id,
                    raw_snapshot,
                    f"unit_price cannot be negative (got {unit_price})",
                )
            )
            continue

        seen_order_ids.add(order_id)
        line_total = round(quantity * unit_price, 2)
        cleaned_records.append(
            CleanedRecord(
                order_id=order_id,
                order_date=iso_date,
                customer=customer,
                category=category,
                product=product,
                region=region,
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
                order_tier=classify_order_tier(line_total),
            )
        )

    cleaned_records.sort(key=lambda item: (item.order_date, item.order_id))
    return cleaned_records, rejected_records


def build_summary_report(
    cleaned: list[CleanedRecord],
    rejected: list[RejectedRecord],
    source_files: list[str],
) -> dict[str, object]:
    """Aggregate cleaned and rejected records into structured metrics."""
    total_revenue = round(sum(r.line_total for r in cleaned), 2)
    total_units = sum(r.quantity for r in cleaned)
    avg_order_value = round(total_revenue / len(cleaned), 2) if cleaned else 0.0

    by_category: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"orders": 0, "units": 0, "revenue": 0.0}
    )
    by_region: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"orders": 0, "units": 0, "revenue": 0.0}
    )
    product_revenue: dict[str, float] = defaultdict(float)

    for rec in cleaned:
        cat = by_category[rec.category]
        cat["orders"] = int(cat["orders"]) + 1
        cat["units"] = int(cat["units"]) + rec.quantity
        cat["revenue"] = round(float(cat["revenue"]) + rec.line_total, 2)

        reg = by_region[rec.region]
        reg["orders"] = int(reg["orders"]) + 1
        reg["units"] = int(reg["units"]) + rec.quantity
        reg["revenue"] = round(float(reg["revenue"]) + rec.line_total, 2)

        product_revenue[rec.product] = round(
            product_revenue[rec.product] + rec.line_total, 2
        )

    top_products = [
        {"product": name, "revenue": rev}
        for name, rev in sorted(
            product_revenue.items(), key=lambda item: item[1], reverse=True
        )[:5]
    ]

    return {
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_files": source_files,
        "metrics": {
            "total_input_rows": len(cleaned) + len(rejected),
            "valid_rows": len(cleaned),
            "rejected_rows": len(rejected),
            "total_units_sold": total_units,
            "gross_revenue": total_revenue,
            "average_order_value": avg_order_value,
        },
        "by_category": dict(
            sorted(by_category.items(), key=lambda item: item[1]["revenue"], reverse=True)
        ),
        "by_region": dict(
            sorted(by_region.items(), key=lambda item: item[1]["revenue"], reverse=True)
        ),
        "top_products": top_products,
    }


def discover_csv_files(input_path: Path) -> list[Path]:
    """Return a sorted list of CSV files from either a file or directory path."""
    if not input_path.exists():
        raise FileNotFoundError(f"Input path does not exist: {input_path}")
    if input_path.is_file():
        if input_path.suffix.lower() != ".csv":
            raise ValueError(f"Expected a .csv file, got: {input_path.name}")
        return [input_path]
    files = sorted(p for p in input_path.glob("*.csv") if p.is_file())
    if not files:
        raise FileNotFoundError(f"No .csv files found in directory: {input_path}")
    return files


def read_csv_rows(files: list[Path]) -> list[dict[str, str]]:
    """Read rows from one or more UTF-8 CSV files."""
    combined_rows: list[dict[str, str]] = []
    for csv_file in files:
        with csv_file.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                continue
            for row in reader:
                combined_rows.append(row)
    return combined_rows


def write_outputs(
    output_dir: Path,
    cleaned: list[CleanedRecord],
    rejected: list[RejectedRecord],
    summary: dict[str, object],
) -> dict[str, Path]:
    """Write cleaned CSV, rejected rows CSV, and JSON summary to output_dir."""
    output_dir.mkdir(parents=True, exist_ok=True)

    cleaned_path = output_dir / "cleaned_sales.csv"
    rejected_path = output_dir / "rejected_rows.csv"
    summary_path = output_dir / "summary_report.json"

    cleaned_fields = [
        "order_id",
        "order_date",
        "customer",
        "category",
        "product",
        "region",
        "quantity",
        "unit_price",
        "line_total",
        "order_tier",
    ]
    with cleaned_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=cleaned_fields)
        writer.writeheader()
        for record in cleaned:
            writer.writerow(asdict(record))

    rejected_fields = ["row_number", "order_id", "rejection_reason", "raw_data"]
    with rejected_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=rejected_fields)
        writer.writeheader()
        for record in rejected:
            writer.writerow(asdict(record))

    with summary_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)
        handle.write("\n")

    return {
        "cleaned_csv": cleaned_path,
        "rejected_csv": rejected_path,
        "summary_json": summary_path,
    }


def archive_input_files(
    files: list[Path],
    archive_dir: Path,
    move_files: bool = False,
) -> list[Path]:
    """Copy or move processed input files into a date-stamped archive folder."""
    date_folder = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    destination_dir = archive_dir / date_folder
    destination_dir.mkdir(parents=True, exist_ok=True)

    archived_paths: list[Path] = []
    for src in files:
        target = destination_dir / src.name
        if target.exists():
            stamp = datetime.now(timezone.utc).strftime("%H%M%S")
            target = destination_dir / f"{src.stem}_{stamp}{src.suffix}"
        if move_files:
            shutil.move(str(src), str(target))
        else:
            shutil.copy2(src, target)
        archived_paths.append(target)
    return archived_paths


def ensure_sample_dataset(sample_path: Path) -> Path:
    """Create a sample CSV file if none exists yet."""
    sample_path.parent.mkdir(parents=True, exist_ok=True)
    if not sample_path.exists():
        sample_path.write_text(SAMPLE_CSV_CONTENT, encoding="utf-8")
    return sample_path


def run_pipeline(
    input_path: Path,
    output_dir: Path,
    archive_dir: Path | None = None,
    move_processed: bool = False,
) -> dict[str, object]:
    """Execute the full file-discovery, cleaning, reporting, and archiving pipeline."""
    csv_files = discover_csv_files(input_path)
    raw_rows = read_csv_rows(csv_files)
    cleaned, rejected = validate_and_clean_rows(raw_rows)

    source_names = [f.name for f in csv_files]
    summary = build_summary_report(cleaned, rejected, source_names)
    written_files = write_outputs(output_dir, cleaned, rejected, summary)

    archived: list[Path] = []
    if archive_dir is not None:
        archived = archive_input_files(csv_files, archive_dir, move_files=move_processed)

    return {
        "summary": summary,
        "cleaned_records": [asdict(r) for r in cleaned],
        "rejected_records": [asdict(r) for r in rejected],
        "written_files": {k: str(v) for k, v in written_files.items()},
        "archived_files": [str(p) for p in archived],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean sales CSV files, generate summary reports, and archive inputs."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("sample_data/sales_raw.csv"),
        help="Input CSV file or directory containing CSV files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("output"),
        help="Directory where cleaned CSV, rejected CSV, and JSON summary are saved.",
    )
    parser.add_argument(
        "--archive",
        type=Path,
        default=Path("archive"),
        help="Directory where processed inputs are archived (pass --no-archive to skip).",
    )
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Skip archiving processed input files.",
    )
    parser.add_argument(
        "--move-processed",
        action="store_true",
        help="Move input files to the archive directory instead of copying them.",
    )
    parser.add_argument(
        "--generate-sample",
        action="store_true",
        help="Create sample_data/sales_raw.csv before running the pipeline.",
    )
    parser.add_argument(
        "--json-stdout",
        action="store_true",
        help="Print full machine-readable JSON result to stdout.",
    )
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()

    if args.generate_sample or (
        args.input == Path("sample_data/sales_raw.csv") and not args.input.exists()
    ):
        ensure_sample_dataset(args.input)

    archive_target = None if args.no_archive else args.archive
    result = run_pipeline(
        input_path=args.input,
        output_dir=args.output,
        archive_dir=archive_target,
        move_processed=args.move_processed,
    )

    if args.json_stdout:
        print(json.dumps(result, indent=2))
    else:
        metrics = result["summary"]["metrics"]
        logger.info("Processed %s input rows", metrics["total_input_rows"])
        logger.info(
            "Valid rows: %s | Rejected rows: %s | Gross revenue: $%.2f",
            metrics["valid_rows"],
            metrics["rejected_rows"],
            metrics["gross_revenue"],
        )
        for label, path_str in result["written_files"].items():
            logger.info("Wrote %s -> %s", label, path_str)
        for archived_str in result["archived_files"]:
            logger.info("Archived input -> %s", archived_str)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
