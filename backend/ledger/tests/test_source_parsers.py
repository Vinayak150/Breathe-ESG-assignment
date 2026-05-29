from decimal import Decimal

from django.test import SimpleTestCase

from ledger.models import ReviewStatus
from ledger.services.sap_parser import parse_sap_row
from ledger.services.travel_parser import parse_travel_payload
from ledger.services.utility_parser import parse_utility_payload


class SapParserTests(SimpleTestCase):
    def test_gal_conversion_to_liters(self):
        result = parse_sap_row({"BUKRS": "1000", "WERKS": "BLR1", "MENGE": "10", "MEINS": "GAL"})

        self.assertEqual(result["errors"], [])
        self.assertEqual(result["records"][0]["consumption_value"], Decimal("37.850"))
        self.assertEqual(result["records"][0]["unit"], "L")

    def test_decimal_comma_parsing(self):
        result = parse_sap_row({"BUKRS": "1000", "WERKS": "FRA1", "MENGE": "1.234,56", "MEINS": "L"})

        self.assertEqual(result["errors"], [])
        self.assertEqual(result["records"][0]["consumption_value"], Decimal("1234.56"))

    def test_flagged_threshold(self):
        result = parse_sap_row({"BUKRS": "1000", "WERKS": "BLR1", "MENGE": "15000", "MEINS": "L"})

        self.assertEqual(result["records"][0]["status"], ReviewStatus.FLAGGED)


class UtilityParserTests(SimpleTestCase):
    def test_month_boundary_allocation(self):
        result = parse_utility_payload(
            {
                "meter_identifier": "MTR-001",
                "start_date": "2024-01-14",
                "end_date": "2024-02-12",
                "consumption_value": "2900",
                "unit": "kWh",
            }
        )

        self.assertEqual(result["errors"], [])
        self.assertEqual(result["metadata"]["billing_period_days"], 29)
        self.assertEqual(result["metadata"]["allocations"][0]["month"], "2024-01")
        self.assertEqual(result["metadata"]["allocations"][0]["days"], 18)
        self.assertEqual(result["metadata"]["allocations"][0]["consumption_value"], Decimal("1800.0000"))
        self.assertEqual(result["metadata"]["allocations"][1]["month"], "2024-02")
        self.assertEqual(result["metadata"]["allocations"][1]["days"], 11)
        self.assertEqual(result["metadata"]["allocations"][1]["consumption_value"], Decimal("1100.0000"))

    def test_leap_year_allocation(self):
        result = parse_utility_payload(
            {
                "meter_identifier": "MTR-001",
                "start_date": "2024-02-14",
                "end_date": "2024-03-02",
                "consumption_value": "1700",
                "unit": "kWh",
            }
        )

        self.assertEqual(result["errors"], [])
        self.assertEqual(result["metadata"]["billing_period_days"], 17)
        self.assertEqual(result["metadata"]["allocations"][0]["month"], "2024-02")
        self.assertEqual(result["metadata"]["allocations"][0]["days"], 16)
        self.assertEqual(result["metadata"]["allocations"][0]["consumption_value"], Decimal("1600.0000"))
        self.assertEqual(result["metadata"]["allocations"][1]["month"], "2024-03")
        self.assertEqual(result["metadata"]["allocations"][1]["days"], 1)
        self.assertEqual(result["metadata"]["allocations"][1]["consumption_value"], Decimal("100.0000"))


class TravelParserTests(SimpleTestCase):
    def test_haversine_calculation_marks_distance_as_derived(self):
        result = parse_travel_payload({"origin_iata": "JFK", "destination_iata": "LHR"})

        self.assertEqual(result["errors"], [])
        distance = result["records"][0]["consumption_value"]
        self.assertGreater(distance, Decimal("5530"))
        self.assertLess(distance, Decimal("5550"))
        self.assertEqual(result["records"][0]["unit"], "km")
        self.assertTrue(result["records"][0]["metadata"]["distance_is_derived"])

    def test_invalid_airport_handling(self):
        result = parse_travel_payload({"origin_iata": "JFK", "destination_iata": "XXX"})

        self.assertEqual(result["records"], [])
        self.assertEqual(result["errors"], ["Unknown destination_iata: XXX."])
