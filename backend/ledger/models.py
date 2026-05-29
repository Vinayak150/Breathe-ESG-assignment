import hashlib
import json
import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords


class ImmutableEvidenceError(ValidationError):
    """Raised when code attempts to mutate authoritative raw evidence."""


class AuditLockedRecordError(ValidationError):
    """Raised when code attempts to mutate an approved emission projection."""


class SourceType(models.TextChoices):
    SAP = "SAP", "SAP"
    UTILITY = "UTILITY", "Utility"
    TRAVEL = "TRAVEL", "Travel"


class ReviewStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    FLAGGED = "FLAGGED", "Flagged"
    APPROVED = "APPROVED", "Approved"


class RawIngestionPayload(models.Model):
    """
    Immutable evidence captured exactly as received from a client-controlled source.

    This model is the authoritative source of truth. Normalized business records are
    projections derived from these rows; they never write back into this table.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.IntegerField(default=1, db_index=True)
    source_type = models.CharField(max_length=16, choices=SourceType.choices, db_index=True)
    raw_data = models.JSONField()
    ingestion_hash = models.CharField(max_length=64, unique=True, editable=False)
    parser_version = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant_id", "source_type", "created_at"], name="raw_lineage_idx"),
            models.Index(fields=["tenant_id", "parser_version"], name="raw_replay_idx"),
            models.Index(fields=["ingestion_hash"], name="raw_hash_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(source_type__in=SourceType.values),
                name="raw_payload_source_type_valid",
            ),
        ]
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if self.pk and RawIngestionPayload.objects.filter(pk=self.pk).exists():
            raise ImmutableEvidenceError("RawIngestionPayload rows are immutable after creation.")

        if not self.ingestion_hash:
            self.ingestion_hash = self.compute_ingestion_hash()

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableEvidenceError("RawIngestionPayload rows are append-only and cannot be deleted.")

    def compute_ingestion_hash(self) -> str:
        """
        Hash the custody-relevant fields deterministically.

        JSON keys are sorted so replaying the same source row produces the same hash
        even if Python dictionary insertion order differs.
        """
        payload = {
            "tenant_id": self.tenant_id,
            "source_type": self.source_type,
            "parser_version": self.parser_version,
            "raw_data": self.raw_data,
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def __str__(self) -> str:
        return f"{self.source_type}:{self.ingestion_hash[:12]}"


class NormalizedEmissionRecord(models.Model):
    """
    Derived emissions projection generated from immutable raw evidence.

    This row is intentionally mutable while under review, but becomes audit-locked
    once approved. Corrections after approval must create a superseding projection.
    """

    raw_payload = models.ForeignKey(
        RawIngestionPayload,
        on_delete=models.PROTECT,
        related_name="normalized_records",
    )
    scope = models.PositiveSmallIntegerField()
    consumption_value = models.DecimalField(max_digits=15, decimal_places=4)
    unit = models.CharField(max_length=32)
    emission_factor_version = models.CharField(
        max_length=64,
        default="v1",
        db_index=True,
        help_text="Version identifier of the emissions factor methodology used to generate this projection.",
    )
    normalization_metadata = models.JSONField(
        default=dict,
        blank=True,
        encoder=DjangoJSONEncoder,
        help_text=(
            "Derivation evidence captured at normalization time (e.g. unit conversion applied, "
            "billing-period allocation, whether a travel distance was reported or derived). Stored "
            "so any projection can explain and deterministically reproduce its own value."
        ),
    )
    status = models.CharField(
        max_length=16,
        choices=ReviewStatus.choices,
        default=ReviewStatus.PENDING,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    history = HistoricalRecords()

    class Meta:
        indexes = [
            models.Index(fields=["status", "updated_at"], name="review_queue_idx"),
            models.Index(fields=["scope", "status"], name="scope_review_idx"),
            models.Index(fields=["raw_payload", "status"], name="lineage_review_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(scope__in=[1, 2, 3]),
                name="normalized_scope_valid",
            ),
            models.CheckConstraint(
                condition=Q(status__in=ReviewStatus.values),
                name="normalized_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(consumption_value__gte=Decimal("0")),
                name="normalized_consumption_non_negative",
            ),
        ]
        ordering = ["-updated_at"]
    
    def save(self, *args, **kwargs):
        if self.pk:
            existing = NormalizedEmissionRecord.objects.filter(pk=self.pk).first()
            if existing and existing.status == ReviewStatus.APPROVED:
                raise AuditLockedRecordError(
                    "Approved NormalizedEmissionRecord rows are audit-locked. "
                    "Create a superseding projection instead of mutating in place."
                )

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status == ReviewStatus.APPROVED:
            raise AuditLockedRecordError("Approved NormalizedEmissionRecord rows cannot be deleted.")
        super().delete(*args, **kwargs)

    def __str__(self) -> str:
        return f"scope={self.scope} {self.consumption_value} {self.unit} [{self.status}]"
