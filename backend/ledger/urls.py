from django.urls import include, path
from rest_framework.routers import DefaultRouter

from ledger.views import (
    IngestionView,
    LoadMockDataView,  # TEMPORARY SEED ENDPOINT — remove after assignment review
    NormalizedEmissionRecordViewSet,
    RawIngestionPayloadViewSet,
)


router = DefaultRouter()
router.register("raw-payloads", RawIngestionPayloadViewSet, basename="raw-payload")
router.register("normalized-records", NormalizedEmissionRecordViewSet, basename="normalized-record")

urlpatterns = [
    path("ingest/", IngestionView.as_view(), name="ingest"),
    # TEMPORARY SEED ENDPOINT — remove after assignment review
    path("admin/load-mock-data/", LoadMockDataView.as_view(), name="temporary-load-mock-data"),
    path("", include(router.urls)),
]
