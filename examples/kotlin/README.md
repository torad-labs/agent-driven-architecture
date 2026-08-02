# Agent-Driven Architecture — the Kotlin reference port

This is the **reference expression** of the sealed-transport idea. Kotlin has native sealed
hierarchies with **shared properties declared on the parent**, so every closed set in the system —
`ToolResult`, `Command`, `Effect`, `Notice`, `RunStatus`, `TicketStatus`, `SealStatus`, `Verb`,
`Gating` — declares its common fields **once** and every variant carries them **by construction**.

```
./gradlew check     # THE GATE — the suite plus every blocking check. This is the command.
./gradlew test      # the suite alone (the Konsist rules ARE JUnit tests)
./gradlew detekt    # the type-aware checks alone (C3, C9, C14)
./gradlew build     # compile + check
./gradlew apiDump   # regenerate the committed `.api` freeze after a deliberate surface change
./gradlew run       # a runnable, fully offline end-to-end demo — no keys, no network
```

The one network dependency is Maven Central (`ai.torad:torad-aisdk:0.3.0-alpha01`), resolved at
build time. Nothing in the demo or the tests reaches the network at run time.

---

## The tree teaches the architecture

The architecture is **fourteen Gradle modules** (declared in `settings.gradle.kts`), and the folder
tree *is* the dependency graph: a forbidden edge does not fail review, it fails **configuration**.
Every module puts its Kotlin under `<module>/src/main/kotlin/adr/`, so the package tree *below* that
segment is exactly what a single-module port would have written — which is how eleven source-bearing
module roots are read by the gate as ONE namespace.

```
spine/src/main/kotlin/adr/               :spine — THE TRUNK, block-agnostic, written once, never forked
│                                        (38 files, roster pinned by a GateTest; depends on NO other module)
├── spine/pure/                          ZERO I/O. The transport vocabulary and the shapes the app assembles.
├── spine/ports/                         INTERFACES ONLY. A file here with a body is a gate failure (C11).
├── spine/boundary/                      THE ONE IMPURE SEAM: action · gate · boundary · in-memory
├── spine/agent/                         the ONLY file in spine/ that imports the agent-loop runtime
├── spine/surface/                       ONE ViewModel stream + ONE onAction(Action) sink
├── spine/concurrency/                   the BARGE-IN loop (12) and the relay's read side: consumer · in-memory
├── spine/replay/                        Replay: refold · stateAtStep · collectPerform — ReplayFaithfulness: assertFaithful
└── blocks/<x>/Contract.kt               each block's TRANSPORT, and ONLY that — Kotlin's sealed rule, see below

block/<x>/src/main/kotlin/adr/blocks/<x>/          :block:<x> — THE LEAVES, one module per feature, PURE:
│                                                  `:spine` and nothing else may reach its classpath
├── triage/                              domain block          slice·tools·fold·project·register
├── escalation/                          domain block + gated verb          … + port
├── console/                             PRESENTATION block — folds AND signs … + view-state
├── artifact/                            the work product, as a folded slice … + port
├── analysis/                            the TIERING rung (11): recall + publish … + port
└── inbox/                               the BARGE-IN ledger (12): conflation and fault counters

block/<x>/adapter/src/main/kotlin/adr/blocks/<x>/  :block:<x>:adapter — the block's LIVE I/O, in the block's
                                                   OWN folder, so "delete the folder" still removes the block.
                                                   analysis · artifact · escalation own an `Adapter.kt`; the
                                                   other three modules are declared and deliberately empty.
                                                   ONLY `:app` may depend on one.

app/src/main/kotlin/adr/app/             :app — THE ROOT, the only module that may name every block AND every adapter
├── Contract.kt                          State (the product of slices) + the app's view
├── Assemble.kt                          the THREE total dispatchers: fold · project · projectContext
├── Wire.kt                              ports→adapters, the effect sink, the Boundary, the loop, the consumer
├── Main.kt · Narrator.kt                the entry point behind `./gradlew run`, and its transcript
└── Demo.kt                              a runnable offline script

src/test/                                THE GATE HARNESS and its fixture pairs, in the root project — which
                                         compiles no production Kotlin at all and exists to read every module
                                         at once. Two build tasks keep that true: `gateCompiledRootsAreGateRoots`
                                         fails on a compiled source root no gate reads, `gateNoSourceOutsideAdr`
                                         on a file that lands beside `adr/` instead of under it.
```

**Two spellings, one namespace.** On disk a block is `block/<x>/`; everywhere the gate reports —
and everywhere below in this README — it is `blocks/<x>/`, because every rule and every roster
normalises on the `/src/main/kotlin/adr/` segment. That is deliberate: the module split cost the
rules not one edit.

Read the folder names before you read a file. The rule they encode is the book's, in its canonical
wording: **an import may point inward toward the core, or it is the composition root; it may never
point outward from the core, sideways between adapters, or from a passive node — a surface or a
tool — into anything but domain types.** On this tree that reads: leaves and trunk point inward,
only the root spans.
`spine/pure/` versus `spine/boundary/` *is* the purity boundary, named as a folder. Inside a block the
same line is drawn again by file name — `contract · slice · tools · fold · project` are pure,
`adapter` is the rim, and `view-state` is the ephemeral-only exception 4.6 carves out. Under the
module DAG that rim is no longer only a file name: `adapter` is its own Gradle module, and the ban
on an I/O library reaching a pure block is enforced by the block's convention plugin at
configuration time rather than by the reader's discipline.

---

## A hard Kotlin constraint you must not "fix": the `adr.contract` package

Kotlin requires **every variant of a sealed hierarchy to be declared in the same package and module.**
Blocks contribute cases to three spine-rooted sealed types (`ToolResult`, `Command`, `Effect`) which
G12 requires to be sealed. Therefore:

* **Package `adr.contract` holds every transport declaration** — `spine/pure/ToolResult.kt`,
  `Command.kt`, `Effect.kt` **and** every block's `Contract.kt`. The files stay in their owning
  folder; only the *package line* is shared.
* Every other file uses a folder-matching package: `adr.spine.pure`, `adr.spine.ports`,
  `adr.spine.boundary`, `adr.spine.agent`, `adr.spine.surface`, `adr.spine.replay`,
  `adr.blocks.<x>`, `adr.app`.
* The compensation is **gate check C2**: a file under `blocks/X` may import from `adr.contract` only
  the three spine roots or symbols prefixed with `X` (`TriageResult`, `TriageCommand`, …). Everything
  else is denied by package.

This is a documented consequence of G12 plus Kotlin, not an accident. It reads oddly; the alternative
(an open marker root) would make TypeScript strictly stronger than Kotlin on the very property this
port exists to demonstrate. **No builder may "fix" it by opening the hierarchies.**

---

## Blast radius, measured on the code that is actually here

`docs/DECISIONS.md:122` asks for this as **three measured rows**, written after the module DAG and
after the handler split, and *measured* rather than asserted. It is measured here, in this port's
README, because counts are port-facts: the book states the shape, each port states its own numbers,
and where the two ports disagree the disagreement is the result rather than an embarrassment.

**Two counting conventions, both stated, because collapsing them is how the old numbers went wrong.**
A **declared site** is a decision you author — a case, a table row, an arm, a field, a build
declaration. An **edit site** is every *code* line the change touches, imports included; a comment
line that merely names the block is not one, and a single decision spanning two physical lines is
ONE edit site. Every excluded line below is named by number so you can add it back.

### Row 1 — a verb whose effects reuse effect kinds that already exist

**4 declared sites, 3 files, 1 folder — and TWO Gradle modules.**

| # | Site | File | Module | Named by |
|---|---|---|---|---|
| 1 | the `ToolResult` case | `blocks/<X>/Contract.kt` | `:spine` | it *is* the thing you are adding |
| 2 | the `Command` case | `blocks/<X>/Contract.kt` | `:spine` | it *is* the thing you are adding |
| 3 | the `Verb` row (name, description, decode, run, sign, reversibility) | `blocks/<X>/Tools.kt` | `:block:<X>` | gate check C13 |
| 4 | the fold-arm branch | `blocks/<X>/Fold.kt` | `:block:<X>` | exhaustive match over the block's sealed sub-union |

**The module column is the whole correction.** Kotlin seals a hierarchy within one *module*, so a
block's transport has to be authored inside `:spine` — the shared core — while its behaviour stays in
`:block:<X>`. The folder is still one (`blocks/<X>/`, and the census below proves it for every verb
in the tree); the compilation unit is not. ADR-001 §1.3 Q1 says so in advance and requires the older
four-sites-in-one-folder slogan deleted once the ADR is accepted; it was
ratified, and these three rows are the replacement.

**Zero production sites outside `blocks/<X>/`, measured for all twelve verbs, not sampled.**
`adr.gate.GateTest`'s `BLAST RADIUS` test derives each block's transport cases from Konsist's parse
tree and censuses which live files name each one; the answer must be exactly that block's
`Contract.kt`, `Tools.kt` and `Fold.kt`. It is derived rather than enumerated on purpose — a
spelled-out twelve-name set would make the census file itself a fourth site for the append it is
pricing — and it counts site 3 through the same import/typealias resolver gate check C17 uses, so a
verb table written `Reversible(` after `import adr.spine.pure.Verb.Reversible` is *accepted*, not
rejected. Both polarities ship as a checked-in fixture pair under
`src/test/fixtures/konsist/{violating,compliant}/BLAST-RADIUS/`.

**Out of folder, in the test tree: two count tripwires**, and both assert a *number* rather than an
enumerated list — `TotalityTest.kt`'s `assertEquals(12, names.size, "six blocks, twelve verbs")` and
`spine/GateTest.kt`'s `assertEquals(14, cases.size, …)`.

Adding `setPriority` (domain) and adding `setPanel` (presentation) touch **the same four sites**, and
that is asserted per block rather than promised: there is no cheaper UI path because there is no UI
path. **Re-measured after the tiering and barge-in rungs landed, and the number did not move.** With
only sites 1 and 2 written for a throwaway `resolveTicket`, the compiler names site 4 and nothing
else:

```
e: block/triage/src/main/kotlin/adr/blocks/triage/Fold.kt:28:26 'when' expression must be exhaustive.
   Add the 'is ResolveTicket' branch or an 'else' branch.
```

### Row 2 — a verb that also introduces a NOVEL EFFECT KIND

**Row 1, plus 2 declared sites — both inside the owning block, and zero at the root.**

| # | Site | File | Module | Named by |
|---|---|---|---|---|
| 5 | the `Effect` case | `blocks/<X>/Contract.kt` | `:spine` | it *is* the thing you are adding |
| 6 | the performer arm in the block's own registration | `blocks/<X>/Register.kt` | `:block:<X>` | the block's own exhaustive performer |

**The composition root does not move**, and that is what `docs/DECISIONS.md:64-69`'s handler split
bought. The one qualifier, written verbatim in `app/src/main/kotlin/adr/app/Wire.kt`: a block growing
its **first** effect kind also costs one compiler-named line in that file's performer assembly; a
kind appended to a union the block already has costs none.

**Out of folder: exactly one gate ledger** — `src/test/kotlin/adr/app/TotalityTest.kt`'s
`EffectSamples`, maintained per effect case the way the verb ledger already is.

Not asserted: `gateEffectKindBlockTest` (`build.gradle.kts`) drives the red-green fixture pair under
`src/test/fixtures/effect-kind/{violating,compliant}/`, whose `Root.kt` exists precisely so the
"and nowhere else" guard can go red; and `GateTest`'s live-tree and test-tree censuses assert the
out-of-folder set as an *equality* rather than as an absence.

### Row 3 — a whole new block

Measured against `inbox`, the minimal block in the tree: no port, no adapter source, no effect.

**New files: 8** — and that is what git tracks, not a claim:

```
git ls-files examples/kotlin/block/inbox examples/kotlin/spine/src/main/kotlin/adr/blocks/inbox
```

Five `.kt` under `block/<X>/src/main/kotlin/adr/blocks/<X>/` (`Fold`, `Project`, `Register`, `Slice`,
`Tools`), one `Contract.kt` under `spine/src/main/kotlin/adr/blocks/<X>/`, and the two
`build.gradle.kts` of the module pair ADR-001 §5 ratifies — `block/<X>/build.gradle.kts` and
`block/<X>/adapter/build.gradle.kts`. The adapter's build script is unconditional even for a block
with no live IO, because Gradle refuses to configure a project whose directory does not exist; it is
the second member of the pair, not a ninth file, and git cannot track an empty directory.

**Root cost: 18 edit sites across 6 files, 13 of them declared sites.** Recount it with:

```
cd examples/kotlin && grep -nE 'Inbox|inbox|NOTE_' \
  app/src/main/kotlin/adr/app/Contract.kt \
  app/src/main/kotlin/adr/app/Assemble.kt \
  app/src/main/kotlin/adr/app/Wire.kt \
  settings.gradle.kts build.gradle.kts build-logic/src/main/kotlin/AdrDag.kt
```

| File | Edit sites | Declared | The lines |
|---|---|---|---|
| `app/Contract.kt` | 4 | 2 — the slice field on `State`, the view field on `AppView` | 26, 27, 54, 65 |
| `app/Assemble.kt` | 6 | 4 — the block instance, the fold-arm branch, the view row, the context lines | 30, 38, 77, 118–119, 148, 166 |
| `app/Wire.kt` | 4 | 3 — the `register()` line in each of the three tiers | 58, 340, 356, 363 |
| `settings.gradle.kts` | 1 | 1 — one string in the block list, which includes *both* modules of the pair | 37 |
| `build.gradle.kts` | 2 | 2 — the gate's test-classpath entry, and the module source root | 51, 122 |
| `build-logic/…/AdrDag.kt` | 1 | 1 — `ADR_BLOCKS` | 27 |

**The difference between 18 and 13 is five `import` lines, and they are these five:**
`app/Contract.kt:26` and `:27` (`InboxSlice`, `InboxView`), `app/Assemble.kt:30` and `:38`
(`InboxBlock`, `InboxResult`), and `app/Wire.kt:58` (`InboxBlock`).

**What the command prints that the table does not count, named so the two recounts land in the same
place.** Prose: `app/Contract.kt:43` and `app/Wire.kt:138`, `:458` are comment lines. And **six lines
of the barge-in consumer bridge are excluded** — `app/Wire.kt`'s `consumerActions` (`:470`, `:481`,
`:487`, `:492`) plus the two imports it needs (`:59` `NOTE_DROP`, `:60` `NOTE_FAULT`). That mapping
exists because `inbox` is the block the barge-in consumer happens to report into; it is role-specific
wiring, not generic per-block cost, and a new block gets none of it. **Put them back and `app/Wire.kt`
reads 10 edit sites and the total is 24 / 13** — that is the honest other number, and both recounts
are now reproducible from one command. `app/Demo.kt` is excluded for the same reason twice over: it is
the runnable demo rather than wiring, and one of its two hits is an unrelated `SourceName("inbox")`.

Add a sink branch in `app/Wire.kt` if the block emits effects and a port binding if it owns an
adapter. Kotlin needs **no union edits at all** — the sealed hierarchies close themselves, which is
the whole TypeScript/Kotlin delta on this row.

**Six pinned gate counts move, and they are the receipt** for a new block carrying two verbs. Four in
this port's gate: the blocks-and-app path roster (49), the partition size it closes (`38 + 49 = 87`),
the per-block file roster map — all three in `adr.gate.GateTest` — and `GateTrees.MODULE_ROOTS` in
`adr/gate/Tree.kt`. Two more are the verb tripwires row 1 already names: `TotalityTest.kt`'s twelve
verbs and `spine/GateTest.kt`'s fourteen cases. The `:spine` roster of 38 does **not** move: the new
`Contract.kt` compiles in `:spine` but normalises to `blocks/<X>/Contract.kt`, so the blocks roster is
where it lands. One pin moves in the *other* port's tree and is named here so nobody looks for it
twice: the citation census's per-root file and citation counts in
`examples/typescript/test/laws/citations.test.ts`, which count every file in both ports.

Removing a block is the same list, subtracted, plus `rm -rf block/<X>/` (which takes both modules of
the pair with it) and its `Contract.kt` under `spine/src/main/kotlin/adr/blocks/<X>/`.

**A new `State` variant is 1 append + 3 compiler-named arms, all inside one block folder** — and this
row genuinely is one folder *and* one module, because a slice is not transport.

G11's literal "one line" is unattainable *with* compile-time exhaustiveness. What the design does buy
is the honest headline ADR-001 §1.3 Q1 states: **a handful of appends, every one of them named by the
compiler or by a check, none of them a rewrite of shared logic.** No builder should pretend
otherwise.

### Prove the edit list yourself (the 15.4 G12 self-check, for real)

Add a fifth variant to `TicketStatus` in `block/escalation/src/main/kotlin/adr/blocks/escalation/Slice.kt`:

```kotlin
data class Archived(override val ticket: TicketId, val at: Timestamp) : TicketStatus
```

then run `./gradlew compileKotlin`. The build breaks at **exactly three sites, all inside
`blocks/escalation/`** — `Project.kt`'s row match, `Project.kt`'s `contextLines` match, and
`Fold.kt`'s `transition`. (The compiler reports them in two rounds: both projections first, then the
fold arm once the projections type-check.) **Zero sites outside the block**, which the gate also
asserts mechanically: no sibling and no spine file names `TicketStatus` at all.

You do not have to take that on trust, and you do not have to run it by hand either — `./gradlew
check` runs it for you. See `gateExhaustiveBlockTest` below.

---

## The `.api` freeze (ADR-001 §4)

`adr.kotlin.library` applies the binary-compatibility-validator, so each of the fourteen modules
commits its public ABI at `<module>/api/<name>.api`, and `apiCheck` — a dependency of `check` — fails
the build when the live surface and the committed dump disagree. One added public declaration
anywhere is a red build until `./gradlew apiDump` is run and the new dump is read and committed.

It is deliberately **not** one of the seventeen checks below. Those are per-rule denials carrying a
fixture pair each; this is a whole-module ABI comparison with no rule to write. What keeps it honest
is `adr.root`, which asserts four things about every one of the fourteen modules: the module has an
`apiCheck`, `check` depends on it, nothing has switched it off (`enabled = false` and `onlyIf { false }`
are the same hole and are read through one clause), and it still has actions to run. Those assertions
exist because the validator is applied under an ancestor guard — `:block:<x>:adapter` nests inside
`:block:<x>`, and applying the validator twice inside one subtree fails configuration outright — and
because a one-line silencing in any module's own build script was measured green before they landed.

The frozen surfaces measure **8 · 8 · 5 · 8 · 8 · 8** declarations for triage · console · inbox ·
escalation · artifact · analysis, after the 27 block declarations nothing outside a block names were
narrowed to `internal`. ADR-001 §4 predicted 6 · 5 · 5 · 8 · 9 · 8 and now records, from this
measurement, why three of the six differ.

---

## The architecture gate (17 denying checks)

15.1 stakes the architecture's answer to its own central problem on **machine enforcement**, and 15.4
closes with "the payoff the whole reference promises is contingent on these checks being present and
blocking." The previously shipped ports had **none**: `Date.now()` inside a tool and an `fs` import in
the domain both passed a clean build.

Seventeen checks now deny, across three mechanisms, all under `./gradlew check`. There is no warning
tier, no baseline file, and no `ignoreFailures` on any task that defends the live tree.

| id | Invariant | Enforced by |
|---|---|---|
| C1 | G4/G10 — dependencies point inward (the §1.3 import table, verbatim) | Konsist |
| C2 | G11 — no cross-block symbol import (the `adr.contract` compensation) | Konsist |
| C3 | G9 — no clock, randomness or identity outside the boundary | detekt `ForbiddenMethodCall` |
| C4 | G1 — no `Actor`/`Authority`/`Signature` on a `ToolResult` variant, in a tool or on `Ctx`… | Konsist |
| C4 | …and the stamp is *minted* only at the boundary | detekt (`Signature.<init>`) |
| C5 | G9 — only the boundary, the perform port and replay may name an effect key | Konsist |
| C6 | §12.4 — a block may not reference the session-global `RunStatus`… | Konsist |
| C6 | …nor construct `Degraded`/`Error` | detekt (`RunStatus.Degraded.<init>`) |
| C7 | G1 — a block's `ToolResult` is constructed only in its `Tools.kt`… | Konsist (variants *derived* from the contracts) |
| C7 | …and the spine's `Unhandled`/`Refused` only at the boundary | detekt (`ToolResult.Refused.<init>`) |
| C8 | G2 — the pure ring performs no I/O and declares no `suspend` | Konsist |
| C9 | G12 — no `else ->` arm in a `when` over a sealed or enum subject | detekt `ElseCaseInsteadOfExhaustiveWhen` |
| C10 | G7 — no top-level mutable state outside the boundary | Konsist |
| C11 | 7.9/G13 — every declaration under `spine/ports` is an interface | Konsist |
| C12 | §4.6 — ephemeral view-state is visible only to its own projection | Konsist |
| C13 | registry totality plus handler totality, and §6.8's one-name-per-verb law | JUnit + reflection |
| C14 | G3 — the agent loop is a declaration: no branching, no looping | detekt `CyclomaticComplexMethod` |
| C15 | G14 — the spine tier is self-contained: `spine/**` names no block and no root | Konsist |
| C16 | G6 — only the admission rule opens the fold's attributed output, so an effect reaches perform through `admit` | Konsist |
| C17 | G6 — an Irreversible-class effect is constructed only at its own pinned site, never in a Reversible verb's arm | Konsist |

**C7 is a CONSTRUCTION rule, and a COPY is not construction — this port does not close that.**
A `data class` variant ships a synthesized `copy()`, so `cmd.copy(…)` on a received command mints a
transport the derivation above cannot see, and the same is true of `result.copy(…)` in a fold arm.
The TypeScript port closed its own spelling of this — an object spread — by branding what the fold
and a committed record accept with a type no spread can carry. **There is no Kotlin twin**, and the
three routes were measured on this tree rather than argued about:

| route | measured |
|---|---|
| delete `data` from the transport leaves | contradicts ADR-001 §1's ratified table (`copy` is *correct* for a description of what happened) and takes the value equality `Replay.RecordMark` compares records with |
| `internal constructor` (the only lever that hides `copy()` while keeping `data`) | two compile errors in `block/triage/…/Tools.kt` — at the upcaster and at `run` — because ADR-001 §3's DAG declares a block's transport in `:spine` while its verb table lives in `:block:<x>`; it removes the one production site C7 licenses |
| a `:spine`-internal wrapper at the fold seam | `internal` in `:spine` is invisible to this root test project, where the replay suite hand-builds committed records |

What is NOT at risk is the stamp: `Signature` is not a data class, so a copied Command carries its
ORIGINAL signature and the boundary's authority check still keys on that. What a copy buys is a
payload edited after signing — which replay detects, because the re-fold of the committed bytes
disagrees with what was performed. Closing it structurally is ADR-001 §6's still-open decision;
`GateTest`'s `C7(b)` holds the residue mechanically, so it can be neither forgotten nor quietly
closed, and `OPEN-GAPS.md`'s signed-transport-copy row carries the record.

**Why C15 is not redundant with C1.** C1 is a per-folder **allow**-list; C15 is a tier-level
**denial** that no per-folder rule can accidentally relax, and it survives a future spine folder
arriving with a permissive bucket. In Kotlin it also catches something C1 structurally *cannot*: the
sealed-hierarchy rule forces every transport declaration into `adr.contract`, and C1 **permits**
`adr.contract` from spine folders — so without C15 a spine file could name `adr.contract.TriageResult`
through an import C1 waves straight through. Measured, by injecting exactly that import into
`spine/pure/Ids.kt`:

```
GateTest > C15 - the spine tier is self-contained and vendorable() FAILED
  expected: <[]> but was: <[spine/pure/Ids.kt — [C15] a block's transport symbol, reachable only
  because Kotlin forces one package for a sealed hierarchy: adr.contract.TriageResult]>
```

C1 stayed green on that injection. Adding `import adr.blocks.triage.Triage` trips **both**.

**Why three mechanisms and not one.** Konsist parses the tree and hands back *declarations* — imports
with their fully-qualified names, constructor parameters with their **types**, properties that know
whether they are `var`. That is the right tool for structure and import direction. It does not model
expressions, and three of the checks are about expressions whose meaning depends on **types**:
whether a `when` subject is really sealed, and whether `Instant.now()` is really `java.time.Instant`
rather than a local helper of the same name. Those run under detekt **with type resolution** — both
`classpath` and `jdkHome` are set on every analysis task. Without `jdkHome`, `System.currentTimeMillis()`
resolves to nothing and C3 passes silently on the very call it exists to deny; that is not
hypothetical, it is what this build did until the block-test caught it.

### Every check ships a block-test and an allow-test

* **BLOCK-test** — a checked-in violating fixture the check must reject. Without it, a rule that
  silently stopped working would look exactly like a rule that is being obeyed. That is what §15.2
  measured.
* **ALLOW-test** — the same shape written the way the architecture asks, which the check must accept
  untouched. Without it, a rule drifts into a nuisance and the first thing an author does is turn it
  off (15.2). The allow-test fixtures are deliberately *idiomatic*: C3's compliant fixture reads the
  clock, at the boundary, where that is exactly right.

| | fixtures | proof |
|---|---|---|
| Konsist checks | `src/test/fixtures/konsist/{violating,compliant}/<check>/` | `GateTest.verify` — three assertions per check, on every build |
| detekt checks | `src/test/fixtures/detekt/{violating,compliant}/` | `gateDetektBlockTest` / `gateDetektAllowTest` |
| G12 exhaustiveness | `src/test/fixtures/exhaustive/{violating,compliant}/` | `gateExhaustiveBlockTest` — runs the real Kotlin compiler |

`gateExhaustiveBlockTest` is the strongest of the three and worth calling out: it compiles a faithful
copy of `blocks/escalation`'s three `TicketStatus` consumers with a **fifth variant added**, and fails
unless the compiler exits non-zero naming **exactly three sites**. The allow-test compiles the
four-variant copy and fails unless it exits **zero** — because a negative-compilation fixture that
never compiles proves nothing. §11.2's `K = 3` is therefore earned by the compiler on every build
rather than asserted in prose.

**Discipline (15.2):** a wrong rule gets fixed and re-tested — never disabled, never routed around,
never given a baseline.

---

---

## What you inherit, and what you vendor (G14)

The honest statement, because "zero of their source lives in your repository" was only ever true of
one of the two things you get:

* **You inherit the loop.** A generic agent-loop runtime supplies the loop, the step lifecycle and
  the provider abstraction. That is a real dependency — `ai.torad:torad-aisdk`, resolved from Maven
  Central, zero source in this repository — and `spine/agent/Loop.kt` is the only file that names it.
* **You vendor the spine.** The signed command bus, the fold driver, state derivation, replay, the
  barge-in mailbox, the tier relay and the enforcement gate are a **fixed, small, self-contained
  tier: 38 files, roster pinned by a test**, the same components as the TypeScript port's 37 — spelled per language, not file-for-file identical. **No spine package is published
  on any registry**, and this pass does not publish one — that is the repository owner's decision.
  What is true today is that you copy the tier once and **never author it per feature**: every
  feature you add lands in `blocks/<X>/` plus the root, and each component is swappable behind its
  own contract.

**Gate check C15 is what turns that from a claim into a property of the build**: `spine/**` may not
name `blocks/**`, `app/**`, or any block's transport symbol — so the tier can be lifted out whole.

The honest headline is therefore: **two kinds of tool + thin wiring + a loop you depend on + a spine
you vendor once and never author per feature.**

---

## Day one: a working one-verb app

**Read this first: it is a step list for YOUR new repository, not for this one.** The spine is a
vendored template and no package is published on any registry (docs/DECISIONS.md:155), so day one is
a copy, not a dependency. This port's own roster pins and verb ledgers are not yours to maintain.

Every step below was executed end to end before it was written, against this tree, and the four
measurements a reader could not have guessed are called out where they bite. The claims are held by
`examples/typescript/test/laws/quickstart.test.ts`, which resolves every path, command, count and
walked fact on this list against the live tree on every `npm test` run of the sibling port. It does
not re-run Gradle: this port's own gate is blind to this README, and its `GateTest` says so in
writing.

<!-- quickstart:begin -->
**Scope, first, because it is the one thing a step list can be wrong about silently:** everything
below is for YOUR new repository. None of this port's roster pins or verb ledgers travel with the
copy; they exist because this tree is the reference.

**1 — copy the spine module.** `cp -r <this repo>/examples/kotlin/spine <yours>/spine`. It is a
Gradle module, not a folder: it arrives with `spine/build.gradle.kts`, which applies the `adr.spine`
convention plugin and declares three dependencies.

*What you get:* the folder holds 46 entries — 44 `.kt` plus that build script, and
`spine/api/spine.api`, the frozen public surface `apiCheck` holds the module to. It carries its own
version marker at `spine/src/main/kotlin/adr/spine/pure/Version.kt`, which is what `CHANGELOG.md`
entries key on; keep it.

*THE MEASUREMENT THAT CHANGES THE STEP:* 6 of them are not spine at all. They are this reference
application's blocks' transport, at
`spine/src/main/kotlin/adr/blocks/{triage,escalation,console,artifact,analysis,inbox}/Contract.kt`.
Delete them and 38 `.kt` remain, which is exactly the roster this port's `GateTest` pins.

**2 — the constraint you must not "fix", and the one that breaks step 4.** Those six files are in
`:spine` because Kotlin requires every variant of a sealed hierarchy in one package AND one module.
So YOUR block's transport goes there too: `spine/src/main/kotlin/adr/blocks/<x>/Contract.kt`, package
`adr.contract`, inside the vendored module. Authoring it in your block module instead fails the
compiler, in those words:
`Extending sealed classes or interfaces from a different module is prohibited`.

**The "vendor once and never author per feature" headline three sections up is therefore not
literally true in Kotlin** — you never author the spine's own components again, but you do add one
file per block inside the vendored module's tree. That is a locked consequence of G12 plus the
language, not a defect to route around.

**3 — declare the modules.** In `settings.gradle.kts`: `:spine`, then a PAIR per block —
`:block:<x>` pure and `:block:<x>:adapter` impure — and `:app`. The pair is unconditional even for a
block with no I/O, and the reason is measured rather than stylistic: Gradle refuses to configure a
project `without an existing directory`, so an I/O-less block still ships a real committed adapter
directory holding a one-line build script. See `block/console/adapter/build.gradle.kts` for what that
one line is. The convention plugins that carry the walls live in `build-logic/` as an included build.
**Copy `build-logic/` in step 1, alongside `spine/`** — it is not optional the way an earlier
version of this list said. `spine/build.gradle.kts` opens with `plugins { id("adr.spine") }`, so
without the included build the very first file you copy fails to configure and nothing builds at
all. What you CAN defer is the block roles: a block that does not yet apply `adr.block` /
`adr.block.adapter` / `adr.root` simply has none of its module-edge laws enforced, and gains them
the day it applies them.

**4 — register one verb, and put its test in the right project.** Measured on this tree by adding a
real verb and letting the toolchain name the sites: **4 appends, 3 files, 2 Gradle modules. Zero
edits at `:app`.** Two appends land in `spine/src/main/kotlin/adr/blocks/<x>/Contract.kt` (the
`ToolResult` case and the `Command` case), one in your block's `Tools.kt`, one in its `Fold.kt` —
both under `block/<x>/src/main/kotlin/adr/blocks/<x>/`. The compiler names exactly one of them: with
both transport cases written and nothing else,
`block/console/src/main/kotlin/adr/blocks/console/Fold.kt` fails with `'when' expression must be
exhaustive. Add the 'is SetDensity' branch or an 'else' branch.` The registry entry is named a layer
later, by gate check C13, which is why that check exists.

*Tests do NOT live in the module.* Every test in this port sits in the ROOT project's `src/test/`,
because a block module is denied the test libraries on its own classpath. A test file placed under
`block/<x>/src/test/` compiles nowhere and silently never runs.

**5 — run it.** `./gradlew --console=plain check` is this port's gate, and `./gradlew run` is the
demo.

*THE ASYMMETRY WITH THE TYPESCRIPT PORT, stated rather than papered over:* `./gradlew run` has no
replay beat. Its six-step walkthrough ends at the barge-in ledger, and no line of it re-folds the
bus. The replay proof in this port is a test, so the fourth beat of day one is
`./gradlew test --tests 'adr.spine.ReplayTest'` — read `src/test/kotlin/adr/spine/ReplayTest.kt`,
whose first case is `G9 - the live run and its re-fold agree on state and on every effect`.
<!-- quickstart:end -->

---

## Context engineering is out of scope; the context SEAM is not (§6.11)

* **In scope, specified and enforced.** `projectContext(state, staged) -> Context` is a pure
  projection of committed State plus this step's *ordered* staged input; it carries a stated growth
  bound (O(1) in timeline length); `render(context)` is the exact text the model saw; and that text
  plus the active prompt version ride the committed record as `ContextFixture`, so a re-fold
  re-derives the digest and a change that silently alters what the model saw fails the golden trace
  **without re-running the model**.
* **Out of scope, and product-owned** — beside authorization (14.3), persistence & retention (14.6),
  configuration/secrets and out-of-band reconciliation (14.4): **what** you choose to project, how you
  rank, retrieve, compact or summarise it, and how you author the prompt.

The architecture's whole obligation is the invariant, not the strategy: **whatever you project is a
pure function of committed State plus staged input, and if you compact, the summary is a captured
fixture** — because "why did the agent decide this?" is unanswerable without the text the model
actually read.

---

## The two advanced rungs, and how they are proven

Both are **optional**. `Env.mailbox` and `Env.relayRead` default to null; an app that takes neither
rung compiles both blocks away by not registering them, and pays exactly one thing: `staged` is an
ordered `List<StagedInput>` rather than a single nullable value. That is a **correction**, not a rung
tax — 5.4 already specifies plural off-bus inputs "in their staging order, keyed to the consuming
step", and the shipped ports were narrower than the book.

**The barge-in mailbox (12)** — `spine/concurrency/Consumer.kt`, proven in `test/spine/MailboxTest`.
The book's 12.3 drain loop puts `outcome = await(inFlight)` at loop-body indentation while
`mailbox.take()` blocks at the top, so control never reaches `take()` during a turn and all three
guards are dead. The fix is a `select` over `{ a message arrived, the turn settled }`. The proving
test measures it on a **virtual clock** against a control run of the identical turn:

```
control (no interrupt):   the turn settles at virtual t = 10000
measured (interrupted):   the interrupt's turn STARTS at virtual t = 150
```

Also proven: cancellation is at a step boundary (the preempted turn's committed step and its effect
survive; there is no rollback); the cancel deadline is real and a turn that ignores it is **revoked**
so its late `submit` folds nothing; `Perishable` conflates with a **counted, folded, signed** drop
that reaches the model's own context digest while `DurableQueue` never conflates; ack happens only
after the commit, so a redelivered lease is deduped rather than lost; a thrown turn degrades to
`TurnOutcome.Threw` and the consumer lives; and a `Drain` **defers** rather than preempting.

**The tiered relay (11)** — `spine/ports/Relay.kt` + `blocks/analysis/`, proven in
`test/spine/RelayTest`. A deep tier publishes conclusions to an append-only relay; the fast tier
reaches them only through a recall that returns **text**. Recall is bounded by the *reader* (a port
cannot promise to be fast) and degrades to a **typed** `LastKnown(text, publishedAt)` or `Empty` —
different types from `Fresh`, so stale is never presented as fresh and "nothing published yet" is
never presented as stale. The replay test publishes a *different* conclusion and then re-folds: the
replay resolves the original snapshot **and the original branch**, and swapping only the variant
(`Fresh` → `LastKnown`, same text, same timestamp) makes the golden trace fail — so the branch really
is captured. Recalled content is untrusted: the injection case from 10.2 is staged into the prompt
and the irreversible act is still `Refused`.

---

## The adoption ladder (17.4), rung by rung — what this port exercises

17.4 states the ladder as architecture and deliberately makes no claim about any codebase: which
rungs a port has actually climbed is the port's own claim to make, in the one place a build can
settle it. This is that claim. Read it with the section immediately below, which is its other half —
this table is what is **exercised**, that one is what is still **specified but unproven**, and
together they are the whole answer. Every row names the file that goes red when the claim stops
being true.

| Rung | In this port | Goes red in |
|---|---|---|
| **Core** | **Exercised.** A live run under a moving clock re-derives from its own committed bytes — the same state and every effect, keys and timestamps included, plus the context digest the model was shown. `PerformMode.REPLAY` collects the descriptors and fires nothing, and the harness is proven non-vacuous: a deliberately divergent re-fold must be *detected*. | `adr/spine/ReplayTest.kt` · `adr/spine/ContextTest.kt` |
| **+ Safety** | **Exercised**, on two layers. The gate refuses a self-confirm and a confirm with no pending request *before* the fold, so the refusal commits as a `ToolResult` and re-folds without re-running the authorization check; an unattended agent and a human host both promote through the same mechanism, differing only in `Authority`; the product's own `ConfirmPolicy` can deny even an otherwise-different authority; and a forged actor in the tool input never reaches the irreversible effect. Since the effect classes landed (C16/C17), refusal is also a property of the timeline: an `Irreversible` effect no `Irreversible` verb earned is refused at its own key and substituted — identically live, on `REPLAY`, on `RECOVERY`, and from a snapshot resume. | `adr/spine/GateTest.kt` · `adr/spine/AdmissionTest.kt` |
| **+ Concurrency** | **Exercised.** Preemption asserted on a virtual clock against a *measured* control run — the same turn timed first with no interrupt, ten seconds of virtual time, and the interrupt then required to be handled long before it — plus both input policies, dedupe with ack-after-commit, a dedupe scope that survives a restart, the drain defer and its seal, the bounded-cancel timeout that revokes an abandoned turn, and a turn that throws without killing the consumer. | `adr/spine/MailboxTest.kt` |
| **+ Cognition** | **Exercised.** Two tiers holding no handle to one another, the typed degrade (`Fresh` / `LastKnown` / `Empty`, with `Empty` a different fact from stale, and a slow relay with no prior read staging `Empty` rather than stalling), a replay check that swaps *only* the variant on the committed record and requires the golden trace to fail, and recalled text that cannot buy an irreversible act even with a request already pending. | `adr/spine/RelayTest.kt` |
| **+ Inputs** | **Partly**, and the gap is the modality, not the seam. Off-bus input is staged in order, captured on the record and fed back from it on re-fold rather than re-queried. But the three adapter modules that ship source — `block/analysis/adapter`, `block/artifact/adapter`, `block/escalation/adapter`, three of the six `settings.gradle.kts` declares — resolve in-process text; no image, audio or document modality is exercised anywhere in this port. | the three `adapter/` modules |
| **+ Enforcement** | **Exercised**, on two layers rather than one. Seventeen denying checks across three mechanisms, each with a checked-in block-test and allow-test, all under `./gradlew check` — the same entry point `.github/workflows/ci.yml` runs on every push and pull request, with no warning tier, no baseline file and no `ignoreFailures` on any task that defends the live tree. Under the check layer sits the module DAG: fourteen Gradle modules declared in `settings.gradle.kts`, `adapter` its own module rather than a file-naming convention, and the ban on an I/O library entering a pure block enforced by the block's convention plugin at *configuration* time — before a single source file is compiled. | `adr/gate/GateTest.kt` · `settings.gradle.kts` |

---

## Deliberate scope limits — specified but unproven

16.4 licenses stopping early, and that stays true. These rungs are built so the *reference* exercises
what it specifies, not so every adopter takes them. What is still **specified but unproven** is named
here rather than left to imply a parity that does not exist:

| | why |
|---|---|
| **Cross-session global ordering** | 5.2 puts causal consistency across independent streams out of scope. The two-tier test proves *separate* buses; it proves nothing about ordering between them. |
| **Replay tooling beyond a re-fold** | an interactive scrubber UI, a fork-from-step and an interactive diff are drawn in 14.1; none is built. What *is* built is the re-fold itself, the prefix re-fold at step `k` a scrubber would sit on (`Replay.refoldFrom`), the effect-sequence comparison and the per-step context-digest check — the machinery such a UI would call, with no UI over it. |
| **A distributed or sharded bus, bespoke persistence/retention, multi-tenant isolation** | 8.5 names these as swaps. The contracts exist; no adapter does. |
| **Where a snapshot is stored, compaction, retention (14.1/16.2)** | product policy. The snapshot *mechanism* left this row: `spine/replay` ships the memoized fold prefix, tagged with the reducer version, the timeline offset it covers, and the mark of the record it stops at. `ReplayTest` proves a snapshot-seeded resume equals what the live run produced, and that a snapshot resumed under a reducer version the caller is not folding with — or over a tail whose boundary the log does not confirm — is refused rather than folded. Two logs whose boundary records are byte-identical stay indistinguishable to that seam; the file says so. What a product still owns is where a snapshot *lives*, and how far below one it may compact. |
| **The per-tenant budget (G6)** | `spine/ports/authorization` is its named home and its verdict already rides the committed record; no port ships a tenant budget, because no port has tenants. |
| **CI** | `.github/workflows/ci.yml` runs `./gradlew check` (and the TS suite) on every push and pull request — the same entry point a developer runs locally, no CI-only rule set. |
| **Dispatcher confinement of `submit`** | the consumer creates the turn's scope, so the reference cannot violate it — but an adopter who runs a turn on another dispatcher could interleave two folds despite the design. Enforced structurally, **not gate-checkable**. |
| **The abandoned turn can leak** | after a cancel-deadline timeout the turn's coroutine may never unwind. The design bounds the *consumer*, not the turn; removing the leak needs an unbounded join, which 12.3 itself calls a hang. The leak is named, degraded, counted and folded — never hidden. |

One scope limit that CLOSED, and the honest bound on it:

* **Schema evolution (14.7) ships, one rung of it.** `StepRecord` carries a required
  `schemaVersion` (current 2, genesis 1 — nothing was ever persisted, so there is no v0), and one
  worked v1 -> v2 upcaster lifts the block payload that gained an optional field. The refusal is the
  compiler's, in both halves: a `StepRecordV1` is not a `StepRecord`, and `TriageV1Result` does not
  extend `ToolResult`, so a v1 payload cannot enter `results` whatever the envelope says. An
  un-upcast log cannot reach `refold` at all. What is *not* here is a chain of upcasters, a versioned
  wire encoding (14.1 leaves that product-owned), a golden trace pinned per reducer version, or any
  dispatch on the version at load time: the envelope is read by the COMPILER and never at run time,
  because this reference deliberately ships no loader to read it in.

Two more limits that are not gaps at all:

* **The pure tool body runs twice per agent action.** Once in `spine/agent/loop`, so the model gets a
  payload to reason over; once at the boundary, to produce the recorded truth. A pure function
  evaluated twice is free, and it buys a single production site for `ToolResult`. Both call sites say
  so in a comment.
* **`Boundary` is generic in the app's `State` type.** That is the structural price of "the spine never
  names a block". One type parameter appears in `Boundary`, `Verb`, `Ctx` and the injected
  `fold` / `projectContext` signatures.

## What replay does and does not buy

Replay is determinism over a **recorded timeline**: forensics, audit, and
production-traces-as-fixtures. It is **not** behavioural reproducibility — re-running the model is not
deterministic, and inputs conflated away were never recorded. What *is* guaranteed is that the run
that **was** recorded re-derives exactly, bit for bit, from its own committed bytes: the same state,
the same effect sequence, the same keys, the same timestamps, and the same context digest the model
was shown.
