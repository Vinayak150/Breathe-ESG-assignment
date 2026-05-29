# TRADEOFFS.md — Deliberate Exclusions

> This document records what was left out on purpose. Each exclusion was a choice, not an
> oversight, and each one bought the prototype focus, determinism, or audit defensibility that the
> included scope depends on. The bias throughout: a smaller system whose every number is provable
> beats a larger system whose behavior no one can fully account for. Each item is stated as
> Benefit (of building it) / Cost (of building it now) / Why excluded / Future implementation
> path, so the reasoning can be challenged on its merits.

---

## 1. PDF OCR Exclusion

Utility bills and some SAP/travel artifacts genuinely arrive as PDFs. We chose not to extract
data from them by OCR.

**The core problem: OCR is probabilistic, and this system's evidence layer must be deterministic.**
OCR returns a *most-likely* character sequence with a confidence score, not a fact. A `7` read as
a `1`, a decimal point lost in a scan artifact, a column boundary misdetected on a multi-column
bill — each produces a value that *looks* clean but is silently wrong. In a platform whose entire
premise (`MODEL.md`) is that `RawIngestionPayload` is authoritative, immutable evidence, admitting
a probabilistic extraction into that layer poisons the well: the "evidence" is now an inference,
and the chain of custody starts with a guess.

**Auditability and reconciliation risks specifically.** An auditor asks "does this stored figure
match the source document?" With OCR the honest answer is "to within the OCR engine's confidence,
probably." Reconciliation becomes a fuzzy-match exercise rather than an equality check, and every
OCR misread is an audit finding waiting to happen — one that is hard to even *detect* because the
output is well-formed. Worse, OCR errors are not uniformly random; they cluster on the exact
fields that matter (digits, decimals, units), so the failures concentrate where they do the most
damage.

**Why CSV ingestion is deterministic evidence.** A portal CSV export is a structured artifact the
source system *generated*, not an image we *interpreted*. Parsing it is exact and repeatable: the
same file yields the same payload byte-for-byte, the content hash is meaningful, and "does stored
match source" is a true equality check. The evidence layer stays trustworthy.

- **Benefit (of OCR):** broader source coverage; can ingest bills that only exist as PDFs.
- **Cost (of OCR now):** probabilistic values in the authoritative layer, an unbounded
  reconciliation/QA burden, and a confidence-tracking subsystem to make the uncertainty auditable.
- **Why excluded:** it directly contradicts the deterministic-evidence guarantee that the rest of
  the model is built on, for a four-day prototype graded on auditability.
- **Future implementation path:** treat OCR as a *staging/extraction* step that produces a
  **draft** payload requiring human confirmation against the attached original, with per-field
  confidence stored as derivation metadata — never as a direct write to authoritative evidence.
  The immutable-original-plus-content-hash design already accommodates this: the PDF is preserved;
  only the *interpretation* of it would carry confidence.

---

## 2. Live Provider Integration Exclusion (SAP / Utility / Travel APIs)

We ingest files and webhook-style payloads rather than pulling live from SAP OData/BAPI, utility
provider APIs, or Concur/Navan APIs.

**Onboarding reality is the deciding factor, not technical preference.** A new enterprise client's
source systems are owned by their security teams, and programmatic access is granted late, if at
all, in the onboarding timeline:

- **SAP:** OData/Gateway or BAPI/RFC access requires the client's Basis and security teams to
  expose and authorize a service and issue credentials — typically weeks of review. On day one,
  the artifact that actually exists is an ALV export someone ran and sent.
- **Utility:** provider APIs (or aggregators) require per-utility OAuth and account authorization
  the client controls; what the facilities team can produce immediately is a portal CSV.
- **Travel:** Concur/Navan API access requires an enterprise app review and per-client
  authorization; the realistic early artifact is an itinerary export in the shape their webhooks
  emit.

Building against access we do not yet have would mean building against mocks of APIs, which proves
less about realism than modeling the artifacts clients genuinely hand over first.

- **Benefit (of live APIs):** continuous, structured, lower-touch ingestion; delta sync; less
  manual handling.
- **Cost (of live APIs now):** blocked on client-side access that doesn't exist at prototype time;
  third-party credentials, rate limits, and pagination/delta logic added to a demo; coupling the
  deployment to external service availability.
- **Why excluded:** file/payload ingestion is what unblocks real onboarding, and the
  source-specific **adapter contract** (`DECISIONS.md` ADR-003/004/005) means a live connector
  later is a swap behind the same interface — the normalization, emission, and audit layers don't
  change.
- **Future implementation path:** add API-pull adapters per source that emit the **same**
  `RawIngestionPayload` shape as the file adapters, so live and file ingestion converge on one
  evidence/projection pipeline. The seam already exists.

---

## 3. Real-Time Streaming Exclusion

We ingest in batches (a file or payload is a batch) and did not introduce Kafka, Pulsar, or any
event-stream backbone.

**Batch matches the cadence of the data.** Emissions evidence is inherently periodic: SAP exports
are run on demand, utility bills are monthly, travel itineraries settle per trip. There is no
stream of millisecond-latency events to consume — the natural unit is "a batch arrived, process and
review it." Imposing streaming on monthly bills is solving a problem the domain does not have.

**Why no Kafka/Pulsar/event-stream infrastructure.** Those tools solve distribution, high
throughput, and decoupling across many independent services. This system is a single application
with a worker tier and one database. Adding a broker would introduce a *second source of truth* to
keep consistent with Postgres, plus retention config, schema registries, and consumer-offset
management — operational and cognitive cost with no corresponding problem solved. It would also
muddy, not strengthen, the audit story: the authoritative, queryable record an assurance provider
interrogates is in relational tables, not in a replayable topic (`DECISIONS.md` ADR-007).

- **Benefit (of streaming):** near-real-time processing; natural fan-out to many consumers;
  smooths very high ingestion volume.
- **Cost (of streaming now):** a broker to operate and back up, a second consistency domain,
  and infrastructure whose justification (scale, multi-consumer decoupling) is absent here.
- **Why excluded:** batch is sufficient and honest for periodic evidence; streaming adds
  distributed-systems complexity to a problem that is not distributed.
- **Future implementation path:** if Breathe later needs many internal consumers of normalized
  records (analytics, alerting, downstream reporting) or true high-volume continuous feeds,
  introduce a stream **downstream** of the authoritative database (change-data-capture from
  Postgres), so the audit record stays canonical and the stream is a derived transport — never the
  source of truth.

---

## 4. Machine Learning Anomaly Detection Exclusion

Suspicious-row detection uses deterministic validation rules (missing/unknown unit, unmapped
plant/meter/airport code, negative or zero quantity, statistical outlier vs. a facility's own
history, billing period spanning a reporting boundary) rather than a trained ML model.

**Deterministic rules are preferred because anomalies here must be explainable to a human and an
auditor.** When the dashboard flags a row "suspicious," an analyst must be told *why* in terms they
can act on: "this meter read is 11x its trailing average," "this plant code has no facility
mapping." A rule states its own reason. An ML anomaly score says "0.92 anomalous" and cannot, by
itself, tell the analyst what to fix or tell the auditor why the figure was challenged.

**Audit and explainability concerns specifically.** An audit-grade system cannot have its
data-quality gate be a black box. If asked "why was this row held for review and that one passed?",
the answer must be a stated, reproducible criterion — not the output of a model whose decision
boundary shifts with retraining and whose behavior on a given row can't be reconstructed after the
fact. Deterministic rules are versionable (like factors and mappings), so "which rules were in
force when this batch was reviewed" is itself auditable; a retrained model silently changes
behavior between batches.

- **Benefit (of ML):** can surface subtle, multivariate anomalies that hand-written rules miss;
  adapts to patterns no one thought to encode.
- **Cost (of ML now):** unexplainable flags, training data and a retraining/monitoring lifecycle,
  non-reproducible decisions, and a data-quality gate an auditor cannot interrogate — plus it is
  premature without real client data to learn from.
- **Why excluded:** explainability and reproducibility are requirements, not nice-to-haves, for
  the review gate that decides what reaches auditors.
- **Future implementation path:** introduce ML strictly as an **advisory** layer that *raises*
  candidates into the existing rule-flag UI with a human-readable explanation, never as an
  autonomous accept/reject. Deterministic rules remain the auditable gate; ML widens recall.

---

## 5. Advanced Workflow Orchestration Exclusion

The review workflow is a single-reviewer state machine with audit-locking and supersession. We
deferred maker-checker segregation, escalation paths, and distributed/multi-stage approval chains.

**Why deferred.** These are organizational controls whose value appears only with multiple roles
and real auth — which the prototype intentionally does not model (`DECISIONS.md` ADR-001). Building
a multi-stage approval chain with escalations now would mean inventing a role hierarchy and
delegation rules that no grading criterion exercises and that would obscure the part that matters:
that approval is an attributed, audit-locking state transition and corrections happen by
supersession, not silent mutation (`DECISIONS.md` ADR-008). The *integrity primitive* is built; the
*org-chart on top of it* is deferred.

- **Benefit (of advanced orchestration):** separation of duties (maker ≠ checker) as a genuine
  audit control, escalation for disputed/high-materiality rows, and parallel approvals for large
  organizations.
- **Cost (of it now):** requires real identity and roles (absent by design), and adds workflow
  surface that doesn't change the data-integrity guarantees being evaluated.
- **Why excluded:** the underlying state machine already records distinct actors per transition, so
  segregation and escalation are *configuration and policy* on a model that already supports them —
  not a redesign. Deferring them keeps the prototype focused on provable data, not process
  ceremony.
- **Future implementation path:** alongside real auth, enforce maker-checker by rejecting an
  approval whose actor equals the last editor; add an `escalated` state and routing rules keyed on
  materiality; support multi-approver sign-off as additional recorded transitions. The state
  machine's seams (per-transition actor attribution) are already present.
