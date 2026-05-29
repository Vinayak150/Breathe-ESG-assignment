from rest_framework import mixins, status, viewsets
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response

from ledger.models import NormalizedEmissionRecord, RawIngestionPayload
from ledger.serializers import (
    IngestionRequestSerializer,
    NormalizedEmissionRecordSerializer,
    RawIngestionPayloadSerializer,
)
from ledger.services.approval import approve_normalized_record
from ledger.services.ingestion_service import IngestionValidationError, ingest_payload
from ledger.tenancy import TENANT_HEADER, resolve_tenant_id


class RawIngestionPayloadViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    API surface for immutable evidence.

    Update and destroy routes are intentionally not exposed; model-level guards also
    reject mutation if a caller reaches the ORM through another path. Reads are scoped
    to the resolved tenant so evidence never crosses client boundaries.
    """

    serializer_class = RawIngestionPayloadSerializer

    def get_queryset(self):
        tenant_id = resolve_tenant_id(self.request)
        return RawIngestionPayload.objects.filter(tenant_id=tenant_id)


class NormalizedEmissionRecordViewSet(viewsets.ModelViewSet):
    serializer_class = NormalizedEmissionRecordSerializer

    def get_queryset(self):
        tenant_id = resolve_tenant_id(self.request)
        return (
            NormalizedEmissionRecord.objects.select_related("raw_payload")
            .filter(raw_payload__tenant_id=tenant_id)
        )

    @action(detail=True, methods=["patch"], url_path="approve")
    def approve(self, request, pk=None):
        record = self.get_object()
        approved = approve_normalized_record(record)
        serializer = self.get_serializer(approved)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IngestionView(APIView):
    """
    Thin HTTP boundary for deterministic ingestion.

    Validation, raw evidence persistence, parser routing, and projection creation
    live in the ingestion service so they remain replayable outside DRF.
    """

    def post(self, request):
        serializer = IngestionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        header_tenant_id = request.headers.get(TENANT_HEADER)
        tenant_id = (
            resolve_tenant_id(request)
            if header_tenant_id not in (None, "")
            else serializer.validated_data["tenant_id"]
        )

        try:
            result = ingest_payload(
                source_type=serializer.validated_data["source_type"],
                payload=serializer.validated_data["payload"],
                tenant_id=tenant_id,
            )
        except IngestionValidationError as exc:
            return Response({"errors": [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)

        response_status = status.HTTP_201_CREATED if not result["errors"] else status.HTTP_400_BAD_REQUEST
        return Response(result, status=response_status)
