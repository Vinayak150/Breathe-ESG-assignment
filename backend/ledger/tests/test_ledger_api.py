from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from ledger.models import NormalizedEmissionRecord, RawIngestionPayload, ReviewStatus, SourceType


class LedgerApiTests(APITestCase):
    def test_approve_endpoint_transitions_record_to_approved(self):
        raw = RawIngestionPayload.objects.create(
            source_type=SourceType.UTILITY,
            raw_data={"meter": "MTR-001", "usage": "1000", "unit": "kWh"},
            parser_version="utility-csv-v1",
        )
        record = NormalizedEmissionRecord.objects.create(
            raw_payload=raw,
            scope=2,
            consumption_value=Decimal("1000.0000"),
            unit="kWh",
        )

        response = self.client.patch(f"/api/normalized-records/{record.id}/approve/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        record.refresh_from_db()
        self.assertEqual(record.status, ReviewStatus.APPROVED)
        self.assertEqual(response.data["status"], ReviewStatus.APPROVED)
        self.assertEqual(response.data["emission_factor_version"], "v1")

    def test_raw_payload_update_route_is_not_exposed(self):
        raw = RawIngestionPayload.objects.create(
            source_type=SourceType.TRAVEL,
            raw_data={"start_airport_code": "BLR", "end_airport_code": "LHR"},
            parser_version="travel-json-v1",
        )

        response = self.client.patch(
            f"/api/raw-payloads/{raw.id}/",
            {"raw_data": {"tampered": True}},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_ingest_endpoint_routes_to_service(self):
        response = self.client.post(
            "/api/ingest/",
            {
                "source_type": "TRAVEL",
                "payload": {"origin_iata": "JFK", "destination_iata": "LHR"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["errors"], [])
        self.assertEqual(response.data["status"], ReviewStatus.PENDING)
        self.assertEqual(len(response.data["normalized_record_ids"]), 1)

    def test_normalized_list_is_scoped_to_tenant_and_carries_source_type(self):
        tenant_one = RawIngestionPayload.objects.create(
            tenant_id=1,
            source_type=SourceType.SAP,
            raw_data={"WERKS": "BLR1", "MENGE": "10", "MEINS": "L"},
            parser_version="sap-alv-v1",
        )
        NormalizedEmissionRecord.objects.create(
            raw_payload=tenant_one,
            scope=1,
            consumption_value=Decimal("10.0000"),
            unit="L",
        )
        tenant_two = RawIngestionPayload.objects.create(
            tenant_id=2,
            source_type=SourceType.UTILITY,
            raw_data={"meter": "X", "usage": "5"},
            parser_version="utility-portal-csv-v1",
        )
        NormalizedEmissionRecord.objects.create(
            raw_payload=tenant_two,
            scope=2,
            consumption_value=Decimal("5.0000"),
            unit="kWh",
        )

        default_response = self.client.get("/api/normalized-records/")
        self.assertEqual(len(default_response.data), 1)
        self.assertEqual(default_response.data[0]["source_type"], SourceType.SAP)
        self.assertEqual(default_response.data[0]["tenant_id"], 1)

        tenant_two_response = self.client.get(
            "/api/normalized-records/", HTTP_X_TENANT_ID="2"
        )
        self.assertEqual(len(tenant_two_response.data), 1)
        self.assertEqual(tenant_two_response.data[0]["tenant_id"], 2)

    def test_cross_tenant_approval_is_not_found(self):
        other_tenant = RawIngestionPayload.objects.create(
            tenant_id=2,
            source_type=SourceType.SAP,
            raw_data={"WERKS": "BLR1", "MENGE": "10", "MEINS": "L"},
            parser_version="sap-alv-v1",
        )
        record = NormalizedEmissionRecord.objects.create(
            raw_payload=other_tenant,
            scope=1,
            consumption_value=Decimal("10.0000"),
            unit="L",
        )

        response = self.client.patch(f"/api/normalized-records/{record.id}/approve/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        record.refresh_from_db()
        self.assertEqual(record.status, ReviewStatus.PENDING)

    def test_ingest_endpoint_returns_clear_validation_response(self):
        response = self.client.post(
            "/api/ingest/",
            {
                "source_type": "TRAVEL",
                "payload": {"origin_iata": "JFK", "destination_iata": "XXX"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["status"], "FAILED")
        self.assertEqual(response.data["errors"], ["Unknown destination_iata: XXX."])
