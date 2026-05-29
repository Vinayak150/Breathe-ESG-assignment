from decimal import Decimal, InvalidOperation

from ledger.models import ReviewStatus


GALLON_TO_LITER = Decimal("3.785")
FLAGGED_THRESHOLD = Decimal("10000")


def _parse_decimal(value):
    if value in (None, ""):
        raise ValueError("MENGE is required.")

    text = str(value).strip()
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", ".")

    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid numeric MENGE: {value}") from exc


def parse_sap_row(row):
    errors = []

    if not row.get("MENGE"):
        errors.append("Missing MENGE.")
    if not row.get("MEINS"):
        errors.append("Missing MEINS.")

    if errors:
        return {"records": [], "errors": errors, "metadata": {"source": "sap_alv"}}

    try:
        source_quantity = _parse_decimal(row["MENGE"])
    except ValueError as exc:
        return {"records": [], "errors": [str(exc)], "metadata": {"source": "sap_alv"}}

    consumption_value = source_quantity
    source_unit = str(row["MEINS"]).strip().upper()
    unit = source_unit

    if source_unit == "GAL":
        consumption_value = consumption_value * GALLON_TO_LITER
        unit = "L"

    status = ReviewStatus.FLAGGED if source_quantity > FLAGGED_THRESHOLD else ReviewStatus.PENDING

    return {
        "records": [
            {
                "scope": 1,
                "consumption_value": consumption_value,
                "unit": unit,
                "status": status,
                "metadata": {
                    "bukrs": row.get("BUKRS"),
                    "werks": row.get("WERKS"),
                    "source_unit": source_unit,
                    "normalization": "GAL_TO_L" if source_unit == "GAL" else "NONE",
                },
            }
        ],
        "errors": [],
        "metadata": {"source": "sap_alv"},
    }
