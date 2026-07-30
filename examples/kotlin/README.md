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
./gradlew run       # a runnable, fully offline end-to-end demo — no keys, no network
```

The one network dependency is Maven Central (`ai.torad:torad-aisdk:0.3.0-alpha01`), resolved at
build time. Nothing in the demo or the tests reaches the network at run time.

---

## The tree teaches the architecture

```
src/main/kotlin/adr/
├── spine/                     THE TRUNK — block-agnostic, written once, never forked (37 files, roster pinned by a GateTest)
│   ├── pure/                  ZERO I/O. The transport vocabulary and the shapes the app assembles.
│   ├── ports/                 INTERFACES ONLY. A file here with a body is a gate failure (C11).
│   ├── boundary/              THE ONE IMPURE SEAM: action · gate · boundary · in-memory
│   ├── agent/                 the ONLY file in spine/ that imports the agent-loop runtime
│   ├── surface/               ONE ViewModel stream + ONE onAction(Action) sink
│   ├── concurrency/           the BARGE-IN loop (12) and the relay's read side: consumer · in-memory
│   └── replay/                Replay: refold · stateAtStep · collectPerform — ReplayFaithfulness: assertFaithful
├── blocks/                    THE LEAVES — one folder per feature; `register` is the public symbol
│   ├── triage/                domain block          contract·slice·tools·fold·project·register
│   ├── escalation/            domain block + gated verb          … + port·adapter
│   ├── console/               PRESENTATION block — folds AND signs … + view-state
│   ├── artifact/              the work product, as a folded slice … + port·adapter
│   ├── analysis/              the TIERING rung (11): recall + publish … + port·adapter
│   └── inbox/                 the BARGE-IN ledger (12): conflation and fault counters
└── app/                       THE ROOT — the only place that may name every block
    ├── Contract.kt            State (the product of slices) + the app's view
    ├── Assemble.kt            the THREE total dispatchers: fold · project · projectContext
    ├── Wire.kt                ports→adapters, the effect sink, the Boundary, the loop, the consumer
    └── Demo.kt                a runnable offline script
```

Read the folder names before you read a file. The rule they encode is the book's, in its canonical
wording: **an import may point inward toward the core, or it is the composition root; it may never
point outward from the core, sideways between adapters, or from a passive node — a surface or a
tool — into anything but domain types.** On this tree that reads: leaves and trunk point inward,
only the root spans.
`spine/pure/` versus `spine/boundary/` *is* the purity boundary, named as a folder. Inside a block the
same line is drawn again by file name — `contract · slice · tools · fold · project` are pure,
`adapter` is the rim, and `view-state` is the ephemeral-only exception 4.6 carves out.

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

**A new verb — domain OR presentation — is 4 appends, 3 files, 1 folder. Uniform.**

| # | Site | File | Compiler-forced? |
|---|---|---|---|
| 1 | the `ToolResult` case | `blocks/<X>/Contract.kt` | it *is* the thing you are adding |
| 2 | the `Command` case | `blocks/<X>/Contract.kt` | it *is* the thing you are adding |
| 3 | the `Verb` row (name, description, decode, run, sign, reversibility) | `blocks/<X>/Tools.kt` | yes — gate check C13 |
| 4 | the fold-arm branch | `blocks/<X>/Fold.kt` | yes — exhaustive match over the block's sealed sub-union |

Adding `setPriority` (domain) and adding `setPanel` (presentation) touch **the same four sites**.
There is no cheaper UI path because there is no UI path: the "a UI tool folds, does not sign"
carve-out is gone, and with it the two tool mechanics that made composition and blast radius *worse*.

**Re-measured after the tiering and barge-in rungs landed, and the number did not move.** Adding a
throwaway `resolveTicket` verb with only sites 1 and 2 written, the compiler names site 4 and nothing
else:

```
e: blocks/triage/Fold.kt:28:26 'when' expression must be exhaustive.
   Add the 'is ResolveTicket' branch or an 'else' branch.
```

With all four appends the tree compiles, and **zero production sites outside `blocks/triage/` are
touched** — the root's dispatch is `is TriageResult ->`, a real sealed type check, so a new variant
routes automatically. The only other things that fire are the two deliberate confirm-you-meant-it
count tripwires in the test tree (`TotalityTest`'s twelve verbs, `spine/GateTest`'s fourteen cases);
both assert on a *number*, not an enumerated list.

**A new `State` variant is 1 append + 3 compiler-named arms, all inside one block folder.**

**A whole new block** is one folder plus **6 appends across the 3 root files** — measured on this
code, not asserted:

| # | Site | File |
|---|---|---|
| 1 | the slice field on `State` (it defaults to the block's own `initial`) | `app/Contract.kt` |
| 2 | the view field on `AppView` | `app/Contract.kt` |
| 3 | the fold-arm branch in `foldApp` | `app/Assemble.kt` |
| 4 | the view row in `projectApp` | `app/Assemble.kt` |
| 5 | the context lines in `projectContextApp` | `app/Assemble.kt` |
| 6 | the `register()` line | `app/Wire.kt` |

Plus one sink branch in `app/Wire.kt` if the block emits effects, and one port binding if it has an
adapter — so 6, 7 or 8 depending on what the block actually needs. Kotlin needs **no union edits at
all**: the sealed hierarchies close themselves, which is the whole TypeScript/Kotlin delta. Every one
is an append, and the compiler names each one (a missing dispatch arm, a missing field or a missing
sink branch fails to compile). Removing a block is the same list, subtracted, plus `rm -rf blocks/<X>/`.

G11's literal "one line" is unattainable *with* compile-time exhaustiveness. The design keeps every
edit inside `app/`, makes every edit an append, and makes the compiler name each one. That is the
strongest available form of G11 under G12, and no builder should pretend otherwise.

### Prove the edit list yourself (the 15.4 G12 self-check, for real)

Add a fifth variant to `TicketStatus` in `blocks/escalation/Slice.kt`:

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

## The architecture gate (15 denying checks)

15.1 stakes the architecture's answer to its own central problem on **machine enforcement**, and 15.4
closes with "the payoff the whole reference promises is contingent on these checks being present and
blocking." The previously shipped ports had **none**: `Date.now()` inside a tool and an `fs` import in
the domain both passed a clean build.

Fifteen checks now deny, across three mechanisms, all under `./gradlew check`. There is no warning
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
  tier: 37 files, roster pinned by a test**, the same components as the TypeScript port's 36 — spelled per language, not file-for-file identical. **No spine package is published
  on any registry**, and this pass does not publish one — that is the repository owner's decision.
  What is true today is that you copy the tier once and **never author it per feature**: every
  feature you add lands in `blocks/<X>/` plus the root, and each component is swappable behind its
  own contract.

**Gate check C15 is what turns that from a claim into a property of the build**: `spine/**` may not
name `blocks/**`, `app/**`, or any block's transport symbol — so the tier can be lifted out whole.

The honest headline is therefore: **two kinds of tool + thin wiring + a loop you depend on + a spine
you vendor once and never author per feature.**

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

## Deliberate scope limits — specified but unproven

16.4 licenses stopping early, and that stays true. These rungs are built so the *reference* exercises
what it specifies, not so every adopter takes them. What is still **specified but unproven** is named
here rather than left to imply a parity that does not exist:

| | why |
|---|---|
| **Cross-session global ordering** | 5.2 puts causal consistency across independent streams out of scope. The two-tier test proves *separate* buses; it proves nothing about ordering between them. |
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
