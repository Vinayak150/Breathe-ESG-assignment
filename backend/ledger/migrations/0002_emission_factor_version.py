from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ledger", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="normalizedemissionrecord",
            name="emission_factor_version",
            field=models.CharField(
                db_index=True,
                default="v1",
                help_text="Version identifier of the emissions factor methodology used to generate this projection.",
                max_length=64,
            ),
        ),
        migrations.AddField(
            model_name="historicalnormalizedemissionrecord",
            name="emission_factor_version",
            field=models.CharField(
                db_index=True,
                default="v1",
                help_text="Version identifier of the emissions factor methodology used to generate this projection.",
                max_length=64,
            ),
        ),
    ]
