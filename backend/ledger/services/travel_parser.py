from decimal import Decimal, ROUND_HALF_UP
from math import asin, cos, radians, sin, sqrt

from ledger.models import ReviewStatus


EARTH_RADIUS_KM = 6371
DECIMAL_PLACES = Decimal("0.0001")

AIRPORT_COORDINATES = {
    "JFK": (40.6413, -73.7781),
    "LHR": (51.4700, -0.4543),
    "FRA": (50.0379, 8.5622),
    "SIN": (1.3644, 103.9915),
    "DXB": (25.2532, 55.3657),
}


def _haversine_km(origin, destination):
    lat1, lon1 = AIRPORT_COORDINATES[origin]
    lat2, lon2 = AIRPORT_COORDINATES[destination]

    lat1_rad, lon1_rad = radians(lat1), radians(lon1)
    lat2_rad, lon2_rad = radians(lat2), radians(lon2)
    delta_lat = lat2_rad - lat1_rad
    delta_lon = lon2_rad - lon1_rad

    a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
    c = 2 * asin(sqrt(a))
    distance = EARTH_RADIUS_KM * c
    return Decimal(str(distance)).quantize(DECIMAL_PLACES, rounding=ROUND_HALF_UP)


def parse_travel_payload(payload):
    origin = str(payload.get("origin_iata", "")).strip().upper()
    destination = str(payload.get("destination_iata", "")).strip().upper()

    errors = []
    if not origin:
        errors.append("Missing origin_iata.")
    if not destination:
        errors.append("Missing destination_iata.")
    if origin and origin not in AIRPORT_COORDINATES:
        errors.append(f"Unknown origin_iata: {origin}.")
    if destination and destination not in AIRPORT_COORDINATES:
        errors.append(f"Unknown destination_iata: {destination}.")

    if errors:
        return {"records": [], "errors": errors, "metadata": {"source": "concur_webhook"}}

    distance_km = _haversine_km(origin, destination)

    return {
        "records": [
            {
                "scope": 3,
                "consumption_value": distance_km,
                "unit": "km",
                "status": ReviewStatus.PENDING,
                "metadata": {
                    "origin_iata": origin,
                    "destination_iata": destination,
                    "distance_is_derived": True,
                    "distance_method": "HAVERSINE",
                },
            }
        ],
        "errors": [],
        "metadata": {
            "source": "concur_webhook",
            "origin_iata": origin,
            "destination_iata": destination,
            "distance_is_derived": True,
            "distance_method": "HAVERSINE",
        },
    }
