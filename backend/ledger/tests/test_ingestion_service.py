from django.test import TestCase

from ledger.models import NormalizedEmissionRecord, RawIngestionPayload, ReviewStatus, SourceType
from ledger.services.ingestion_service import IngestionValidationError, ingest_payload


class IngestionServiceTests(TestCase):
    def test_successful_routing_creates_raw_and_normalized_records(self):
        result = ingest_payload(
            SourceType.SAP,
            {"BUKRS": "1000", "WERKS": "BLR1", "MENGE": "10", "MEINS": "GAL"},
        )

        self.assertEqual(result["errors"], [])
        self.assertEqual(result["status"], ReviewStatus.PENDING)
        self.assertEqual(RawIngestionPayload.objects.count(), 1)
        self.assertEqual(NormalizedEmissionRecord.objects.count(), 1)

        record = NormalizedEmissionRecord.objects.get()
        self.assertEqual(record.scope, 1)
        self.assertEqual(record.unit, "L")
        self.assertEqual(record.emission_factor_version, "v1")
        self.assertEqual(record.normalization_metadata["normalization"], "GAL_TO_L")
        self.assertEqual(record.normalization_metadata["source_unit"], "GAL")
        self.assertEqual(record.normalization_metadata["parser_version"], "sap-alv-v1")

    def test_travel_derivation_metadata_is_persisted(self):
        ingest_payload(SourceType.TRAVEL, {"origin_iata": "JFK", "destination_iata": "LHR"})

        record = NormalizedEmissionRecord.objects.get()
        self.assertTrue(record.normalization_metadata["distance_is_derived"])
        self.assertEqual(record.normalization_metadata["distance_method"], "HAVERSINE")

    def test_utility_allocation_metadata_is_persisted_per_projection(self):
        ingest_payload(
            SourceType.UTILITY,
            {
                "meter_identifier": "MTR-001",
                "start_date": "2024-01-14",
                "end_date": "2024-02-12",
                "consumption_value": "2900",
                "unit": "kWh",
            },
        )

        records = NormalizedEmissionRecord.objects.order_by("created_at")
        self.assertEqual(records.count(), 2)
        self.assertEqual(records[0].normalization_metadata["allocation"]["month"], "2024-01")
        self.assertEqual(records[0].normalization_metadata["billing_period_days"], 29)

    def test_validation_failure_preserves_raw_payload_without_projection(self):
        result = ingest_payload(
            SourceType.UTILITY,
            {
                "meter_identifier": "MTR-001",
                "start_date": "2024-02-12",
                "end_date": "2024-01-14",
                "consumption_value": "1000",
                "unit": "kWh",
            },
        )

        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(result["errors"], ["end_date must be after start_date."])
        self.assertEqual(RawIngestionPayload.objects.count(), 1)
        self.assertEqual(NormalizedEmissionRecord.objects.count(), 0)

    def test_unknown_source_type_is_rejected_before_evidence_creation(self):
        with self.assertRaises(IngestionValidationError):
            ingest_payload("UNKNOWN", {"value": "test"})

        self.assertEqual(RawIngestionPayload.objects.count(), 0)
