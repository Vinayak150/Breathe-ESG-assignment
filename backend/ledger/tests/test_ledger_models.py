from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from ledger.models import (
    AuditLockedRecordError,
    ImmutableEvidenceError,
    NormalizedEmissionRecord,
    RawIngestionPayload,
    ReviewStatus,
    SourceType,
)
from ledger.services.approval import approve_normalized_record


def create_raw_payload(**overrides):
    data = {
        "tenant_id": 1,
        "source_type": SourceType.SAP,
        "raw_data": {"WERKS": "BLR1", "MENGE": "100.00", "MEINS": "L"},
        "parser_version": "sap-alv-v1",
    }
    data.update(overrides)
    return RawIngestionPayload.objects.create(**data)


class RawIngestionPayloadTests(TestCase):
    def test_ingestion_hash_is_deterministic(self):
        raw = create_raw_payload()

        duplicate = RawIngestionPayload(
            tenant_id=raw.tenant_id,
            source_type=raw.source_type,
            raw_data={"MEINS": "L", "MENGE": "100.00", "WERKS": "BLR1"},
            parser_version=raw.parser_version,
        )

        self.assertEqual(raw.ingestion_hash, duplicate.compute_ingestion_hash())

    def test_raw_payload_rejects_updates(self):
        raw = create_raw_payload()
        raw.raw_data = {"WERKS": "CHANGED"}

        with self.assertRaises(ImmutableEvidenceError):
            raw.save()

    def test_raw_payload_rejects_delete(self):
        raw = create_raw_payload()

        with self.assertRaises(ImmutableEvidenceError):
            raw.delete()


class NormalizedEmissionRecordTests(TestCase):
    def test_scope_constraint_rejects_invalid_scope(self):
        raw = create_raw_payload()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                NormalizedEmissionRecord.objects.create(
                    raw_payload=raw,
                    scope=4,
                    consumption_value=Decimal("10.0000"),
                    unit="kWh",
                )

    def test_approve_transition_persists_history_and_locks_record(self):
        raw = create_raw_payload()
        record = NormalizedEmissionRecord.objects.create(
            raw_payload=raw,
            scope=1,
            consumption_value=Decimal("42.0000"),
            unit="L",
        )

        approved = approve_normalized_record(record)

        self.assertEqual(approved.status, ReviewStatus.APPROVED)
        self.assertEqual(approved.emission_factor_version, "v1")
        self.assertEqual(approved.history.count(), 2)

        approved.unit = "kWh"
        with self.assertRaises(AuditLockedRecordError):
            approved.save()

    def test_approved_record_delete_is_blocked(self):
        raw = create_raw_payload()
        record = NormalizedEmissionRecord.objects.create(
            raw_payload=raw,
            scope=2,
            consumption_value=Decimal("500.0000"),
            unit="kWh",
        )
        approved = approve_normalized_record(record)

        with self.assertRaises(AuditLockedRecordError):
            approved.delete()
