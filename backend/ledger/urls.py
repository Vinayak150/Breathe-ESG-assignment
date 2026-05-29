from django.urls import include, path
from rest_framework.routers import DefaultRouter

from ledger.views import IngestionView, NormalizedEmissionRecordViewSet, RawIngestionPayloadViewSet


router = DefaultRouter()
router.register("raw-payloads", RawIngestionPayloadViewSet, basename="raw-payload")
router.register("normalized-records", NormalizedEmissionRecordViewSet, basename="normalized-record")

urlpatterns = [
    path("ingest/", IngestionView.as_view(), name="ingest"),
    path("", include(router.urls)),
]
