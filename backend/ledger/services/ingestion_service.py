from django.db import IntegrityError, transaction

from ledger.models import NormalizedEmissionRecord, RawIngestionPayload, SourceType
from ledger.services.sap_parser import parse_sap_row
from ledger.services.travel_parser import parse_travel_payload
from ledger.services.utility_parser import parse_utility_payload


PARSER_VERSION_BY_SOURCE = {
    SourceType.SAP: "sap-alv-v1",
    SourceType.UTILITY: "utility-portal-csv-v1",
    SourceType.TRAVEL: "concur-webhook-v1",
}

PARSER_BY_SOURCE = {
    SourceType.SAP: parse_sap_row,
    SourceType.UTILITY: parse_utility_payload,
    SourceType.TRAVEL: parse_travel_payload,
}


class IngestionValidationError(ValueError):
    pass


def _normalize_source_type(source_type):
    normalized = str(source_type or "").strip().upper()
    if normalized not in SourceType.values:
        raise IngestionValidationError(
            f"Unsupported source_type '{source_type}'. Expected one of: {', '.join(SourceType.values)}."
        )
    return normalized


@transaction.atomic
def ingest_payload(source_type, payload, tenant_id=1):
    """
    Persist immutable evidence and derive normalized emission projections.

    Raw evidence is stored before parsing so validation failures still preserve the
    client-supplied artifact for audit and replay.
    """
    normalized_source_type = _normalize_source_type(source_type)

    if not isinstance(payload, dict):
        raise IngestionValidationError("payload must be a JSON object.")

    raw_payload = RawIngestionPayload(
        tenant_id=tenant_id,
        source_type=normalized_source_type,
        raw_data=payload,
        parser_version=PARSER_VERSION_BY_SOURCE[normalized_source_type],
    )

    try:
        raw_payload.save()
    except IntegrityError as exc:
        raise IngestionValidationError("Duplicate immutable payload: ingestion_hash already exists.") from exc

    parser_result = PARSER_BY_SOURCE[normalized_source_type](payload)
    errors = parser_result["errors"]

    if errors:
        return {
            "raw_payload_id": str(raw_payload.id),
            "normalized_record_id": None,
            "normalized_record_ids": [],
            "status": "FAILED",
            "errors": errors,
            "parser_metadata": parser_result.get("metadata", {}),
        }

    parser_version = PARSER_VERSION_BY_SOURCE[normalized_source_type]
    records = []
    for parsed_record in parser_result["records"]:
        normalization_metadata = dict(parsed_record.get("metadata", {}))
        normalization_metadata.setdefault("parser_version", parser_version)
        record = NormalizedEmissionRecord.objects.create(
            raw_payload=raw_payload,
            scope=parsed_record["scope"],
            consumption_value=parsed_record["consumption_value"],
            unit=parsed_record["unit"],
            status=parsed_record["status"],
            emission_factor_version="v1",
            normalization_metadata=normalization_metadata,
        )
        records.append(record)

    return {
        "raw_payload_id": str(raw_payload.id),
        "normalized_record_id": str(records[0].id) if records else None,
        "normalized_record_ids": [str(record.id) for record in records],
        "status": records[0].status if records else "FAILED",
        "errors": [],
        "parser_metadata": parser_result.get("metadata", {}),
    }
