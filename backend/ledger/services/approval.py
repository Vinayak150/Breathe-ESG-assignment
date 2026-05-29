from django.db import transaction

from ledger.models import NormalizedEmissionRecord, ReviewStatus


@transaction.atomic
def approve_normalized_record(record: NormalizedEmissionRecord) -> NormalizedEmissionRecord:
    """
    Approve a derived emissions projection.

    Approval is intentionally modeled as a state transition. Once the row is saved
    as APPROVED, model-level audit-locking prevents further mutation; any future
    correction must be represented by a superseding projection.
    """
    locked_record = NormalizedEmissionRecord.objects.select_for_update().get(pk=record.pk)

    if locked_record.status == ReviewStatus.APPROVED:
        return locked_record

    locked_record.status = ReviewStatus.APPROVED
    locked_record.save(update_fields=["status", "updated_at"])
    return locked_record
