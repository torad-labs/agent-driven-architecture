# Architecture decisions

Final decisions record for the Agent-Driven Architecture, owner-decided 2026-07-26 after the
adversarial architecture review of the same date. This file is written to be executed from:
every entry is the decision as it stands, with the rationale needed to implement it correctly.
Process history lives in git, not here.

Status: all entries `decided`. Execution order is fixed at the end (P0→P5).

---

## Theme 1 — Enforcement

- **D1 — The compile-enforced module DAG lands** (Kotlin: Gradle module DAG per ADR-001, as
  amended by D9; TypeScript: the workspace wall per D11), including ADR-001's book edits
  (§4.7, §7.5/7.8; D3 owns §15). ADR-001 is first scrubbed of external personal-project
  references (the module/plugin shape must be specified self-contained, executable without
  any other checkout) and its §4 plugin table is rewritten for D9's two-module-per-block
  structure.
- **D2 — Three DAG-independent fixes land in P1:**
  (a) disable-comments forbidden in both lint configs — `linterOptions.noInlineConfig` in
  TypeScript, detekt's suppress-denial mechanism in Kotlin;
  (b) `Signature` becomes non-data with an internal constructor in Kotlin and a branded type
  in TS, deleting the `copy()` forge vector. **Equality is hand-kept** (`equals`/`hashCode`/
  `toString` written explicitly) — the data class currently supplies the equality the replay
  assertions rely on, and losing it fails them sideways;
  (c) the ToolResult production-site check (C7) extends to `Command` construction, which
  nothing guards today (a fold arm can currently build a Command with a `copy()`-modified
  signature into its own slice, replay-consistently). Interim measure: the DAG seals
  `Command` in `:spine` and dissolves the hole structurally — same one-release sunset as
  D11's hand-rolled checks.
- **D3 — §15 is inverted:** impossible-to-express first, configuration-time second, a denying
  check only for what is genuinely semantic. Each invariant carries its enforcement layer.
- **D4 — Check-authoring becomes a first-class chapter** (block-test, allow-test, red-green,
  fix-never-disable), placed as an **appendix** so §16/§17 keep their numbers. C13 (registry
  totality) gains its missing violating/compliant fixture pair.
- **D5 — A gate for the gate:** no new invariant without a declared enforcement layer; no
  lint-enforced invariant without its fixture pair. Mechanism: **`laws.toml` is the single
  source of truth** (id, name, enforcement layer, fixture pointer); the book's G-table is
  generated from it and the meta-check parses it. G-IDs live in the registry; C-IDs live in
  the check roster as internal IDs, never cited as book authority. **`laws.toml` lands in P2,
  before §15's rewrite, so the inverted G-table is generated once, not hand-written then
  regenerated.**
- **D6 — The book carries the sentence:** "a wall you can annotate past is a door."

## Theme 2 — Structure

- **D7 — One canonical dependency-rule sentence,** used verbatim in the book, the example, and
  code comments (working text: "an import may point inward toward the core, or it is the
  composition root" — owner approves final wording at review).
- **D8 — Figure and table unified:** the three-ring figure becomes canonical; the layer table
  is rewritten to say the same thing in the same vocabulary.
- **D9 — Block adapters stay in the block, as two Gradle modules per block:** `:block:<x>`
  (pure — no IO on the classpath) and `:block:<x>:adapter` (IO allowed). Gradle cannot scope
  dependency bans below module granularity; this is the structure that keeps "pull a block out
  by deleting the folder" true under the DAG.
- **D10 — Modules are the ultimate isolation; tools and commands are the lego pins and
  holes.** The `adr.contract` name-prefix convention is the interim state and is named as
  such in the book; the DAG is the end state.
- **D11 — TypeScript gets the real wall:** one npm workspace package per block, `exports`
  limited to the registration, `tsconfig` project references. **Tests co-locate** inside each
  block package (internals visible by residency; hidden from everyone else). The hand-rolled
  import checks (C1/C2/C15) survive one release past the wall, then are deleted.
- **D12 — Effect performance becomes registrable per block:** blocks register effect handlers
  like verbs; the root assembles the dispatcher. Type/handler split, made explicit because the
  DAG depends on it: effect *cases* stay sealed in the spine (ADR-001 §5); what blocks register
  are *handlers* — functions, not types. Totality rule: a missing handler mirrors
  `unclaimedArm` — diagnostic plus notice, never silent; the spine-owned `Diag` handler stays
  at the root. This makes "zero sites outside the folder" true for novel effect kinds.

## Theme 3 — Integrity

- **D13 — merged into D2 (one work item).**
- **D14 — Ports first:** the Signature fix lands in Kotlin and TS, then the worked example's
  `data Signature` pseudocode follows.
- **D15 — Actor grows a third value: `Actor.Spine`,** the stamp for consumer/mailbox-authored
  events (conflations, faults, blown deadlines). §5.1's "never grows" becomes "grows only at
  architecture revision, never per application"; the glossary, §14.3's confirmer table, and
  every "two-value enum" mention amend in the same pass. Code work (P1): the enum value, the
  consumer stamp sites, and the authority tables — each gains a `Spine` entry, default value
  `spine:consumer` (the `Record<Actor, Authority>` totality makes a missing entry a compile
  error; the value matters because the gate compares authorities). Execution note: **audit
  every `FinishedStep` construction site**, not only the two known hard-coded `by: "Agent"`
  paths in the consumers.
- **D16 — Effects declare a class (`Routine | Irreversible`), and the boundary refuses before
  perform.** Two layers: now, a static check denies Irreversible-class effects from
  Reversible-classified verbs' arms; in the DAG era, ADR-001 §6.6's witness token makes an
  irreversible effect unconstructible without a gate-minted, payload-bound token. (The sink
  never sees results and cannot gate — the seam is the boundary.)
- **D17 — §14.3 gains the atomicity paragraph:** gate and fold read one committed snapshot
  inside one synchronous seam behind the serial consumer; splitting them across an await
  re-opens the TOCTOU hole.
- **D18 — The same-step refusal is stated as a rule:** a request must commit in an earlier
  step than its confirm; batching them guarantees refusal.

## Theme 4 — Durability and replay

- **D19 — The dedupe `SourceKey` rides the committed `Perceived` fixture, and the consumer
  rebuilds its dedupe set from the timeline at recovery.** The key is pinned by the *record*,
  and `render()` excludes it, so the model's context and the golden digests stay clean. The
  recovery bootstrap is named: a fresh consumer is constructed with the timeline (a
  `rebuildFromTimeline(records)` seam), which is what makes the rebuild possible rather than
  aspirational. §12.2/§14.4's exactly-once invariant also gains its scope sentence.
- **D20 — A minimal snapshot adapter ships:** memoized fold prefix, tagged with the reducer
  version and timeline offset it covers (the tagging rule already lives in §14.1), proven by
  the live-vs-replay harness.
- **D21 — `StepRecord` gains `schemaVersion`** (the envelope rule already in §14.7), with one
  worked v1→v2 upcaster (`SetPriority` gains an optional field) and a replay test over an
  old-shape log. Genesis version is 1 — no persisted logs exist in the reference, so there is
  no v0 migration.
- **D22 — The book names the canonicalization obligation, not a format:** *if you hash, you
  need a canonical, versioned encoding, pinned alongside the schema version* (§14.1's callout,
  sharpened). The encoding itself is product-owned. No cross-port hash test — the two example
  ports never replay each other's sessions.
- **D23 — One explicit sentence on timeline growth:** unbounded by design; bounding and
  retention live at the product-owned persistence seam.
- **D24 — A minimal cursor tool ships** (re-fold prefix to step k), proving the scrub story
  by exercise.

## Theme 5 — Claims, nomenclature, decoupling

- **D25 — The blast-radius claim becomes a three-row measured table, written DAG-aware and
  after D12 lands.** Under the DAG the transport cases (`ToolResult`/`Command`/`Effect`) are
  spine-owned sealed types, so "four sites inside one folder" is dead and the honest headline
  is ADR-001's: *a handful of appends, every one compiler-named, none a rewrite of shared
  logic.* Rows: verb reusing effects (in-folder: registry entry + fold arm; spine appends:
  the transport cases) / verb with a novel effect (plus its handler registration, D12) /
  new block (the module pair, D9, plus the root appends).
- **D26 — The inject-a-variant proof runs in every build, both ports:** Kotlin keeps its
  must-fail compilation; TS gets the equivalent — a `tsc` run on the five-variant fixture
  asserting non-zero exit naming all three consumer sites.
- **D27 — The numeric claims are deleted** ("35 files", "82 total", "one file names the
  runtime").
- **D28 — The spine-parity claim is dropped** ("same 35, identical shape").
- **D29 — §17.6's nomenclature table gains the architecture-level names as they exist in
  code** (`FoldOut`, `ArmOut`, `BlockRegistration`); mechanisms (`OkResult`, `Emit`,
  `Narrator`, `Main`) stay in code. No renames.
- **D30 — One public namespace:** G-laws (from `laws.toml`, D5) plus book section numbers.
  F/A/L/D IDs are remediation-process artifacts, retired from citations. A reference lint
  validates section/invariant citations in code comments against the book (the phantom-I5
  class).
- **D31 — §17.4's exercised/specified table moves out of the book,** to the example's own
  overview (`wiki/example/index.html`) and the ports' READMEs, in the example's voice — those
  READMEs already carry the specified-but-unproven labels today. The book's ladder describes
  rungs as architecture; claims never lean on the example as proof. **The move happens in
  P5**, after the P3/P4 rungs land, so the table moves once and is current when it does.
- **D32 — Book and example are decoupled.** Sweep rule: any sentence in `wiki/` whose truth
  depends on the current state of `examples/` is a port-fact — move it or delete it. The
  README legitimately keeps repo-facts.

## Theme 6 — Adoption and positioning

- **D33 — A day-one quickstart is written:** copy the spine, register one verb, run the test,
  watch a session replay — a working one-verb app in about an hour.
- **D34 — The spine is a vendored template forever;** no package is published. The book states
  patch propagation is the adopter's responsibility, and the vendored tree carries a
  **spine version marker file** that the CHANGELOG (D42) keys on — without it there is no
  migration mechanism at all.
- **D35 — A third, hostile port (Swift or Python) is commissioned at the owner's call,**
  prompted by the first external adopter.
- **D36 — Teachability is the metric:** "a fresh author — human or agent — can implement a
  block from its contract alone" (G13's test), run as part of the D42 release ritual, not on
  an unowned "periodic" schedule.
- **D37 — §8.2's capability contract is promoted to the book's spine;** "the shape the Vercel
  AI SDK popularised" becomes one example of it.

## Theme 7 — The declined seams

- **D38 — The default authorization models the recommended pattern:** an authority-keyed
  policy table, not a check on `sig.by`.
- **D39 — The cross-session budget seam gets its sketch (prose only):** a boundary-side port
  with its own store (not folded state), verdict captured as an ordered fixture — the
  authorization shape, named and bounded, still product-implemented.
- **D40 — Context bounds become root-configurable:** bounds become a `BoundaryDeps` field
  injected at wire time, with the current spine constants as defaults; the same edit notes
  that the committed digest catches silent bound changes.

## Theme 8 — Surface and upkeep

- **D41 — Two sentences, no laws:** (a) §6.9 gains: the surface renders committed state only —
  no optimistic rendering — with the provider token-stream (§8.2) as the sole named exception;
  (b) §14.3 gains: the pending request is folded state, so the projection shows it like any
  other — no new variant law. No G17/G18; §16.4's bar (a named production failure) is unmet.
- **D42 — The architecture gets a CHANGELOG and a standing adversarial-review ritual** per
  release. Entries key on the spine version marker (D34) so vendored copies can migrate.

---

## Consequence chains — the decisions bind each other

1. **D1 → ADR-001 is amended and scrubbed before any DAG work** (D9's plugin table;
   self-contained specification).
2. **D15 → §5.1's freeze becomes a revision-controlled freeze.** Every "two-value enum"
   mention in book, glossary, and code comments amends in the same pass.
3. **D34 + D42 → the spine version marker is load-bearing.** Template-forever without it is
   template-abandoned: a spine defect fixed upstream never reaches vendored copies.
4. **D32 subsumes D27/D28:** one decoupling sweep deletes numeric claims and drops parity
   claims; D31's evidence move is sequenced separately (P5) so it lands current.
5. **D11 (workspace packages) coexists with D34 (template forever):** the TS spine ships as a
   vendored workspace *template* — packaged internally for the wall, never published.
6. **Three versions, deliberately not unified:** the reducer version (D20's snapshot tag),
   the envelope `schemaVersion` (D21), and the spine version marker (D34) are independent
   answers to independent questions. An executor who merges them re-creates the
   over-engineering the dissolution removed.

## Execution order (ratified)

- **P0** — Amend and scrub ADR-001 (D1, D9).
- **P1** — DAG-independent fixes: D2 (all three), D15's code work, D38.
- **P2** — Book surgery: D5 (`laws.toml` first), D3, D6–D8, D14, D17, D18, D22, D23,
  D27–D30, D32, D37, D39, D41, D15's book amendments.
- **P3** — Durability: D19–D21, D24.
- **P4** — The walls: Kotlin DAG (D1, D9, D10), TS workspace (D11), D12, D16's lint layer.
- **P5** — Distribution and upkeep: D4, D25, D26, D29, D31, D33, D36, D40, D42.

## Supersedes and open items

- OPEN-GAPS A1–A5: landed or subsumed. A6 (`owns` derivation) remains open, unaffected.
- D35 (third port): deferred per its own terms.
