"""
Load the repository mock data through the real ingestion pipeline.

This deliberately reuses ``ingest_payload`` rather than bulk-inserting rows, so the
seeded records carry exactly the same immutable evidence, derivation metadata, and
review states a live upload would produce. It exists so a reviewer can populate the
analyst dashboard in one command (README "Loading Mock Data").
"""
import csv
import json
import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from ledger.models import SourceType
from ledger.services.ingestion_service import IngestionValidationError, ingest_payload

MOCK_FILES = ("sap_export.csv", "utility_bill.csv", "concur_webhook.json")


def _candidate_dirs(explicit):
    """
    Yield mock_data directory candidates in priority order.

    Resolution is environment-agnostic so the command works both inside the container
    (mock_data is copied next to the Django project at ``/app/mock_data``) and in a
    local checkout (``<repo_root>/mock_data``), without hardcoded absolute paths.
    """
    if explicit:
        yield Path(explicit)
        return

    env_dir = os.environ.get("MOCK_DATA_DIR")
    if env_dir:
        yield Path(env_dir)

    # Container image: Dockerfile copies mock_data into the project root (BASE_DIR=/app).
    yield Path(settings.BASE_DIR) / "mock_data"

    # Local checkout: backend/ledger/management/commands/ -> repository root.
    yield Path(__file__).resolve().parents[4] / "mock_data"


def _resolve_mock_dir(explicit):
    tried = []
    for candidate in _candidate_dirs(explicit):
        tried.append(str(candidate))
        if candidate.is_dir():
            return candidate
    raise CommandError(
        "Could not locate the mock_data directory. Tried: " + ", ".join(tried) + ". "
        "Pass --mock-dir or set MOCK_DATA_DIR."
    )


class Command(BaseCommand):
    help = "Ingest mock SAP, utility, and travel data via the ingestion service."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-id", type=int, default=1)
        parser.add_argument(
            "--mock-dir",
            type=str,
            default=None,
            help="Directory containing sap_export.csv, utility_bill.csv, concur_webhook.json.",
        )

    def handle(self, *args, **options):
        tenant_id = options["tenant_id"]
        mock_dir = _resolve_mock_dir(options["mock_dir"])
        self.stdout.write(f"Using mock data directory: {mock_dir}")

        missing = [name for name in MOCK_FILES if not (mock_dir / name).is_file()]
        if len(missing) == len(MOCK_FILES):
            raise CommandError(
                f"No mock data files found in {mock_dir}. Expected: {', '.join(MOCK_FILES)}."
            )
        for name in missing:
            self.stderr.write(f"Warning: {name} not found in {mock_dir}; skipping.")

        payloads = []
        payloads += [(SourceType.SAP, row) for row in self._read_csv(mock_dir / "sap_export.csv")]
        payloads += [(SourceType.UTILITY, row) for row in self._read_csv(mock_dir / "utility_bill.csv")]
        payloads += [(SourceType.TRAVEL, row) for row in self._read_json(mock_dir / "concur_webhook.json")]

        if not payloads:
            raise CommandError(f"Mock data files in {mock_dir} contained no rows to ingest.")

        created = 0
        failed = 0
        for source_type, payload in payloads:
            try:
                result = ingest_payload(source_type, payload, tenant_id=tenant_id)
            except IngestionValidationError as exc:
                failed += 1
                self.stderr.write(f"[{source_type}] rejected: {exc}")
                continue

            if result["errors"]:
                failed += 1
                self.stdout.write(f"[{source_type}] FLAGGED/FAILED: {result['errors']}")
            else:
                created += len(result["normalized_record_ids"])
                self.stdout.write(f"[{source_type}] ok -> {result['status']}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Mock data ingested for tenant {tenant_id}: "
                f"{created} normalized records created, {failed} payloads with errors."
            )
        )

    @staticmethod
    def _read_csv(path):
        if not path.exists():
            return []
        with path.open(newline="", encoding="utf-8") as handle:
            return list(csv.DictReader(handle))

    @staticmethod
    def _read_json(path):
        if not path.exists():
            return []
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
