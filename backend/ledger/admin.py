from django.contrib import admin

from ledger.models import NormalizedEmissionRecord, RawIngestionPayload


@admin.register(RawIngestionPayload)
class RawIngestionPayloadAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant_id", "source_type", "parser_version", "created_at")
    list_filter = ("source_type", "parser_version", "created_at")
    search_fields = ("ingestion_hash",)
    readonly_fields = ("id", "ingestion_hash", "created_at")


@admin.register(NormalizedEmissionRecord)
class NormalizedEmissionRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "raw_payload", "scope", "consumption_value", "unit", "status", "updated_at")
    list_filter = ("scope", "status", "created_at", "updated_at")
    search_fields = ("raw_payload__ingestion_hash", "unit")
    readonly_fields = ("created_at", "updated_at")
