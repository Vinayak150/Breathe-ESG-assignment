from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from ledger.models import ReviewStatus


DECIMAL_PLACES = Decimal("0.0001")


def _parse_date(value, field_name):
    if not value:
        raise ValueError(f"Missing {field_name}.")

    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValueError(f"Malformed {field_name}: {value}") from exc


def _parse_decimal(value):
    if value in (None, ""):
        raise ValueError("Missing consumption_value.")

    try:
        return Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError(f"Invalid consumption_value: {value}") from exc


def _month_end_exclusive(day):
    last_day = monthrange(day.year, day.month)[1]
    return date(day.year, day.month, last_day) + timedelta(days=1)


def _month_key(day):
    return f"{day.year:04d}-{day.month:02d}"


def _allocate_by_month(start_date, end_date, consumption_value):
    total_days = (end_date - start_date).days
    allocations = []
    current = start_date

    while current < end_date:
        boundary = min(_month_end_exclusive(current), end_date)
        days = (boundary - current).days
        value = (consumption_value * Decimal(days) / Decimal(total_days)).quantize(
            DECIMAL_PLACES,
            rounding=ROUND_HALF_UP,
        )
        allocations.append(
            {
                "month": _month_key(current),
                "start_date": current.isoformat(),
                "end_date": boundary.isoformat(),
                "days": days,
                "consumption_value": value,
            }
        )
        current = boundary

    rounding_delta = consumption_value - sum(item["consumption_value"] for item in allocations)
    if allocations and rounding_delta:
        allocations[-1]["consumption_value"] += rounding_delta

    return total_days, allocations


def parse_utility_payload(payload):
    try:
        start_date = _parse_date(payload.get("start_date"), "start_date")
        end_date = _parse_date(payload.get("end_date"), "end_date")
        consumption_value = _parse_decimal(payload.get("consumption_value"))
    except ValueError as exc:
        return {"records": [], "errors": [str(exc)], "metadata": {"source": "utility_portal_csv"}}

    if end_date <= start_date:
        return {
            "records": [],
            "errors": ["end_date must be after start_date."],
            "metadata": {"source": "utility_portal_csv"},
        }

    unit = str(payload.get("unit", "")).strip()
    if not unit:
        return {"records": [], "errors": ["Missing unit."], "metadata": {"source": "utility_portal_csv"}}

    total_days, allocations = _allocate_by_month(start_date, end_date, consumption_value)

    records = [
        {
            "scope": 2,
            "consumption_value": allocation["consumption_value"],
            "unit": unit,
            "status": ReviewStatus.PENDING,
            "metadata": {
                "meter_identifier": payload.get("meter_identifier"),
                "billing_period_start": start_date.isoformat(),
                "billing_period_end": end_date.isoformat(),
                "billing_period_days": total_days,
                "allocation": allocation,
            },
        }
        for allocation in allocations
    ]

    return {
        "records": records,
        "errors": [],
        "metadata": {
            "source": "utility_portal_csv",
            "billing_period_start": start_date.isoformat(),
            "billing_period_end": end_date.isoformat(),
            "billing_period_days": total_days,
            "allocations": allocations,
        },
    }
