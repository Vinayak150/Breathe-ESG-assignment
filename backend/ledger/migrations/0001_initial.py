import uuid
from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RawIngestionPayload",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.IntegerField(db_index=True, default=1)),
                (
                    "source_type",
                    models.CharField(
                        choices=[("SAP", "SAP"), ("UTILITY", "Utility"), ("TRAVEL", "Travel")],
                        db_index=True,
                        max_length=16,
                    ),
                ),
                ("raw_data", models.JSONField()),
                ("ingestion_hash", models.CharField(editable=False, max_length=64, unique=True)),
                ("parser_version", models.CharField(max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="NormalizedEmissionRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("scope", models.PositiveSmallIntegerField()),
                ("consumption_value", models.DecimalField(decimal_places=4, max_digits=15)),
                ("unit", models.CharField(max_length=32)),
                (
                    "status",
                    models.CharField(
                        choices=[("PENDING", "Pending"), ("FLAGGED", "Flagged"), ("APPROVED", "Approved")],
                        db_index=True,
                        default="PENDING",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "raw_payload",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="normalized_records",
                        to="ledger.rawingestionpayload",
                    ),
                ),
            ],
            options={
                "ordering": ["-updated_at"],
            },
        ),
        migrations.CreateModel(
            name="HistoricalNormalizedEmissionRecord",
            fields=[
                ("id", models.BigIntegerField(blank=True, db_index=True)),
                ("scope", models.PositiveSmallIntegerField()),
                ("consumption_value", models.DecimalField(decimal_places=4, max_digits=15)),
                ("unit", models.CharField(max_length=32)),
                (
                    "status",
                    models.CharField(
                        choices=[("PENDING", "Pending"), ("FLAGGED", "Flagged"), ("APPROVED", "Approved")],
                        db_index=True,
                        default="PENDING",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(blank=True, editable=False)),
                ("updated_at", models.DateTimeField(blank=True, editable=False)),
                ("history_id", models.AutoField(primary_key=True, serialize=False)),
                ("history_date", models.DateTimeField(db_index=True)),
                ("history_change_reason", models.CharField(max_length=100, null=True)),
                (
                    "history_type",
                    models.CharField(
                        choices=[("+", "Created"), ("~", "Changed"), ("-", "Deleted")],
                        max_length=1,
                    ),
                ),
                (
                    "history_user",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "raw_payload",
                    models.ForeignKey(
                        blank=True,
                        db_constraint=False,
                        null=True,
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="+",
                        to="ledger.rawingestionpayload",
                    ),
                ),
            ],
            options={
                "verbose_name": "historical normalized emission record",
                "verbose_name_plural": "historical normalized emission records",
                "ordering": ("-history_date", "-history_id"),
                "get_latest_by": ("history_date", "history_id"),
            },
        ),
        migrations.AddIndex(
            model_name="rawingestionpayload",
            index=models.Index(fields=["tenant_id", "source_type", "created_at"], name="raw_lineage_idx"),
        ),
        migrations.AddIndex(
            model_name="rawingestionpayload",
            index=models.Index(fields=["tenant_id", "parser_version"], name="raw_replay_idx"),
        ),
        migrations.AddIndex(
            model_name="rawingestionpayload",
            index=models.Index(fields=["ingestion_hash"], name="raw_hash_idx"),
        ),
        migrations.AddConstraint(
            model_name="rawingestionpayload",
            constraint=models.CheckConstraint(
                condition=models.Q(("source_type__in", ["SAP", "UTILITY", "TRAVEL"])),
                name="raw_payload_source_type_valid",
            ),
        ),
        migrations.AddIndex(
            model_name="normalizedemissionrecord",
            index=models.Index(fields=["status", "updated_at"], name="review_queue_idx"),
        ),
        migrations.AddIndex(
            model_name="normalizedemissionrecord",
            index=models.Index(fields=["scope", "status"], name="scope_review_idx"),
        ),
        migrations.AddIndex(
            model_name="normalizedemissionrecord",
            index=models.Index(fields=["raw_payload", "status"], name="lineage_review_idx"),
        ),
        migrations.AddConstraint(
            model_name="normalizedemissionrecord",
            constraint=models.CheckConstraint(
                condition=models.Q(("scope__in", [1, 2, 3])),
                name="normalized_scope_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="normalizedemissionrecord",
            constraint=models.CheckConstraint(
                condition=models.Q(("status__in", ["PENDING", "FLAGGED", "APPROVED"])),
                name="normalized_status_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="normalizedemissionrecord",
            constraint=models.CheckConstraint(
                condition=models.Q(("consumption_value__gte", Decimal("0"))),
                name="normalized_consumption_non_negative",
            ),
        ),
    ]
