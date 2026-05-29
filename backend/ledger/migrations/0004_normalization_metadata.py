from django.core.serializers.json import DjangoJSONEncoder
from django.db import migrations, models


HELP_TEXT = (
    "Derivation evidence captured at normalization time (e.g. unit conversion applied, "
    "billing-period allocation, whether a travel distance was reported or derived). Stored "
    "so any projection can explain and deterministically reproduce its own value."
)


class Migration(migrations.Migration):
    dependencies = [
        ("ledger", "0003_alter_historicalnormalizedemissionrecord_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="normalizedemissionrecord",
            name="normalization_metadata",
            field=models.JSONField(
                blank=True, default=dict, encoder=DjangoJSONEncoder, help_text=HELP_TEXT
            ),
        ),
        migrations.AddField(
            model_name="historicalnormalizedemissionrecord",
            name="normalization_metadata",
            field=models.JSONField(
                blank=True, default=dict, encoder=DjangoJSONEncoder, help_text=HELP_TEXT
            ),
        ),
    ]
