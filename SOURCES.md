# SOURCES.md — Source Research and Modeling

> This is an engineering artifact, not a brochure. For each of the three sources it records the
> real-world format that was researched, why that ingestion mode was selected over the
> alternatives, how the sample/mock data was deliberately constructed, the normalization problems
> the adapter must solve, the edge cases that were designed for, and the ways this would break in a
> real deployment. The mock data was built to *expose* these problems, not to hide them — a clean
> happy-path sample would be the least useful thing to hand a reviewer.

A note on fabricated data (applies to all three): we were not given real client files. Every
sample row was hand-constructed after researching the genuine format, and was seeded with the
specific messiness the real format exhibits (mixed-language headers, missing distances, estimated
reads, cross-boundary billing). Where we made an assumption to generate a value, the assumption is
called out so a reviewer can challenge it directly rather than discover it later.

---

## 1. SAP — Fuel and Procurement (Scope 1 and Scope 3 Cat 1)

### Researched format
SAP MM stores purchasing and material-movement data in tables such as `EKKO`/`EKPO` (purchase
order header/items) and `MSEG`/`MATDOC` (material documents). Functional analysts extract this by
running a transaction (e.g. ME2N for PO line items, MB51 for material movements) and exporting the
**ALV grid** to CSV/XLSX. The fields that matter for emissions, with their real technical names:

- `BUKRS` — company code (the legal entity; the basis for tenant/entity attribution).
- `WERKS` — plant, a 4-character code that is **meaningless without the `T001W` plant lookup**.
- `MATNR` — material number; `TXZ01`/`MAKTX` — material short text.
- `MENGE` — quantity; `MEINS` — unit of measure (and `BPRME`, order price unit).
- `EBELN`/`EBELP` — purchasing document and item number.

In a German-configured system the exported headers are localized: `Werk` (plant),
`Basismengeneinheit` / `Bestellmengeneinheit` (base / order unit of measure), `Menge` (quantity),
`Buchungskreis` (company code), and dates and numbers follow German locale.

### Why this mode was selected
ALV-style file export was chosen over OData, BAPI/RFC, and IDoc because those require client-side
access that does not exist at onboarding (full reasoning in `DECISIONS.md` ADR-003). The export is
the artifact a client genuinely produces first. The adapter is built so a live OData pull can later
replace the file behind the same payload contract.

### Sample-data design (and why it looks the way it does)
The mock SAP export was constructed to look like a real ME2N dump, not a tidy textbook table:

- **Mixed-language headers** in different sample files — one English (`Plant`, `Quantity`,
  `Order Unit`), one German (`Werk`, `Menge`, `Bestellmengeneinheit`) — because real multinational
  clients run both, and the adapter must alias both to one canonical field.
- **Decimal-comma values** (`1.234,56`) in the German sample, dot-decimal in the English one,
  because numeric locale travels with the SAP configuration and silently corrupts quantities if
  mis-parsed.
- **`WERKS` codes with no obvious meaning** (`HM01`, `BLR2`) including at least one **unmapped**
  code, so the reviewer can see that an unmapped plant *blocks approval* rather than being guessed.
- **Unit inconsistencies** for the same logical material — diesel in `L` in one row, `LITER` in
  another, and a fuel quantity in `KG` — to force the unit-normalization layer to do real work.
- **A mix of Scope 1 fuel lines and Scope 3 procurement lines** in one file, because a single
  export does not pre-sort by scope; classification is our interpretation (`MODEL.md` §8).

### Normalization challenges the adapter solves
- **Header aliasing** (German↔English) via versioned mapping data, so the same canonical field is
  produced regardless of system language.
- **`WERKS` → facility resolution** through a per-tenant plant lookup; unmapped → blocking
  validation issue, never a guessed facility.
- **Decimal-comma and date parsing** keyed on detected locale (`DD.MM.YYYY` and `YYYYMMDD` both
  appear).
- **Unit-of-measure normalization** (`L`/`LITER`/`KG`) to a canonical unit per material, with a
  versioned conversion path; unknown units are flagged, not assumed.
- **Scope/category classification** of each line (on-site combustion → Scope 1; purchased good →
  Scope 3 Cat 1), recorded on the projection.

### Edge cases designed for
Unmapped plant code; unrecognized unit of measure; decimal-comma vs. dot; same material with
inconsistent units across rows; a line with quantity present but unit blank; company code
(`BUKRS`) present for entity attribution but plant missing.

### Production failure modes
- **Plant tables drift.** Clients add/rename plants; an export references a `WERKS` not yet in our
  lookup, and volume of such rows spikes during reorganizations — the blocking behavior is correct
  but creates analyst workload that must be managed.
- **Locale ambiguity.** A value like `1.234` is 1234 (German thousands) or 1.234 (dot decimal)
  depending on configuration; detection can be wrong on files that mix conventions, silently
  scaling a quantity by 1000.
- **Material master gaps.** Material text alone is insufficient to classify scope reliably; without
  the material master / commodity mapping, Scope 1-vs-3 classification degrades to heuristics.
- **Spend-based Scope 3 coarseness.** Procurement lines normalized on spend rather than physical
  activity carry real estimation error that compounds at portfolio scale.
- **Column layout variance.** Different ALV variants export different column sets/orders; an
  export from an unfamiliar variant can misalign if the adapter relies on position rather than
  header.

---

## 2. Utility — Electricity (Scope 2)

### Researched format
The realistic artifact a facilities team obtains is a **portal CSV export** in the Green Button
"Download My Data" style. Typical columns: meter (ID, or "Multiple"), type (electricity), start
date, end date, usage, units (kWh), cost, and notes (e.g. an estimated-read indicator). Aggregator
schemas (e.g. UtilityAPI) corroborate the shape: tariff strings like `E19` taken straight from the
source and frequently blank or inconsistent, totals as `bill_total_kwh`/`bill_total_unit`, and
**billing periods where the end date is exclusive** (an end of `2020-04-01T00:00:00` means the
period includes all of 2020-03-31). The defining property: **billing periods do not align to
calendar months** — a cycle runs e.g. **Jan 14 → Feb 12**.

### Why this mode was selected
CSV export was chosen over PDF OCR and utility provider/aggregator APIs (full reasoning in
`DECISIONS.md` ADR-004 and `TRADEOFFS.md` §1–§2): OCR injects probabilistic error into the evidence
layer, and APIs need client OAuth absent at onboarding. The CSV is structured, deterministic, and
the thing a facilities team can actually download today.

### Sample-data design (and why it looks the way it does)
- **Cross-boundary billing cycles** (`Jan 14 → Feb 12`, `Feb 12 → Mar 14`) rather than clean
  calendar months, because that is the real cadence and it forces the period-allocation logic to
  run on every row.
- **An estimated read** flagged in the notes column, so the lower-confidence path is exercised and
  visible to the reviewer.
- **A blank tariff** on one row and a cryptic tariff (`E19`) on another, mirroring the real
  inconsistency, to prove the adapter tolerates missing/garbled tariff data.
- **Mixed unit casing** (`kWh`, `KWH`) to confirm unit canonicalization.
- **A meter shown as "Multiple"** on an account with several meters, the exact placeholder the
  Green Button format uses, to test that we don't treat it as a literal meter ID.

### Normalization challenges the adapter solves
- **Billing-period → reporting-period allocation.** A Jan 14 → Feb 12 bill is split across January
  and February by **day-weighted allocation**, and the split is recorded as part of the derivation
  so an auditor sees one bill became two reporting-period records and exactly how.
- **Exclusive end-date handling**, so a period is not double-counted on its boundary day.
- **Usage → canonical kWh**, with unit casing normalized and unknown units flagged.
- **Meter → facility resolution** via per-tenant mapping; `"Multiple"` and unmapped meters handled
  explicitly.
- **Estimated-read confidence**, carried as derivation metadata rather than silently trusted.

### Edge cases designed for
Period spanning a calendar-year boundary (Dec→Jan); estimated vs. actual read; blank or
inconsistent tariff; meter = "Multiple"; zero or negative usage (credit/correction lines); a date
range with no usage value (blank usage cell, which the Green Button format explicitly permits).

### Production failure modes
- **Allocation assumption breaks under seasonality.** Day-weighted splitting assumes even daily
  consumption; for heating/cooling-driven loads, a cross-boundary bill is mis-allocated between
  months. AMI interval data would fix this but is deliberately out of scope.
- **Estimated reads later restated.** Utilities issue estimates, then true-ups; without
  reconciling the later actual against the earlier estimate, a period can be double-counted or
  left stale — handled correctly only if the true-up arrives as new evidence and supersedes.
- **Tariff absence limits market-based Scope 2.** Blank/garbled tariff and missing supplier
  contract data mean market-based factors can't always be applied; we fall back to location-based
  and record the limitation.
- **Meter-to-facility ambiguity.** "Multiple" meters or sub-metering that doesn't map cleanly to a
  reporting facility boundary creates allocation ambiguity at the facility level.
- **Timezone and DST at period edges.** Local-time billing boundaries shift the day a period
  starts/ends; naive UTC handling can misplace a day's usage across a month boundary.

---

## 3. Travel — Flights, Hotels, Ground (Scope 3 Cat 6)

### Researched format
Corporate travel platforms (Concur, Navan) expose itineraries as segment-level JSON. Concur's
itinerary feed and TMC payloads carry `start_airport_code`/`end_airport_code` (IATA), `cabin`/
`service_class`, `marketing_flight_number`, vendor, and a `distance` field that **is frequently
empty**. Navan's schema uses `departureAirportCode`/`arrivalAirportCode`, `airlineCode`,
`flightNumber`. These platforms emit data via webhook-style event payloads in production, and
emissions partners (e.g. ISO 14083-aligned methodologies) compute distance via great-circle when
it isn't provided and vary the factor by cabin and haul band.

### Why this mode was selected
JSON webhook-style payloads were chosen over a live API pull and over CSV expense exports (full
reasoning in `DECISIONS.md` ADR-005): live API access doesn't exist at prototype time, and expense
CSVs are spend-oriented and lack the segment detail (airport pairs, cabin) needed for
activity-based travel emissions. Modeling the genuine JSON shape proves the docs were read while
staying deployable; the webhook framing means a real subscription is an adapter swap.

### Sample-data design (and why it looks the way it does)
- **IATA-only segments with no distance** (`{ "from": "BLR", "to": "LHR", "cabin": "Business" }`),
  because that is the common real payload and it forces the distance-derivation path.
- **Some segments *with* a provided distance**, so the adapter's "prefer reported, derive only when
  missing" logic — and the reported-vs-derived flag — is visible.
- **A multi-leg itinerary** (BLR→DXB→LHR) to exercise per-segment computation rather than
  origin-destination shortcutting.
- **Mixed cabins** (Economy, Business) to show cabin-class factor differences materially change the
  result.
- **A hotel stay (room-nights) and a ground-transport line**, because a real trip is not only
  flights and each category uses a different factor basis.
- **A malformed/unknown airport code** on one segment, so the no-silent-zero behavior is
  demonstrable.

### Normalization challenges the adapter solves
- **Distance derivation via Haversine (great-circle)** from IATA → coordinates when `distance` is
  absent, with the result flagged as **derived, not reported**, so measured and modeled travel are
  distinguishable in audit.
- **Cabin-class- and haul-band-aware factor selection** (business ≫ economy; short vs. long haul).
- **Per-category modeling** — flights (distance × factor), hotels (room-nights × factor), ground
  (distance/days × factor) — each routed to the right factor type.
- **Per-segment computation** across multi-leg itineraries rather than origin-to-destination
  straight lines, which would understate distance.
- **Airport-code validation** against the IATA lookup; unknown/malformed codes are flagged and
  block approval.

### Edge cases designed for
Missing distance (derive); reported distance present (use, don't override); unknown/typo airport
code; multi-leg with a layover; same-airport segment (data error); non-flight categories (hotel,
ground) in the same itinerary; cabin missing (must default conservatively and flag).

### Production failure modes
- **Great-circle understates real distance.** Haversine ignores routing, holding patterns, and
  airspace detours; DEFRA/ICAO-aligned methods add uplifts. Our derived figure is a defensible
  approximation, flagged as such, but it is not the flown distance.
- **IATA coordinate and code drift.** Airports close, codes are reused or mistyped; a stale or
  wrong IATA→coordinate lookup silently produces a plausible-but-wrong distance.
- **Cabin inference gaps.** When cabin is missing or non-standard ("Premium", vendor-specific
  codes), factor selection degrades; defaulting to economy understates, defaulting to business
  overstates — either way an assumption that must be recorded.
- **Radiative forcing omitted.** We exclude RF uplift toggles; for clients reporting under
  methodologies that require RF, the flight figures are understated until that's added.
- **Trip-stitching and double-counting.** Re-issued tickets, changes, and cancellations can appear
  as new segments; without dedup/superseding logic keyed on confirmation/booking identity, a
  changed flight can be counted twice.
- **Ground/rental distance is usually absent.** Real feeds often give only rental days, not
  kilometers; any day-to-distance assumption (the industry uses an average like ~113 km/day) is an
  estimate that must be flagged.

---

## Summary of cross-source assumptions made for mock data

- Where a source omits a value our methodology needs (travel distance, sometimes unit), the mock
  data **includes the omission on purpose** and the adapter derives or flags rather than silently
  filling — so reviewers see the real behavior, not a sanitized one.
- Opaque codes (`WERKS`, meter IDs, IATA codes) are mapped through versioned per-tenant lookups; an
  unmapped code is always a blocking issue, never a guess.
- Every derived or estimated figure (allocated period, great-circle distance, estimated read,
  spend-based Scope 3) is marked as such in derivation metadata, so an auditor can separate
  measured evidence from modeled interpretation.
- The mock data is intentionally small but adversarial: each file is sized to be read by a human
  reviewer while still containing the specific failure shapes — mixed locales, cross-boundary
  cycles, missing distances — that the real formats are known to produce.
