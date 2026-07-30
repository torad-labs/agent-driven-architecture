# Agent-Driven Architecture — TypeScript reference port

Runnable, offline, no API keys. The runtime binding is the Vercel AI SDK v6.

```
npm run typecheck   # tsc --noEmit
npm run lint        # eslint . — the denying gate checks
npm test            # typecheck + lint + vitest   ← the gate runs HERE, not separately
npm run demo        # a scripted model drives the real loop, end to end
```

A check you have to invoke separately is not a gate, so `npm test` runs all three. The gate's own
block-tests and allow-tests are vitest tests, so `npx vitest run` on its own exercises them too.

---

## The tree teaches the architecture

```
src/
├── spine/                  THE TRUNK — block-agnostic, written once, never forked (36 files, roster pinned by a gate test)
│   ├── pure/               ZERO I/O. The transport vocabulary. The purity boundary, named as a folder.
│   ├── ports/              INTERFACES ONLY. A file here with a body is a gate failure (C11).
│   ├── boundary/           THE ONE IMPURE SEAM: action · gate · boundary · in-memory
│   ├── agent/              the ONLY file importing the agent-loop runtime
│   ├── surface/            ONE ViewModel stream + ONE onAction sink — nothing else public
│   ├── concurrency/        the BARGE-IN loop (12) and the relay's read side: consumer · in-memory
│   └── replay/             refold · stateAtStep · collectPerform · contextDivergence
├── blocks/                 THE LEAVES — one folder per feature; only `register` is public
│   ├── triage/             contract · slice · tools · fold · project · register
│   ├── escalation/         … + port · adapter   (the block's private frozen contract, and its client)
│   ├── console/            … + view-state       (PRESENTATION — folds AND signs, identically to a domain block)
│   ├── artifact/           … + port · adapter   (the work product, a folded slice)
│   ├── analysis/           … + port · adapter   (the TIERING rung (11): recall + publish)
│   └── inbox/              the BARGE-IN ledger (12): conflation, duplicate and fault counters
└── app/                    THE ROOT — the only place that may name every block
    ├── contract            the closed sets: State (a product of slices) + the three unions
    ├── assemble            the THREE total dispatchers: fold · project · projectContext
    ├── wire                ports→adapters, the effect sink, the Boundary, the loop, the consumer
    └── demo                a runnable, offline end-to-end script
```

Dependency direction is readable before you open a file. The rule is the book's, in its canonical
wording: **an import may point inward toward the core, or it is the composition root; it may never
point outward from the core, sideways between adapters, or from a passive node — a surface or a
tool — into anything but domain types.** On this tree that reads: leaves and trunk point inward,
only the root spans. Inside a block the same boundary is drawn again by file name — `contract · slice · tools ·
fold · project` are pure, `adapter` is the rim, and `view-state` is the ephemeral-only exception.

Every import rule above is machine-enforced (`npm run lint`, check C1).

---

## How G12 is expressed in a language with no sealed classes

Kotlin writes `sealed interface ToolResult { val tool: ToolName }`. TypeScript expresses the same
guarantee natively, in three parts, all of which are load-bearing:

1. **A shared base interface** declaring the common fields ONCE — `ToolResultBase { outcome, tool }`,
   `CommandBase { outcome, tool, sig, id }`, `EffectBase { kind, at }`, `NoticeBase { kind, at, tool,
   reason }`. Because `at` is declared on `EffectBase`, every effect in the system carries a
   timestamp by construction; nobody had to remember.
2. **A discriminated union**, closed at `app/contract` (the one file that may name every block).
3. **A `never`-guarded exhaustive match at every consumer**, so the compiler proves totality:

   ```ts
   default: {
     const _never: never = status;
     return _never;
   }
   ```

An `===` against a single variant is **not** a closed match. That was the shipped reference's bug
(`t.status.kind === "Open"`), and `test/gate/exhaustiveness.test.ts` now performs 15.4's G12
self-check instead of asserting it.

**Take full advantage of the parent.** `TicketStatus` and `SealStatus` declare `requestedBy:
Authority | null` on the sealed parent. The boundary gate reads "is a request pending, and who
raised it?" off any variant with no match at all — so a fifth variant cannot be added without
answering that question, and it costs the gate zero consumer sites.

### Prove the edit list yourself

Add a fifth variant to `TicketStatus` in `src/blocks/escalation/slice.ts` and run
`npm run typecheck`. Expect **three errors**: the fold arm's status match, the view row match and
the context line match — all three inside `blocks/escalation/`, zero outside it.

---

## Blast radius (§16.1), measured on the code in this folder

**A new verb — domain OR presentation — 4 appends, 3 files, 1 folder. UNIFORM.**

| # | Site | File | Compiler-forced? |
|---|---|---|---|
| 1 | the `ToolResult` case | `blocks/<X>/contract.ts` | it *is* the thing you are adding |
| 2 | the `Command` case | `blocks/<X>/contract.ts` | it *is* the thing you are adding |
| 3 | the `Verb` entry (name, description, schema, pure `run`, `sign`, reversibility) | `blocks/<X>/tools.ts` | yes — gate check C13 |
| 4 | the fold-arm branch | `blocks/<X>/fold.ts` | yes — `never`-guarded match |

Adding `setPriority` (domain) and adding `setPanel` (presentation) touch **the same four sites**.
6.8's "a UI tool folds, does not sign" carve-out is gone, and with it the two tool mechanics that
made G11 and §16.1 worse, not better.

**Re-measured after the tiering and barge-in rungs landed, and the number did not move.** Adding a
throwaway `resolveTicket` verb with only sites 1 and 2 written, the compiler names the fold arm:

```
src/blocks/triage/fold.ts(51,13): error TS2322: Type '"resolveTicket"' is not assignable to type 'never'.
```

**KNOWN HOLE — a fifth site with no guard.** Each block exports an `owns` type predicate
(`isTriageResult`) whose declared return type is `r is TriageResult` but whose body enumerates tool
names by hand. Measured: with all four appends written and `owns` left stale, `tsc --noEmit` exits
**0**, `eslint` exits **0**, and the whole suite passes — then the verb fails at runtime the first
time it is dispatched:

```
TypeError: out.effects is not iterable (cannot read property undefined)
  ❯ fold src/app/assemble.ts:50:13
```

because `foldOk` fell through to `const _never: never = r; return _never;`, which returns
`undefined`. Kotlin does not have this hole — its root dispatch is `is TriageResult ->`, a real
sealed type check. **For TypeScript the honest number is 4 appends + 1 unguarded edit.** Do not write
"4 sites, all compiler-forced" for this port.

Two hand-maintained name lists in the test tree (`test/app/totality.test.ts`, `test/gate/gate.test.ts`)
also fire; both deny, so both are on the compiler/test edit list. A block going from one verb to two
additionally needs its fold's `const _never: never = r.tool` changed to `= r` — that one *is*
compiler-forced.

**A new State variant — 1 append + 3 compiler-named arms, all inside one block folder.**
**A new effect kind — 2 appends**: the case in the owning block's contract, and one branch in the
root's effect sink (compiler-forced).
**A whole new block — 8 appends at the root, across 2 files** (`app/contract`, `app/assemble`,
`app/wire`), every one an append the compiler names. Kotlin needs 5; the delta is purely
TypeScript's need to write the union out. G11's literal "one line" is unattainable *with* compile-time
exhaustiveness, and no builder should pretend otherwise.

---

## What you inherit, and what you vendor (G14)

The honest statement, because "zero of their source lives in your repository" was only ever true of
one of the two things you get:

* **You inherit the loop.** A generic agent-loop runtime supplies the loop, the step lifecycle and
  the provider abstraction. That is a real dependency — resolved from the registry, zero source in
  this repository — and `spine/agent/loop.ts` is the only file that names it.
* **You vendor the spine.** The signed command bus, the fold driver, state derivation, replay, the
  barge-in mailbox, the tier relay and the enforcement gate are a **fixed, small, self-contained
  tier: 36 files, roster pinned by a test**, the same components as the Kotlin port's 37 — spelled per language, not file-for-file identical. **No spine package is published on
  any registry**, and this pass does not publish one — that is the repository owner's decision. What
  is true today is that you copy the tier once and **never author it per feature**: every feature you
  add lands in `blocks/<X>/` plus the root, and each component is swappable behind its own contract.

**Gate check C15 is what turns that from a claim into a property of the build**: `spine/**` may not
name `blocks/**` or `app/**` — so the tier can be lifted out whole.

The honest headline is therefore: **two kinds of tool + thin wiring + a loop you depend on + a spine
you vendor once and never author per feature.**

---

## Context engineering is out of scope; the context SEAM is not (§6.11)

* **In scope, specified and enforced.** `projectContext(state, staged) -> Context` is a pure
  projection of committed State plus this step's *ordered* staged input; it carries a stated growth
  bound; `render(context)` is the exact text the model saw; and that text plus the active prompt
  version ride the committed record as `ContextFixture`, so a re-fold re-derives the digest and a
  change that silently alters what the model saw fails the golden trace **without re-running the
  model**.
* **Out of scope, and product-owned** — beside authorization (14.3), persistence & retention (14.6),
  configuration/secrets and out-of-band reconciliation (14.4): **what** you choose to project, how
  you rank, retrieve, compact or summarise it, and how you author the prompt.

The architecture's whole obligation is the invariant, not the strategy: **whatever you project is a
pure function of committed State plus staged input, and if you compact, the summary is a captured
fixture** — because "why did the agent decide this?" is unanswerable without the text the model
actually read.

---

## The two advanced rungs, and how they are proven

Both are **optional**. `wireApp(env)` names no mailbox, no scheduler and no relay; the consumer is a
separate `wireConsumer(app, …)` call. An app that takes neither rung pays exactly one thing: `staged`
is an ordered `StagedInput[]` rather than a single value. That is a **correction**, not a rung tax —
5.4 already specifies plural off-bus inputs "in their staging order, keyed to the consuming step",
and the shipped ports were narrower than the book.

**The barge-in mailbox (12)** — `spine/concurrency/consumer.ts`, proven in `test/spine/mailbox.test.ts`.
The book's 12.3 drain loop puts `outcome = await(inFlight)` at loop-body indentation while
`mailbox.take()` blocks at the top, so control never reaches `take()` during a turn and all three
guards are dead. The fix is a `Promise.race` over `{ the next message, the running turn's
completion }`. The proving test measures it on a **virtual clock**, and the file also transcribes the
book's broken loop and shows it failing at exactly the point the fixed one succeeds:

```
fixed consumer:      the interrupt's turn STARTS at virtual t = 100
the book's 12.3 loop: the interrupt is not even SEEN until t = 10 100
```

Also proven: cancellation is at a step boundary (the preempted turn's committed step and its effect
survive; there is no rollback); the cancel deadline is real and a turn that ignores it is **revoked**
so its late `submit` folds nothing; `Perishable` conflates with a **counted, folded, signed** drop
and `DurableQueue` (the default) never conflates, dedupes on a key and acks only after the commit;
and a turn that throws degrades to `TurnOutcome.Threw` without killing the consumer (12.4).

**The tiered relay (11)** — `spine/ports/relay.ts` + `blocks/analysis/`, proven in
`test/spine/relay.test.ts`. A deep tier publishes conclusions to an append-only relay; the fast tier
reaches them only through a recall tool returning **text**. The read is bounded by the party that
must not block, and the degrade is typed: `Fresh` / `LastKnown(text, publishedAt)` / `Empty` are
three distinct variants, so stale is never presented as fresh. A recall result is off-bus input, so
it is **captured** — on the record's ordered `staged` fixture *and* on the committed `ToolResult` —
and fed back on re-fold, never re-queried.

---

## Deliberate scope limits — specified but unproven

16.4 licenses stopping early, and that stays true. These rungs are built so the *reference* exercises
what it specifies, not so every adopter takes them. What is still **specified but unproven** is named
here rather than left to imply a parity that does not exist:

| | why |
|---|---|
| **Schema evolution (14.7)** | `StepRecord` carries no `schemaVersion` and no upcaster ships. A decision, not an oversight. |
| **Cross-session global ordering** | 5.2 puts causal consistency across independent streams out of scope. The two-tier test proves *separate* buses; it proves nothing about ordering between them. |
| **A distributed or sharded bus, bespoke persistence/retention, multi-tenant isolation** | 8.5 names these as swaps. The contracts exist; no adapter does. |
| **Where a snapshot is stored, compaction, retention (14.1/16.2)** | product policy. The snapshot *mechanism* left this row: `spine/replay` ships the memoized fold prefix, tagged with the reducer version, the timeline offset it covers, and the mark of the record it stops at. `test/spine/replay.test.ts` proves a snapshot-seeded resume equals what the live boundary and live sink produced, and that a snapshot resumed under a reducer version the caller is not folding with — or over a tail whose boundary the log does not confirm — is refused rather than folded. Two logs whose boundary records are byte-identical stay indistinguishable to that seam; the file says so. What a product still owns is where a snapshot *lives*, and how far below one it may compact. |
| **CI** | `.github/workflows/ci.yml` runs `npm test` (and the Kotlin suite) on every push and pull request — the same entry point a developer runs locally, no CI-only rule set. |
| **Dispatcher confinement of `submit`** | the consumer mints the turn's only channel and calls the boundary itself, so the reference cannot violate it — but an adopter who runs a turn on another thread could interleave two folds despite the design. Structural, **not gate-checkable**. |
| **The abandoned turn can leak** | after a cancel-deadline timeout the turn may never unwind. The design bounds the *consumer*, not the turn; removing the leak needs an unbounded join, which 12.3 itself calls a hang. The leak is named, degraded, counted and folded — never hidden. |
| **The `owns` type predicate is unguarded** | see the blast-radius note above: a new verb whose name is not added to `isXResult` typechecks and lints clean, then fails at runtime. TypeScript-only; Kotlin's root dispatch is a real sealed type check. |

---

## Deliberate scope decisions

* **Schema evolution (14.7) is out of scope.** `StepRecord` carries no `schemaVersion` and no
  upcaster ships. That is a decision, not an omission; a reader arriving from 14.7 will notice the
  gap.
* **A per-tenant budget (G6) is specified, not implemented.** `spine/ports/authorization` is its
  named home and its verdict already rides the committed record; no port ships a tenant budget,
  because no port has tenants.
* **The pure tool body runs twice per agent action.** Once in the SDK's `execute` so the model gets a
  payload-rich result to reason over, once at the boundary to produce the recorded truth. A pure
  function evaluated twice is free, and it buys a single production site for every `ToolResult` in
  the system. Both call sites carry a comment saying so.
* **`Boundary` is generic in the app's `State`.** That is the structural price of "the spine never
  names a block".
* **`State` is a product, not a sealed sum.** This application has exactly one whole-state shape.
  Every closed set *inside* it — `TicketStatus`, `SealStatus`, `RunStatus`, `Notice`, and the three
  transport hierarchies — is sealed.

---

## What replay does and does not buy

Replay is determinism over a **recorded timeline**: forensics, audit, and
production-traces-as-fixtures. It is **not** behavioural reproducibility — re-running the model is
not deterministic, and inputs conflated away were never recorded. What is guaranteed is that the run
that *was* recorded re-derives exactly, bit for bit, from its own committed bytes: the same state,
the same effect sequence, the same keys, the same timestamps.

`spine/replay/replay.ts` contains **no** fold-against-itself assertion. `f(x) == f(x)` is true by
definition and was measured to catch nothing. What is asserted is a live run against its re-fold.

---

## The gate (§15.2)

Fifteen checks, each **denying** (`npm run lint` exits non-zero), each with one **block-test** and
one **allow-test** over `test/gate/fixtures/`. There is no warning tier.

| id | Invariant |
|---|---|
| C1 | G4/G10 — dependencies point inward (the §1.3 import table, verbatim) |
| C2 | G11 — no cross-block symbol import |
| C3 | G9 — no clock, random or id outside the boundary |
| C4 | G1 — `Actor`/`Authority`/`Signature` unnameable where a `ToolResult` is declared; the `Signature` constructor bindable only inside `spine/boundary`, re-exportable as a value from nowhere |
| C5 | G9 — the fold cannot key an effect |
| C6 | §12.4 — a block may not touch the session-global `RunStatus` |
| C7 | G1 — one production site for `ToolResult` |
| C8 | G2 — tools (and everything pure) are pure |
| C9 | G12 — closed matches, no catch-all |
| C10 | G7 — no module-level mutable state |
| C11 | 7.9/G13 — ports are interfaces only |
| C12 | §4.6 — ephemeral view-state never folds |
| C13 | registry totality — every declared case has a `Verb` entry that signs |
| C14 | G3 — the loop is a declaration, not a program |
| C15 | G14 — the spine tier is self-contained: `spine/**` names no block and no root |

**Boring tooling on purpose.** Fourteen of the fifteen are ordinary ESLint rules in
`eslint.config.js` — `no-restricted-imports` (with one allow-list regex per folder, which is §1.3's
import table written out verbatim), `no-restricted-syntax` (the forbidden-call list) and the
type-aware `@typescript-eslint/switch-exhaustiveness-check`. Nothing is a bespoke analyser, so you
can check a rule against the ESLint docs rather than against us. C13 is a vitest check, because it
is a question about values rather than syntax.

**One checker, not two.** `test/gate/gate.test.ts` imports `gate` straight out of `eslint.config.js`,
so the block-tests and allow-tests run the same rule objects `npm run lint` runs. There is no second
implementation to drift.

**Every check has been watched deny.** Each rule was introduced as a violation into the real tree,
the gate was run, the denial observed, and the edit reverted — for all fifteen. Sample:

```
$ npx eslint .    # after adding `import type { TriageSlice } from "../../blocks/triage/slice"` to spine/replay/replay.ts
  1:1  error  '../../blocks/triage/slice' import is restricted from being used by a pattern.
              [C1] `spine/replay` may import `spine/pure`, `spine/ports` and `spine/boundary`
  1:1  error  '../../blocks/triage/slice' import is restricted from being used by a pattern.
              [C15] the spine tier is self-contained — it may not name a block   no-restricted-imports

$ npx eslint .    # after deleting one `case` from the TicketStatus match in blocks/escalation/project.ts
  38:11  error  Switch is not exhaustive. Cases not matched: "Resolved"
                @typescript-eslint/switch-exhaustiveness-check
```

A wrong rule is fixed. A red gate is a red build.
