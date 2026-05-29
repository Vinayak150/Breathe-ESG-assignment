# DECISIONS.md — Architecture Decision Records

> These ADRs record decisions that were made deliberately, with the alternatives that were
> rejected and the reasons. They are written to be challenged. Where a decision trades away
> something real, that cost is stated rather than hidden. The reader is assumed to be a senior
> reviewer who will ask "why not the other thing" for every line.
>
> Architectural direction already fixed (not re-litigated here): Django REST + React,
> PostgreSQL, shared-schema multi-tenancy, `RawIngestionPayload` as immutable evidence,
> `NormalizedEmissionRecord` as a derived projection, source-specific ingestion adapters, an
> analyst review and audit-lock workflow, and a domain-oriented module structure
> (`ingestion`, `emissions`, `review`, `facilities`, `audit`, `tenancy`).

---

## ADR-001 — Authentication Scope

**Status:** Accepted (prototype scope)

### Context
The assignment is graded on data model quality, defensibility of decisions, source realism,
analyst UX, and what was deliberately not built. None of those criteria reward an identity
system. The thing being evaluated is what happens to *emissions evidence* between ingestion and
audit sign-off — provenance, normalization, review, locking — not how a user proves who they
are. Time is fixed at four days; every hour spent on auth is an hour not spent on the part that
is actually scored.

### Alternatives Considered
- **Full JWT auth + RBAC + SSO (SAML/OIDC).** This is the correct production posture for a
  regulated multi-tenant platform. But it is undifferentiated plumbing here: it demonstrates that
  I can wire up a well-known library, not that I understand emissions data lineage. It also
  expands the attack/test surface in a demo where there is one persona.
- **Session auth with a real user table and a couple of roles.** Lighter, but still pulls focus
  toward permission matrices and login flows that no grading criterion touches, and invites
  reviewers to evaluate an identity model that was never the point.
- **No auth at all (fully open app).** Rejected — it would undermine the audit narrative, because
  audit requires an *actor* on every action. Actions with no attributable identity are not
  auditable.

### Decision
Simulate a **single authenticated analyst session.** The system behaves as though one known
analyst is logged in: every review action, edit, and approval is attributed to that identity and
written to the audit trail, so the auditability story is intact. JWT, RBAC, and SSO are
**intentionally omitted** and explicitly named as omitted, not forgotten.

### Consequences
- The audit trail still has a real actor on every event, so the lineage and accountability
  guarantees in `MODEL.md` hold without an identity subsystem.
- The system cannot, today, distinguish maker from checker, or enforce least privilege. This is
  acceptable because the workflow models a *single* competent reviewer; it is **not** acceptable
  in production, where maker-checker segregation is itself an audit control (see ADR-008
  consequences).
- The upgrade path is clean: because actions are already attributed to an actor identity, adding
  real auth later means populating that identity from a token/session rather than reworking the
  audit model. Nothing in the data model assumes the absence of auth.
- A reviewer challenging "you skipped auth" is answered with: the grading rubric values data
  judgment over identity plumbing, the audit model still requires and records an actor, and the
  real risk (an unattributable change) is structurally prevented.

---

## ADR-002 — Multi-Tenancy

**Status:** Accepted

### Context
Breathe ingests data for multiple client companies, and Breathe's own analysts plausibly steward
several clients at once. Tenant data must never cross, and an assurance provider engaged for one
client must be structurally unable to encounter another's evidence. At the same time, the
methodology, factor logic, normalization, and audit behavior must be identical across tenants and
maintained on one code/migration path.

### Alternatives Considered
- **Database-per-tenant.** Strongest isolation and the cleanest "physically separate" compliance
  story. Rejected for the prototype: it multiplies connection management, migrations, backups,
  and deployment cost per client, and makes the cross-tenant operations our own analysts perform
  (and the single-deploy demo requirement) painful. It is the right answer only when a specific
  client's contract or regulator demands physical separation.
- **Schema-per-tenant (one Postgres schema per client).** Good logical isolation, and a popular
  Django pattern. Rejected because every methodology or factor change becomes an N-schema
  migration, the operational surface grows with each onboarded client, and the demo gets heavier
  for isolation we can achieve other ways. It is the natural *first* upgrade step, and the model
  does not preclude it.
- **Shared schema, tenant discriminator (chosen).** One schema, `organization_id` on every owned
  row.

### Decision
**Shared database, shared schema, `organization_id` discriminator** on every owned table —
evidence, projections, mappings, factors-if-tenant-specific, review actions, audit events.
Isolation is enforced by a tenant-resolution boundary plus a data-access layer that filters by
the active tenant and **fails closed** (a missing scope returns nothing, never everything),
reinforced with database row-level security as defense-in-depth.

### Consequences
- **Operational simplicity:** one migration path, one connection pool, one backup target, one
  deploy — which is exactly what the "must be deployed" requirement and a four-day budget need.
- **The honest risk:** a single missing tenant filter could leak data across clients. This is why
  isolation does **not** rest on developer discipline alone — fail-closed scoping plus RLS plus
  tests that assert a tenant query can never return another tenant's rows. A reviewer challenging
  "shared schema is risky" is answered with defense-in-depth, not optimism.
- **Audit relevance:** `organization_id` is part of the identity on every evidence row and audit
  event, so per-client assurance is structurally bounded.
- **Upgrade path stated up front:** schema-per-tenant or DB-per-tenant when a client's regulatory
  posture demands physical separation; no data-model change is required to get there because the
  tenant key already exists everywhere.

---

## ADR-003 — SAP Ingestion Strategy

**Status:** Accepted

### Context
Fuel (Scope 1) and procurement (Scope 3 Cat 1) data originate in SAP MM, in tables like `EKKO`
/`EKPO` (purchase order header/items) and `MSEG`/`MATDOC` (material movements), with fields such
as `WERKS` (4-char plant code, meaningless without the `T001W` plant table), `MATNR`, `MENGE`
(quantity), and `MEINS` (unit of measure). The same export in a German configuration ships
headers like `Werk` and `Basismengeneinheit`, dates as `YYYYMMDD` or `DD.MM.YYYY`, and decimal
commas (`1.234,56`). The decisive operational reality: a new enterprise client's SAP is owned by
their Basis/security team, and programmatic access is gated behind weeks of review.

### Alternatives Considered
- **OData / SAP Gateway service.** The modern, correct long-term connector — supports filtering,
  delta queries, pagination. Rejected for onboarding because it requires the client to expose and
  authorize a Gateway service and grant credentials; that does not exist on day one and often
  takes weeks. Building against it now means building against access we don't have.
- **BAPI/RFC (e.g. via a custom RAP entity).** ABAP-native and powerful, but even more deeply
  inside the client's locked-down landscape, requires SAP connectivity libraries, and is the
  least likely thing a client grants a vendor early. Wrong tool for first-contact onboarding.
- **IDoc / EDI.** Asynchronous, document-oriented, designed for established system-to-system
  partnerships — not for a vendor receiving a one-off extract during onboarding. Heavy ceremony
  (ports, partner profiles) for zero early benefit.
- **ALV-style flat CSV/XLSX export (chosen).** What a functional analyst actually produces by
  running a transaction (e.g. ME2N/MB51) and exporting the ALV grid to a spreadsheet.

### Decision
Ingest **ALV-style CSV exports modeled on `EKKO`/`EKPO` procurement data**, via analyst file
upload through a SAP-specific adapter. The adapter handles the SAP realities explicitly: German
↔ English header aliasing via versioned mapping data, `WERKS` resolved through a per-tenant plant
table (unmapped codes block approval rather than being guessed), SAP date formats, and
decimal-comma locales. We deliberately handle a defined subset (fuel and procurement line items)
and ignore IDoc/EDI streams, live delta sync, multi-currency conversion, and the full material
master hierarchy.

### Consequences
- **Realism that maps to onboarding reality:** "someone emailed us a spreadsheet" is the actual
  day-one artifact, and the sample data reflects real SAP messiness (mixed-language headers,
  unmapped plants, decimal commas) — which is what the source-realism criterion rewards.
- **Lost context vs. live SAP:** a flat file lacks the referential integrity a live connection
  has; we reconstruct facility meaning through versioned mapping tables, which is itself an
  auditable artifact.
- **Audit implication:** because an unmapped `WERKS` blocks approval, **no emission is ever
  attributed to a guessed facility** — a property an auditor can rely on.
- **Clean evolution:** the adapter contract means an OData pull can later replace file upload
  without changing the normalization, emission, or audit layers — the file-first choice does not
  paint us into a corner.
- A reviewer challenging "real SAP is OData/BAPI" is answered with: those require access a vendor
  does not have at onboarding; the file export is the genuine first artifact; and the adapter
  boundary makes the upgrade a swap, not a rewrite.

---

## ADR-004 — Utility Ingestion Strategy

**Status:** Accepted

### Context
Electricity data (Scope 2) is what a facilities team can actually obtain. The realistic artifact
is a **portal CSV export** (Green Button "Download My Data" style): columns like meter, type,
start date, end date, usage, units (kWh), cost, and notes (e.g. "estimated read"). Real-world
quirks: billing periods that do **not** align to calendar months, frequently blank or
inconsistent tariff strings, estimated vs. actual reads, and exclusive end-date semantics.

### Alternatives Considered
- **PDF bill OCR.** Bills do arrive as PDFs, so this is tempting for realism. Rejected: OCR of
  heterogeneous utility bill layouts is brittle, high-effort, and — critically for this domain —
  introduces an **extraction-confidence problem** into the evidence itself. An OCR
  misread becomes a silent data-integrity defect that is hard to audit. The effort-to-reliability
  ratio is poor for a four-day prototype.
- **Utility-provider APIs / aggregators (e.g. UtilityAPI).** Clean structured data, but require
  per-utility OAuth and client authorization that, like SAP OData, does not exist at onboarding;
  also adds a third-party dependency and credentials to a demo.
- **Portal CSV export (chosen).** What facilities teams genuinely download today.

### Decision
Ingest **utility portal CSV exports** via file upload through a utility-specific adapter. The
adapter normalizes usage to kWh, performs **day-weighted allocation** of billing periods onto
reporting periods (a Dec 18 – Jan 17 bill split across two months, with the split recorded as
part of the derivation), flags estimated reads as lower-confidence, tolerates blank/garbled
tariff strings, and respects exclusive end-date semantics. Sub-hourly AMI interval data, demand
(kW) charges, non-electricity resource types, and full tariff-rate modeling are out of scope.

### Consequences
- **Reliability:** parsing structured CSV is deterministic and verifiable; we avoid importing
  OCR uncertainty into the authoritative evidence.
- **Audit implication:** the period-allocation derivation is stored, not hidden, so an auditor
  can see one bill became two reporting-period records and exactly how — and estimated reads
  carry a visible lower-confidence marker rather than being silently trusted.
- **Known approximation, stated:** day-weighted allocation assumes even daily consumption; AMI
  data would remove the assumption but is deliberately out of scope, and the assumption is
  recorded as derivation metadata so it is defensible rather than invisible.
- **No guessing on units:** a row with a missing/unknown unit is flagged and blocked, never
  silently converted (consistent with `MODEL.md` §9).
- A reviewer challenging "bills are really PDFs" is answered with: PDF OCR injects
  unauditable extraction error into evidence; the CSV export is a real, reliable artifact; and
  the adapter can add an API source later without disturbing the evidence/projection split.

---

## ADR-005 — Travel Ingestion Strategy

**Status:** Accepted

### Context
Business travel (Scope 3 Cat 6) comes from corporate travel platforms (Concur, Navan). Their
itinerary feeds expose segment-level JSON with IATA airport codes
(`start_airport_code`/`end_airport_code`, or `departureAirportCode`/`arrivalAirportCode`), cabin
class, flight number, and vendor — and a **distance that is frequently empty.** Different
categories (flight, hotel, ground) imply different emission factors. These platforms push data
via webhook-style event payloads in real deployments.

### Alternatives Considered
- **Live Concur/Navan API pull with OAuth.** The eventual production integration, but requires an
  enterprise app review and per-client authorization that is unavailable during a prototype; also
  binds the demo to a third party's credentials and rate limits.
- **CSV expense export.** Possible, but expense exports are spend-oriented and frequently lack the
  segment-level detail (airport pairs, cabin) needed for activity-based travel emissions; choosing
  CSV here would force spend-based Scope 3 and discard the realism the JSON feed provides.
- **JSON webhook-style payloads (chosen).** Mirrors the exact shape these platforms emit, captured
  as an uploadable/postable payload for the prototype.

### Decision
Ingest **JSON webhook-style payloads modeled on Concur/Navan itinerary segments** through a
travel-specific adapter. The adapter derives **great-circle distance from IATA airport pairs when
distance is missing** (flagging the figure as distance-derived rather than reported), selects
emission factors by cabin class and haul band, and maps hotels (room-nights) and ground transport
separately. Radiative-forcing uplift toggles, rail, full multi-leg trip stitching, and live
webhook subscription are out of scope.

### Consequences
- **Most realistic prototype path:** modeling the genuine JSON segment shape proves the API docs
  were read, while staying deployable without third-party credentials — and the webhook-style
  framing means flipping to a real subscription is an adapter change, not a redesign.
- **Audit implication:** every flight emission records whether its distance was **reported or
  derived**, plus the cabin assumption and factor version, so an auditor can cleanly separate
  measured travel from modeled travel.
- **Known approximation, stated:** great-circle distance ignores routing/airspace detours (as
  DEFRA/ICAO-aligned methodologies note); this is recorded as derivation metadata, not hidden.
- **No silent zeros:** an unmapped or malformed airport code is flagged and blocks approval rather
  than producing a zero-emission flight.
- A reviewer challenging "why not the real API" is answered with: enterprise API access does not
  exist at prototype time, the JSON shape is faithfully modeled, and the adapter contract makes
  the live-feed upgrade a localized change.

---

## ADR-006 — Data Modeling Strategy

**Status:** Accepted (foundational; detailed in `MODEL.md`)

### Context
Emissions figures are re-examined, challenged, and recalculated years after ingestion, under
methodologies and emission factors that did not exist when the data arrived. The model must let
us reproduce or restate any figure **without altering what the client originally sent.** This is
the requirement that dictates the entire model.

### Alternatives Considered
- **Single fat table** (`source_json` blob plus computed `co2e`, `unit`, `scope` on the same row).
  Fast to build, fatal to audit: editing an interpretation overwrites the client's stated fact,
  and a methodology change becomes a destructive in-place update to the authoritative record.
  There is then no answer to "what did the source say before anyone touched it."
- **Normalize-only (discard raw after parsing).** Smaller storage, but throws away the evidence;
  re-normalizing under a new methodology becomes impossible without re-requesting data from the
  client, and lost source fields are lost forever.
- **Separate immutable evidence + derived projection (chosen).**

### Decision
Keep **`RawIngestionPayload`** (append-only, immutable, JSONB, authoritative evidence) and
**`NormalizedEmissionRecord`** (derived, recomputable projection) intentionally separate, with a
one-directional pure derivation from raw to normalized and provenance enforced by referential
integrity. Each projection pins the factor/unit/mapping/methodology versions it was computed
under and carries a recompute signature.

### Consequences
- **Replayability:** because evidence is immutable, any record or whole period can be re-derived
  faithfully on demand.
- **Lineage and provenance:** any published kgCO2e resolves, by foreign keys alone, to the exact
  source row, the literal file, and the factor/unit/mapping/methodology versions used — provenance
  is structural, not annotated.
- **Future recalculation without touching evidence:** a new factor set or methodology produces a
  **new projection** over **unchanged evidence**, with the prior figure still reconstructable, so
  restatements are explainable ("originally X under DEFRA 2023; restated to Y under DEFRA 2024,
  effective <date>, because <reason>") rather than silent.
- **Cost, stated:** more tables, more joins, more storage (raw is kept forever). Accepted because
  this is precisely the property that makes the platform audit-grade; the storage cost is trivial
  next to the cost of an unprovable number.
- A reviewer challenging "why not one table" is answered with: a combined table cannot answer the
  auditor's first question and turns every methodology change into tampering-shaped edits.

---

## ADR-007 — Auditability Strategy

**Status:** Accepted

### Context
Two distinct audit needs exist. First, **source preservation:** the exact evidence as received,
provably unaltered. Second, **record-level history:** who changed which interpretation, when, from
what value to what, and why. The deployment is a single Postgres-backed application, not a
distributed platform.

### Alternatives Considered
- **A streaming/event-bus backbone — Kafka, Pulsar, AWS EventBridge, or a custom event bus.**
  These are frequently reached for when someone hears "immutable" and "audit" and pattern-matches
  to event sourcing. Rejected deliberately: they solve *distribution, throughput, and decoupling
  of many services* — problems this system does not have. They would add brokers, retention
  config, schema registries, consumer-offset management, and a second source of truth to keep
  consistent with Postgres, all for a single-app prototype. Worse for *this* domain: an event log
  optimized for replay across services is not the same as a **legally defensible, queryable
  audit record** an assurance provider can interrogate; we would still need the relational audit
  tables, now with a distributed-systems consistency problem layered on top. The operational and
  cognitive cost is real and the benefit is zero at this scale.
- **Hand-rolled audit tables for everything.** Maximum control, but re-implements well-trodden
  record-history mechanics and risks subtle gaps (missed fields, missed code paths).
- **Library-based record history + immutable raw storage (chosen).**

### Decision
Use **`django-simple-history`** for record-level history on the mutable interpretation entities
(captures per-field before/after, actor, and timestamp on `NormalizedEmissionRecord` and related
governance data), and use **immutable `RawIngestionPayload` storage** (append-only, hashed,
never updated/deleted) for source preservation. The two together cover both audit needs.
Streaming/event-bus infrastructure is **intentionally excluded.**

### Consequences
- **Right tool per need:** evidence integrity comes from immutability + hashing; change
  accountability comes from a proven history mechanism — neither reinvented nor over-built.
- **Queryable audit, not a log to mine:** history lives in relational tables an auditor (or our
  controls) can query directly, rather than in an event stream that must be replayed to answer a
  question.
- **A stated limitation of the library choice:** `django-simple-history` captures changes that go
  through the ORM, and history tables grow with edit volume; bulk operations must be routed
  through history-aware paths, and growth is managed by archival later. This is named, not
  glossed.
- **Operational simplicity:** no brokers, no second consistency domain — the audit trail is as
  durable as the (backed-up) database it lives in.
- A reviewer challenging "shouldn't an immutable audit system be event-sourced on Kafka" is
  answered with: streaming solves distribution problems we don't have, adds a second source of
  truth to reconcile, and still wouldn't replace the relational audit tables an assurance review
  actually queries. Immutability is a *storage and access* guarantee here, achieved without a bus.

---

## ADR-008 — Review and Approval Workflow

**Status:** Accepted

### Context
A `NormalizedEmissionRecord` is an interpretation, and interpretations must be reviewed by a
competent person before they are relied upon for audit. There must be an unambiguous boundary
between "working figure analysts are still adjusting" and "figure handed to auditors," and once
past that boundary the figure must not change quietly.

### Alternatives Considered
- **A mutable `is_approved` boolean.** Simple, and exactly the trap to avoid: a boolean flag does
  not capture *when*, *by whom*, or *from what prior state* approval happened, and it permits the
  approved row to keep being edited in place — the figure auditors rely on could silently change
  with no trace.
- **Delete-and-reinsert on correction.** Throws away the prior figure and its review history; an
  auditor can no longer see that a number was restated or why.
- **Explicit state machine with audit-locking and supersession (chosen).**

### Decision
Model review as an **explicit state transition** (`ingested → needs_review → (flagged | edited) →
approved → locked`, with `rejected` and `locked → superseded`). **Approval is a transition, not a
flag**, so it is timestamped, attributed, and recorded in history. **Approved records become
audit-locked**, with the lock enforced at the database layer so even a faulty endpoint cannot
mutate an approved figure. **Corrections to locked figures occur through supersession:** a new
version (or fresh projection from the unchanged evidence) is created and re-enters review;
nothing approved is ever silently overwritten.

### Consequences
- **Approval is meaningful and provable:** "who signed this off, when, and on what basis" is a
  query, because approval is an attributed transition rather than a bit flip.
- **Locked means locked:** enforcement below the application layer means the integrity guarantee
  does not depend on every code path remembering to check a flag — the most common way such
  guarantees rot.
- **Restatement is first-class:** supersession preserves the prior figure and its review trail, so
  a corrected number reads as an explainable restatement, consistent with the recalculation story
  in ADR-006 and `MODEL.md` §7.
- **Interaction with ADR-001:** the workflow currently models a single competent reviewer. It does
  **not** enforce maker-checker segregation (the approver could be the editor). In production that
  segregation is itself an audit control and would be added alongside real auth; the state machine
  already has the seams (distinct actors per transition are recorded) to enforce it without
  redesign.
- A reviewer challenging "why not just an approved boolean" is answered with: a boolean cannot be
  audited, permits silent post-approval mutation, and has no concept of restatement — all three of
  which are disqualifying in a regulatory-grade system.
