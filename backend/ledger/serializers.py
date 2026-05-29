from rest_framework import serializers

from ledger.models import NormalizedEmissionRecord, RawIngestionPayload


class IngestionRequestSerializer(serializers.Serializer):
    source_type = serializers.CharField()
    payload = serializers.DictField()
    tenant_id = serializers.IntegerField(required=False, default=1)


class RawIngestionPayloadSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawIngestionPayload
        fields = [
            "id",
            "tenant_id",
            "source_type",
            "raw_data",
            "ingestion_hash",
            "parser_version",
            "created_at",
        ]
        read_only_fields = ["id", "ingestion_hash", "created_at"]


class NormalizedEmissionRecordSerializer(serializers.ModelSerializer):
    raw_payload_id = serializers.UUIDField(source="raw_payload.id", read_only=True)
    source_type = serializers.CharField(source="raw_payload.source_type", read_only=True)
    tenant_id = serializers.IntegerField(source="raw_payload.tenant_id", read_only=True)

    class Meta:
        model = NormalizedEmissionRecord
        fields = [
            "id",
            "raw_payload",
            "raw_payload_id",
            "source_type",
            "tenant_id",
            "scope",
            "consumption_value",
            "unit",
            "emission_factor_version",
            "normalization_metadata",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "raw_payload_id",
            "source_type",
            "tenant_id",
            "normalization_metadata",
            "status",
            "created_at",
            "updated_at",
        ]
