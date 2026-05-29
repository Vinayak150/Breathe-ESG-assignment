"""
Request-scoped tenant resolution.

Shared-schema multi-tenancy (DECISIONS.md ADR-002) is only safe if isolation is
enforced at the data-access layer and fails closed. Tenant identity is resolved from
the ``X-Tenant-ID`` request header; if it is absent the platform falls back to the
default demo tenant, and if it is present but malformed the request is rejected rather
than silently widened to another tenant's data.
"""
from rest_framework.exceptions import ValidationError

TENANT_HEADER = "X-Tenant-ID"
DEFAULT_TENANT_ID = 1


def resolve_tenant_id(request) -> int:
    raw_value = request.headers.get(TENANT_HEADER)
    if raw_value is None or str(raw_value).strip() == "":
        return DEFAULT_TENANT_ID

    try:
        return int(str(raw_value).strip())
    except (TypeError, ValueError) as exc:
        raise ValidationError({TENANT_HEADER: "Tenant identifier must be an integer."}) from exc
