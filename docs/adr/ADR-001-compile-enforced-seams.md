# ADR-001 — Compile-enforced seams: the reference implementation becomes a module DAG

Status: **ratified 2026-07-26** — `docs/DECISIONS.md` **D1** adopts the module DAG below, as amended by **D9** (§3/§4), and
schedules its execution in that record's phase **P4**; **D3** adopts §5.1's inversion of book §15. Execution is pending; the
decision is not.
· Supersedes the single-module `examples/kotlin` layout
· Book changes required: **§4.7 and §7.5/7.8** — D1's own list, verbatim, is "§4.7, §7.5/7.8; D3 owns §15" — plus **§15** (D3),
plus **§4.6**, which follows from **D9**'s adapter leaf (§5) and which D1's list does not name. That last one is *reported* here,
not added to D1: `docs/DECISIONS.md` is a locked record and only its owner widens it.

This is the execution blueprint for restructuring this repository's reference implementations so the
architecture's laws are **walls that do not compile**, not lint rules a comment switches off. It defines
the module DAG, the convention plugins that enforce every edge, the file structure, what moves to
compile-time versus what stays a residual check, and the execution order.

This document is **self-contained**: every module, plugin, rejection mechanism and measurement below is
stated here in full and is re-derivable against this repository alone, with no other checkout involved.
Builders execute against this doc; they do not invent structure.

---

## 1. Why this exists — the diagnosis

An adversarial review of PR #1 produced 52 verified findings. Read individually they are 52 bugs. Read
together they are **one** finding, and it is a layering error:

> The architecture's only structural safety property (the irreversible-action gate) had **five
> independent routes around it**, and the fifteen checks meant to catch that class were **switchable off
> by a one-line comment** (`/* eslint-disable */` in TypeScript, `@Suppress` in Kotlin).

The governing law this ADR is built on is stated here in full, so that nothing below depends on a
document outside this repository. Its name is **"You make drift not compile"** and it is the enforcement
law for agent-driven codebases:

> CLAUDE.md, write-time hooks, and code review are probabilistic filters over an **unbounded output
> space**. An agent will, with certainty over time, emit a structure none of them anticipated — a new
> pattern, a new failure mode, a rule routed around. They REDUCE drift; they cannot STOP it, **because
> you cannot enumerate what a generator will invent.** The only enforcement that scales with an unbounded
> generator is one that makes the violation **IMPOSSIBLE TO EXPRESS** — a compile-time structural
> boundary. You don't review your way out of drift. You make drift not compile.

PR #1 put lint on the front line. Every finding below is that mistake, seen from a different angle.

### 1.0 The corollary, and why this review nearly missed the point

The law's corollary is the **parameterization trap**:

> When deciding whether to invest in structural enforcement, do NOT measure the current snapshot's
> cleanliness — measure the **GENERATOR**. "The code is clean now" is the wrong bar; the right bar is
> "what holds when agents keep writing it." A snapshot-based pressure-test will systematically
> UNDER-weight structural enforcement, because it reads localized rot rather than the certainty of future
> drift. Set the problem-strength from the process, not the photo.

The review that produced this ADR's inputs is exactly such a snapshot test, and it under-weighted
structurally, on measurable evidence:

- Eleven analysis lenses over 326 files produced 134 findings. **Not one proposed module boundaries.**
  Every lens was asked "does this code match the book's claims", which is a question about the photo.
- The load-bearing defect surfaced instead from a **rule pack**, in seconds, as 81 hits of
  `no-loose-top-level-fun` — and was initially triaged as a false positive on the grounds that the
  architecture "needs" top-level functions.
- The one review finding that did touch structure (a spine type naming a block via a field name) was
  filed as `high` and noted as invisible to the import-based checks. It is **not** dissolved by §3; per
  Q2 the core names every feature deliberately. The finding was correct that no import-based check could
  see it, and wrong that it was a defect.

Read the corollary as a standing instruction for this repository: **a review of this codebase is not
evidence that its enforcement is adequate.** Adequacy is measured against the generator, and the
generator is an unbounded stream of agent-written Kotlin and TypeScript.

### 1.1 Scope: the trigger is authorship, not size or domain

The law is the enforcement law for **any codebase written by an LLM**. Its trigger condition is stated
in its own framing — *"because the code is written by agents/LLMs"* — not the domain it was first
observed in and not the size of the codebase. The domain it was found in is not its boundary; the
authorship of the code is.

Two arguments against applying it here are both instances of the parameterization trap and are both
rejected:

- *"This is a 60-file teaching example, too small to justify 8 Gradle modules."* Size is a property of
  the photo. The generator writing the next 10k lines against this structure is the parameter.
- *"The example code is currently clean."* That is the corollary's named failure mode, verbatim.

### 1.2 A book carries this obligation twice

This repository is not only an LLM-written codebase. It is a **book teaching people how to build
agent-driven applications**, and its reference implementation is the artifact readers copy. So the law
binds it twice:

1. **As a codebase** — it is agent-written, so its own seams must be walls.
2. **As a specification** — every application built from it will be agent-written *by definition*. §16.3's
   own adoption rubric lists "code is generated fast, at volume" as one of four signals that the pattern
   pays for itself. The book therefore identifies the law's exact trigger condition, and then answers it in
   §15 with four dozen bypassable checks.

That is the sharpest statement of the defect: **a book about agent-driven architecture teaches the
probabilistic-filter layer to precisely the audience that can least afford it.** Every reader who adopts
§15 as written inherits enforcement that a comment disables, in a codebase written by a generator that
will eventually emit the shape no rule anticipated.

Fixing the reference implementation is therefore necessary but not sufficient. §15 must be inverted (§5.1)
because the book's readers, not just this repository, are the ones the law protects.

### 1.2.1 The second, deeper defect: the core was unsubstitutable

The book's testing pitch is port substitution (§7.2 "a fake-in-test and the real-in-production runtime
swap behind one interface"; §7.3 the composition root binds ports to adapters). The core **as reviewed**
was expressed as **top-level functions** — `fold(state, results, now)`, `project(state)`, `wireApp(env)` —
and `object` singletons, none of which could be bound, faked, or swapped at that root.

`fun interface` costs nothing at the call site (SAM conversion keeps `Projection { state -> ... }`) and
buys full substitutability. **Top-level functions are a TypeScript idiom.** They are not testable in the
sense this architecture means by testable: not injectable, not fakeable, not bindable.

**The prescription has since landed, and the measurement is now this repository's own.** Re-derive it by
running these three commands from the repository root. No other checkout is involved, and no commit id is
cited, so the evidence survives a rebase or a squash of the branch that produced it:

```
$ S=examples/kotlin/src/main/kotlin/adr/spine
$ grep -rE '\b(class|interface|object) [A-Z]' $S | wc -l                     # 132
$ grep -rE '^(public |internal |private )?fun ' $S | wc -l                    # 14
$ grep -rE '^(public |internal |private )?fun ' $S | grep -vc 'fun interface' #  0
```

**132 class/interface/object declarations against 14 top-level `fun`s — and all 14 are `fun interface`
declarations.** Every seam this section named a loose function is now a SAM interface (`Fold`,
`ProjectContext`, `Lens`, `Source`, `Emit`, `Report`, `Submit`, `TurnRunner`, `Decode`, `Run`, `Sign`,
`Narrow`, `RequestedBy`, `Barrier`); `wireApp` is a member of a constructed `Wiring`; the only top-level
function left under `src/main/kotlin/adr/` is `fun main()`. The diagnosis is kept because §5 and §6 are
built on it: it records a defect that was closed, not one that is open.

### 1.2.2 The book is wrong, not only the code

Kotlin seals a hierarchy **within one module**. A block in its own Gradle module therefore **cannot** add
a case to a `:spine`-sealed `Command`/`ToolResult`/`Effect`. The book's §4.7 ("a block contributes
`Command` case(s)… and fold arm(s)") is only implementable if every block lives in the same compilation
unit as the kernel — which is to say, if the module wall does not exist.

So the book states two things that cannot both hold:

| Book claim | Status |
|---|---|
| §4.7 a block contributes `Command` cases and fold arms into the shared spine | **incompatible with module isolation** |
| §6.5 / G12 the fold is an exhaustive `when` with no `else` | compile-time, and worth keeping |
| §7.6 / G10 imports point inward, enforced by the gate | **enforced at the wrong layer** (lint, bypassable) |

This ADR chooses exhaustiveness and the wall, and amends §4.7. See §5.

---

## 1.3 Four questions the audit raised, and their answers

The document audit surfaced four decisions this ADR had left open or answered inconsistently. All four
are resolved here, in plain terms first.

### Q1. When you add a feature, who owns its vocabulary?

**Answer: the shared core owns it.** A feature contributes behaviour, not new words.

The alternative — each feature declaring its own commands and result types — requires every feature to
live in the same compilation unit as the core, because Kotlin seals a set of cases within one module.
That is the same thing as having no wall. You may have compile-time exhaustiveness or feature-owned
vocabulary; you cannot have both.

The cost is real and this ADR previously hid it: **the book's claim that a new feature touches "four
sites inside one folder and zero sites outside" is false under this answer, and must be deleted — but
only once this ADR is accepted.** Under the current single-module layout the claim holds for verbs (with
the one exception the book now lists itself: a novel effect kind adds a compiler-named branch in the
root's sink), so the deletion is queued behind the decision, not owed today. Under the module DAG, some
of the sites move into the shared core, and the claim as written stops being true.

That cost is smaller than it looks, for a reason the book already argues elsewhere. Adding a case to a
sealed set makes the compiler name every place that must handle it — §6.10's own words, "the type system
hands you the complete list of edits the change requires." So the honest claim is not "zero sites
outside the folder" but: **a new verb is a handful of appends, every one of them named by the compiler,
none of them a rewrite of shared logic.** That is still a small constant. It was simply never zero, and
the review already measured the current claim as an undercount because §6.8 never counted `ToolResult`.

### Q2. Is it acceptable that the core knows every feature exists?

**Answer: yes, and it is a feature rather than a defect.**

The isolation that matters is that **feature A cannot reach feature B**. Whether the shared core knows
both exist is a different and much weaker concern: the core is the shared language, and a language
naming its speakers is not coupling in the harmful sense. This repository already does exactly this:
`examples/kotlin/src/main/kotlin/adr/app/Contract.kt`'s `data class State` carries one field per block
slice, **plus the spine's own** — `val spine: SpineSlice` first, then the six block slices: seven fields.

Better: if each feature's slice is its own type in the core, then a projection typed to one slice
**cannot read another one at all**. That lifts "a feature writes only its own slice" from a residual
check to a compile-time wall. Naming the features makes the wall stronger, not weaker.

**Correction required in this document:** §1.0 and §10 currently credit the module graph with
*dissolving* the review finding that a spine type named a block. It does not dissolve it; it makes it
deliberate. Both passages are wrong and are corrected.

### Q3. What is a feature's public surface?

**Answer: it is led by a type the root constructs** — `public class TriageBlock : Block<TriageSlice,
TriageResult, TriageView>`, implementing an `interface Block` declared in the core. It is not one symbol:
§4 measures the whole frozen set — the block type, its slice and view types and everything those reach,
its block ports where it declares any, and the verb constants `:app` names.

`public fun register(spine: Spine)` contradicts this ADR's own first decision, which forbids top-level
functions precisely because they cannot be bound, faked or swapped.

**This answer was corrected once, after the conversion actually landed** — the original read "a value,
not a function: `public val Triage: Block`, behind a `fun interface Block`". Two defects, both found by
building it:

1. A top-level `val` does not satisfy the decision it claims to. The reason a value was wanted is that
   it "can be substituted in a test", and a top-level `val` cannot: it is a global that every consumer
   hard-names, which is the property being cured, not the cure. Note it also slips past the rule pack —
   `Block` is not a function type, so `no-loose-function-typed-val` does not fire on it. A class is
   what the reason actually asks for; the root constructs it and a test constructs a different one.
2. `fun interface Block` cannot be taken literally, because a block has more than one role and a SAM
   interface holds one abstract method.

The role set was then **measured** rather than assumed, across the six shipped blocks: `arm` 6/6,
`view` 6/6, `contextLines` 5/6 (artifact contributes a count, never lines), `register` 5/6 (analysis
has three, because a tier is an allowlist). So `Block` declares the universal two and no more. An
interface derived from a single block instead over-fits to it — measured: a draft written from `triage`
alone declared all five roles, and neither `artifact` nor `analysis` could have implemented it without
stubbing a role it does not have.

### Q4. Does the TypeScript port ship?

**Answer: yes, but relabelled.** It demonstrates the **architecture** — the signed stream, the pure
fold, the single impure boundary. It does **not** demonstrate the **enforcement**, because TypeScript
has no configuration-time module wall and its equivalents are weaker.

Dropping it would cost the book its platform-agnostic claim, which is a genuine strength. Keeping it
while implying the two ports enforce identically is the overclaim §1.2 exists to remove. So it ships
with that distinction stated **per claim**, not as a footnote, and the Kotlin port is named as the
enforcement reference wherever enforcement is discussed.

Adopt this as the test for any future parity claim: **can the wall survive an adversarial agent, proven
by watching it fail?** If not, it demonstrates the shape and not the wall, and the text must say so.

---

## 1.4 The transport model: sealed hierarchies with shared properties on the parent

Commands and State are carried by **sealed classes declaring their shared fields as `open val` in the
constructor**, with `data class` variants overriding them. This is the load-bearing choice for every
value that crosses a layer, and it is what makes §1.3's Q1 answer worth its cost.

Verified by compiling the exact form (not asserted):

```kotlin
sealed class Command(open val by: Actor, open val id: CommandId) {

    sealed class Domain(by: Actor, id: CommandId) : Command(by, id) {
        data class SetPriority(
            override val by: Actor, override val id: CommandId,
            val ticket: TicketId, val level: Priority,
        ) : Domain(by, id)
    }

    sealed class Surface(by: Actor, id: CommandId) : Command(by, id) { /* ... */ }
}
```

Four properties, all confirmed to compile and run:

1. **Declared once, carried by construction.** `by` and `id` are written in one place. No variant can
   omit them, because the parent constructor requires them.
2. **Readable without knowing the variant.** The boundary reads `command.by` and `command.id` off any
   command at all. It does not switch to find them.
3. **Part of the variant's value semantics.** Because subtypes `override` rather than merely pass up,
   the shared fields participate in `equals`, `hashCode` and `copy`. A record that differs only in its
   actor is a different record, which is what an audit log requires.
4. **Exhaustive at more than one depth.** A nested sealed group lets one consumer match
   `is Command.Domain` and another match `is Command.Domain.SetPriority`, and the compiler checks both
   for completeness with no `else`. Each layer matches at the depth it needs; none can miss a case.

Property 4 is why this beats every alternative for crossing layers. The surface, the boundary, the fold
and the audit log each need a different amount of the same value, and a nested sealed hierarchy serves
all four from one declaration with a compile-time completeness check at each depth.

**The one exception — capability versus data.** `copy()` is a feature for a value that *describes* what
happened and a forge vector for a value that *authorizes* something. So:

| the type carries | form | why |
|---|---|---|
| a description of what happened (`Command`, `ToolResult`, `State` slices) | sealed parent + `data class` variants | value semantics are wanted; `copy` is correct |
| an authority or a permission (`Signature`, the gate's witness, irreversible `Effect`s) | non-data class, `internal` constructor | `copy` would mint a forged one; see §6.6 and §7 |

This is a split by what the type carries, not an inconsistency. Most transport is data and should be a
`data class`. The few types that are capabilities are not.

---

## 2. The shape — what stays, what changes

- **Three rings, dependencies point inward, only the boundary is impure.** Unchanged from the book.
- **A block is a vertical slice whose frozen public surface is led by a TYPE the root constructs** —
  `class TriageBlock : Block<TriageSlice, TriageResult, TriageView>`. It contributes a **tool** and a
  **projection**. What it keeps `internal` is its fold/arm implementation, the internals of its tool
  declarations, its projection class, and every helper type no public type reaches. Its slice and view
  types are *not* among those — §4 measures the surface and says why they cannot be.
- **Blocks couple only through the one folded `State` and the one bus — never by import.**
- **The kernel stays whole.** `Command`, `ToolResult`, `Effect`, `State`, the fold, the boundary and the
  bus live in `:spine` and nowhere else. They are the shared language every block speaks; they are not
  any one block's private property.
- **Every seam is a `fun interface` or an `interface`, never a top-level function**, so it can be bound
  at the root and faked in a test.

---

## 3. Module DAG (the dependency law — compile-enforced)

```
build-logic/                     convention plugins (adr.*) — an included build; ENFORCES every edge

:spine             → (nothing)   THE KERNEL: sealed Command/ToolResult/Effect/State,
                                 the exhaustive fold, the boundary, the bus, replay, ports.
                                 PURE JVM — no IO on the classpath.
                                 The KERNEL PORTS live here and nowhere else — Authorization,
                                 Bus, Clock, EventSource, IdSource, Mailbox, ModelProvider,
                                 Relay, Sink (adr/spine/ports/, nine files today).
:block:<x>         → :spine      a vertical slice: its tool(s), its decision logic, its own BLOCK
                                 PORT INTERFACES, its projection.  PURE JVM — no IO on the classpath.
                                 A block port is that block's own — OncallPort, DeliveryPort,
                                 AnalysisRelay — and never restates a kernel port.
:block:<x>:adapter → :block:<x>, :spine
                                 that block's live IO — client, SDK, socket.  IMPURE.  Implements
                                 that block's BLOCK ports; lives in the block's own folder (§5).
:app → :spine, :block:*, :block:*:adapter
                                 THE ROOT: CONSTRUCTS every block, constructs every adapter and
                                 binds it to its port, constructs the boundary, builds the agent
```

Blocks: `triage · escalation · console · artifact · analysis · inbox` (the six the current code already
has).

**Forbidden edges, rejected at configuration time by the convention plugin:**

- `:block:<x>` may depend on **`:spine` only** — not a sibling block, not `:app`, not its own adapter,
  and no IO library.
- `:block:<x>:adapter` may depend on **`:block:<x>` and `:spine` and nothing else BY PROJECT EDGE**. Its
  IO client, SDK or socket **library** is permitted — holding it is the whole reason the module exists
  (§4). Only `:app` may depend on *it*.
- `:app` is the **only** module permitted to name a concrete adapter CLASS, and the only module outside
  an adapter leaf permitted an IO dependency of its own.
- Exactly **one** boundary, bus and fold, in `:spine`. No block can stand up a second, because their
  constructors are `internal` to `:spine` and therefore **not visible** across the module boundary.

A wrong edge fails `./gradlew` **at configuration, before a line compiles.** The dependency law becomes
build code, not a review comment.

---

## 4. build-logic/ — the enforcement made build code

`build-logic/` is an included build exposing plugins applied by `id("...")`:

| plugin | applied by | wires and enforces |
|---|---|---|
| `adr.kotlin.library` | every module | Kotlin JVM, `explicitApi()`, jvmTarget 21, binary-compatibility-validator (`.api` dump wired into `check`) |
| `adr.spine` | `:spine` only | asserts it is the only module declaring the boundary, bus or fold; forbids IO libraries on the classpath |
| `adr.block` | `:block:<x>` | auto-adds `implementation(project(":spine"))`; **rejects every other project dependency**, including the block's own adapter; forbids IO libraries on the classpath |
| `adr.block.adapter` | `:block:<x>:adapter` | auto-adds `implementation(project(":spine"))` and a dependency on its parent `:block:<x>`; **rejects every other project dependency**; IO libraries **allowed**; asserts no module but `:app` depends on it |
| `adr.root` | `:app` only | the only plugin permitting `:app` to name a concrete adapter CLASS and to depend on a `:block:*:adapter`. The IO ban has exactly two owners — `adr.block` and `adr.spine`, each forbidding it on its own module — and no other plugin carries IO policy: `check()`s compose by conjunction, so a ban in `adr.kotlin.library` (applied by every module) would fail the very `:app` and `:block:<x>:adapter` classpaths this table permits |

Rejection mechanism:

```kotlin
project.afterEvaluate {
    val allowed = setOf(":spine")
    listOf("api", "implementation", "compileOnly", "runtimeOnly").forEach { cfg ->
        configurations.findByName(cfg)?.dependencies
            ?.filterIsInstance<ProjectDependency>()
            ?.forEach { dep ->
                check(dep.path in allowed) {
                    "adr.block: ${project.path} may depend only on :spine — found ${dep.path}."
                }
            }
    }
}
```

`adr.block.adapter` applies the identical mechanism with `allowed = setOf(":spine", project.parent!!.path)`
— same check, same failure message, exactly one more permitted edge. `adr.root` inverts it: it asserts
that every `:block:*:adapter` in the build is depended on by `:app` and by nothing else.

**API freeze, over a MEASURED surface.** `apiDump`/`apiCheck` commits a `<module>.api` per block. Its
content is **not one symbol** — an earlier draft of this ADR said it was, and that claim is retracted
here. A block's frozen public surface is: {its `Block` type} ∪ {its slice type} ∪ {its view type} ∪
{every type those two reach — `TicketRow` from `TriageView`; `Ticket` and `Priority` from `TriageSlice`,
`Ticket` also from `TriageBlock.slice(...)`} ∪ {its block port interfaces, where it declares any} ∪ {the
verb / `ToolName` constants `:app` names}.

Re-derive it from the repository root. Under §3's DAG `:app` is a separate module, so every block symbol
`:app` names has to be public, which makes this command the surface's lower bound:

```
$ for b in triage console inbox escalation artifact analysis; do echo -n "$b: "; \
    grep -rho "adr\.blocks\.$b\.[A-Za-z_]*" examples/kotlin/src/main/kotlin/adr/app/ \
    | sort -u | sed "s/adr.blocks.$b.//" | tr '\n' ' '; echo; done
triage: Ticket TriageBlock TriageSlice TriageView
console: ConsoleBlock ConsoleSlice ConsoleView SET_PANEL
inbox: InboxBlock InboxSlice InboxView NOTE_DROP NOTE_FAULT
escalation: CONFIRM_ESCALATION EscalationBlock EscalationSlice EscalationView LivePager OncallPort REQUEST_ESCALATION
artifact: ArtifactBlock ArtifactSlice ArtifactView CONFIRM_SEAL DeliveryPort LiveDelivery RECORD_FINDING REQUEST_SEAL
analysis: AnalysisBlock AnalysisRelay AnalysisSlice AnalysisView LiveRelayWriter PUBLISH_ANALYSIS RECALL_ANALYSIS
```

Four, four, five, seven, eight, seven today. Under D9 the three concrete adapter classes in that output —
`LivePager`, `LiveDelivery`, `LiveRelayWriter` — leave `:block:<x>` for the adapter leaf and are frozen in
*that* module's `.api` instead, leaving **4 · 4 · 5 · 6 · 7 · 6** as the `:app`-named **lower bound** for
triage · console · inbox · escalation · artifact · analysis. The frozen `.api` set is **strictly larger**
than that floor: the formula above adds the types the slice and view reach, which `:app` never names but
Kotlin's `explicitApi` forces public (`TicketRow` and `Priority` for triage — marking them `internal`
does not compile). Measured against the live tree, the frozen sets are **6 · 5 · 5 · 8 · 9 · 8**. A
public declaration beyond the frozen set fails `apiCheck` in CI, and `internal` on everything else makes
that automatic. This still replaces what
the review measured — **14 to 20 public declarations per block and zero uses of `internal`
repository-wide** — but by shrinking the surface to a measured floor rather than to one symbol.

**Why the surface cannot be one symbol.** Kotlin `internal` does not cross a module edge, and under §3
`:app` is a different module from every block. `:app`'s `State` (`adr/app/Contract.kt`: one field per
block slice plus the spine's own) names every block's **slice** type; its `AppView` names every block's
**view** type; and each of those drags its own property types along. That forces the surface open for
*every* block, including the three that declare no port at all — `triage`, `console` and `inbox` have no
`Port.kt` and still name four, four and five symbols. So the port edge is not what decides this, and for
half the blocks it does not arise at all.

**What is still open is the mechanism, not the measurement.** This ADR does not ship a mechanism it has
not compiled — §6.6 holds itself to the same bar — so the choice is recorded open rather than guessed:

- **Accept the public surface** and let the `.api` freeze be the wall. Cheap, and the surface above is
  small and measured.
- **Friend association** — `-Xfriend-paths`, or Gradle's `associateWith` — letting `:app` and
  `:block:<x>:adapter` see `internal` declarations of `:block:<x>`, shrinking the surface further. It has
  to be shown to hold across an `api`/`implementation` edge and under binary-compatibility-validator.

Neither has been compiled in this repository, so neither is prescribed here. What does **not** depend on
the choice: a *sibling* block is kept out by §3's dependency law, rejected at configuration time before
visibility is consulted at all. Visibility is the second lock on a welded door.

---

## 5. What a block contributes (amends book §4.7)

A block does **not** contribute `Command`/`ToolResult`/`Effect` cases. Those stay sealed in `:spine`,
because that is what keeps the fold's `when` exhaustive with no `else`, which is a compile-time guarantee
that adding a result forces every handler to be written. A per-block registry would replace that with
runtime dispatch and silent pass-through: the weaker wall.

A block contributes:

```kotlin
// :spine/Block.kt — the roles EVERY block shares, measured across the six shipped blocks:
//   arm 6/6, view 6/6, contextLines 5/6 (artifact contributes a COUNT), register 5/6
//   (analysis has THREE, because a tier is an allowlist). Only the universal two are
//   declared here; pinning the other two would force exactly the per-block special-casing
//   the interface exists to avoid.
public interface Block<Slice, R : ToolResult, View> {
    public fun arm(slice: Slice, result: R, now: Timestamp, sig: Signature): ArmOut<Slice>
    public fun view(slice: Slice): View
}

// the LEAD symbol of each :block:<x> — the TYPE the root CONSTRUCTS.  The rest of the
// frozen surface (slice, view, what those reach, block ports where the block has any,
// and the verb constants :app names) is MEASURED in §4, which also says why it cannot
// be reduced to one symbol and which visibility mechanism is still open.
public class TriageBlock : Block<TriageSlice, TriageResult, TriageView>
```

**Not `public fun register(spine: Spine)`, and not `public val Triage: Block`.** An earlier draft of
this ADR wrote the first while §1.3 Q3 simultaneously named it as contradicting the ADR's own first
decision — the contradiction sat here unfixed until two independent audits reported it. Q3's own
answer, a top-level `val`, does not survive either: Q3 wanted a value because a value "can be
substituted in a test", and a top-level `val` is a global that every consumer hard-names, which is the
property being cured rather than the cure. A class satisfies Q3's *reason*. The root constructs it,
and a test constructs a different one.

and keeps `internal`: its fold/arm implementation, the internals of its tool declarations, its
projection class, and every helper type no public type reaches. Its slice type, its view type and the
types those reach are **not** internal and cannot be — `:app`'s `State` and `AppView` name them across a
module edge (§4). Its block port interfaces are public for that reason plus one more: its own adapter
module implements them.

**Book change required:** §4.7's "contributes to shared: `Command` case(s) the feature adds" and "the
state slice + its fold arm(s)" become "contributes a tool and a projection; the shared language stays in
the spine." §7.5/§7.8's folder trees become module trees.

**Where the retracted one-symbol claim is still published.** Measured case-insensitively across both
spellings in use — `one public symbol` and `only public symbol` — this is a report of sites, none of
which this ADR edits:

| file | lines | count |
|---|---|---|
| the book, `wiki/index.html` | 1314, 1350, 1383, 2738 | 4 |
| `wiki/example/06-blocks-and-root.html` | 51, 169, 210 | 3 |
| `README.md` | 90 | 1 |
| source-file headers under `examples/` | — | 12 |

Twenty sites, and note the trap in measuring them — it is §11 point 3's trap one layer up. A
case-sensitive `grep -c 'one public symbol'` over the book returns **0**; concluding from that number
that the book is clean is wrong. The book spells it "only public symbol" three times and
"THE ONE PUBLIC SYMBOL" once, so a variant-blind grep reports a file clean while it states the claim
four times.

**Two of those book sites sit on no amendment list at all** — not D1's (`docs/DECISIONS.md` lines 14–19,
which names §4.7 and §7.5/7.8 only) and not this ADR's Status line. Book **§7.9** (book line 1383) and
book **§17.6** (line 2738, the vocabulary table) state the claim outside every section anyone has
undertaken to amend, and §17.6's number is frozen forever, so a miss there is a permanently published
contradiction. This is a **report**, not a re-decision: whether D1's list needs widening is the owner's
call on a locked record, and nothing under `wiki/` is touched by this ADR.

**A second book change this ADR previously failed to name: §4.6 — now settled.** The book ships the live
adapter *inside the block* — "the only file in the block that holds a client" — and its deletability
story ("pull a block out by deleting the folder") includes that adapter. Under §3's DAG a `:block:<x>` is
pure JVM with IO libraries forbidden on the classpath, so escalation's `LivePager` and artifact's
`LiveDelivery` cannot stay where §4.6 puts them. This ADR previously left two resolutions open — grow the
DAG an adapter leaf, or amend §4.6 away. **`docs/DECISIONS.md` D9 chose the leaf:** two Gradle modules per
block, `:block:<x>` pure and `:block:<x>:adapter` impure, both inside the block's own folder — because
Gradle cannot scope a dependency ban below module granularity, and this is the structure that keeps "pull
a block out by deleting the folder" true under the DAG. §3 and §4 above are written to that decision.

§4.6 therefore keeps its story and gains a module tree, exactly as §7.5/§7.8 do. It joins §4.7 on the
book's amendment list as a **module-tree** edit rather than a retraction: the adapter is still the
block's own file, and the block still deletes as one folder. It reaches that list as a consequence of D9,
and D1's own list does not name it — see the Status line.

### 5.1 §15 is the largest book change, and it is a thesis inversion

§15 ("Executable architecture: enforce, don't review") asks **exactly** the question §1's governing law
answers:

> "This is the answer to 'how do you keep AI-written code correct at volume?' You make the architecture
> executable: a specification that fails the build rather than a wiki page nobody reads. In one
> implementation of this pattern, roughly four dozen checks back the invariants."

Four dozen checks is the **probabilistic-filter layer**, offered as the whole answer. §15.1 even states
the premise correctly — "an author, human or model, writes idiomatic code from a different paradigm that
happens to break a contract… the violation is structural" — and then reaches for the weaker instrument.
The review measured the consequence: a one-line comment disables 14 of the 15 shipped checks.

§15 must be inverted, not patched:

| current §15 | revised §15 |
|---|---|
| encode each invariant as a check that denies | make each invariant **impossible to express**; a check is what remains when you cannot |
| the gate is the enforcement | the **module graph, visibility, sealed types and witness tokens** are the enforcement |
| ~4 dozen checks back the invariants | a check that a comment disables was never backing anything |
| "a denial is a wall it must route around correctly" | a wall you can annotate past is a door; the wall is the thing that does not compile |

The section keeps its two good disciplines (every check ships a block-test and an allow-test; a wrong
rule is fixed, never disabled) and gains the enforcement ladder from §6: compile-time, then
configuration-time, then residual check, in that order, with a stated reason whenever an invariant sits
lower than compile-time.

This is also the honest correction to G1–G16. Several are stated as things a gate checks when they are
properly things a type prevents. Each invariant should carry its **enforcement layer** in its own text,
so a reader can see at a glance which laws are walls and which are hopes.

---

## 6. Invariants, by enforcement layer

**Impossible to express (compile or configuration time):**

1. `block ↛ sibling`, `block ↛ app`, and the IO law as D9's adapter leaf leaves it: IO is permitted in
   `:block:<x>:adapter`, forbidden in `:block:<x>` and in `:spine`, only `:app` may depend on an adapter
   leaf, and only `:app` may name a concrete adapter class — module DAG plus convention plugins (§3, §4).
2. **One baseplate** — boundary, bus and fold have `internal` constructors in `:spine`. A block cannot
   instantiate a second because it is not visible across the module boundary. *(currently a lint rule)*
3. **Tool purity** — the tool `Ctx` carries only `{state, context}`, and `:block:<x>` has no IO library
   on the classpath (its adapter leaf does, which is exactly why that is a separate module — §3, §4). A
   tool cannot read a clock or perform IO because neither is in scope. *(currently a lint rule)*
4. **Fold exhaustiveness** — sealed `ToolResult` plus `when` with no `else` is a Kotlin compile error.
   *(already correct; preserve it by keeping the kernel whole)*
5. **A block's public surface is the measured frozen set** — its `Block` type, its slice and view types
   and everything those reach, its block port interfaces where it declares any, and the verb constants
   `:app` names; §4 pastes the command that measures the `:app`-named lower bound and publishes both
   series — the floor and the strictly larger frozen set the reached types force (6 · 5 · 5 · 8 · 9 · 8
   across the six blocks). `internal` on everything else plus the `.api` freeze, with `:app` and the
   block's own adapter leaf the only modules permitted to depend on the block at all (§3, §4).
   *(currently unenforced)*
6. **The irreversible-action gate** — a **witness type**, stated as a requirement rather than a snippet,
   because the first draft of this item was itself a rule wearing a compile-time label.

   **The requirement.** An irreversible `Effect` must be *unconstructible* without a token, and the
   token's minting scope must be **strictly smaller than the fold's scope**. That second clause is the
   whole content of the invariant, and it is what the first draft got wrong.

   **Why the obvious version fails.** `class Confirmed internal constructor(...)` declared in `:spine`
   means "not constructible outside `:spine`". But §3 puts the fold, the bus, replay and every sealed
   union *inside* `:spine`, so every fold arm can mint a token. Block modules already cannot construct
   any `Effect` (their constructors are `internal` too), so the witness adds **nothing across the module
   edge and is pure convention within it**. "Minted only by the boundary's gate" would be a review-layer
   rule with a compile-time label — the exact substitution this ADR exists to remove.

   **Two candidate mechanisms, both real, neither yet verified to compile.** This is an open decision:

   - **A separate `:spine:gate` module.** `internal` then means "the gate, and nothing else". Cost: the
     token, `Authority`, and the irreversible `Effect` constructors must sit below or inside that
     module, so the kernel splits and the dependency direction needs working out (`Effect` cannot live
     above the gate and take a gate type).
   - **A `private` constructor with the mint nested in the gate class.** No module split, but `private`
     in Kotlin reaches the enclosing class body including its companion, so the scope is "the gate
     class" rather than "the gate function" — weaker, and it must be shown to be strong enough.

   **Two further defects in the first draft, both fixed by the requirement, both recorded because they
   are instructive:**

   - It used `public data class PageOncall internal constructor(...)`, reintroducing the exact `copy()`
     forge vector §7 exists to remove. Any effect or signature type must be a **non-data class**, and
     `adr.kotlin.library` must pin the copy-visibility compiler flag so this is enforced rather than
     remembered.
   - The token was a **bearer** — it carried an `Authority` and no binding to the payload it authorized.
     A token minted for one result therefore authorizes a different one, so **payload TOCTOU is not
     closed** by construction alone. The token must carry a binding to what it authorized (the result
     digest, or the type itself via `Confirmed<PageOncall>`), and the effect's constructor must check it.

   **Scoped claim.** Construction-with-a-token closes verb rebinding, submitter-chosen actor, requester
   overwrite and `Signature.copy()`, because none of those can produce a token. It closes payload TOCTOU
   **only** with the payload binding above. The earlier claim that it closed all five at once was wrong.

**Residual checks (genuinely semantic, cheap structurally impossible):**

7. A block's projection and tool write only their own slice of `State`.
8. Effects are emitted only from a fold arm whose transition succeeded.

Residual checks are **konsist tests in `:spine`'s test source set**, not lint, and they run in `check`.

---

## 7. `Signature` and the data-class problem

`data class Signature(val by: Actor, val authority: Authority)` synthesizes `copy()`, which forges a
stamp past a detekt rule that denies only `<init>`. Under this ADR the fix is structural, not a new rule:

```kotlin
public class Signature internal constructor(
    public val by: Actor,
    public val authority: Authority,
)
```

A non-data class in `:spine` with an `internal` constructor cannot be constructed or copied from any
block module. The rule that tried to police this is deleted rather than widened.

---

## 8. The TypeScript port — an honest asymmetry

TypeScript has no configuration-time module wall. The closest equivalents are npm workspace packages with
`exports` maps plus `tsconfig` project references, which make a cross-block import a **resolution error**
rather than a lint error. That is a real wall and it should be built, but it is weaker than Gradle's, and
the book must say so rather than implying parity.

Minimum for the TypeScript port:

- one workspace package per block, `exports` limited to `./register`
  *(this line is the TypeScript port's pre-D9 phrasing and is left standing on purpose: **D11** has
  settled what a TS block package exports — "`exports` limited to the registration" — landing in the
  ratified P4, so §5's removal of `public fun register(spine: Spine)` on the Kotlin side does not
  reach it.)*
- `tsconfig` project references so `:block` cannot see a sibling's source
- `linterOptions.noInlineConfig = true`, closing the `/* eslint-disable */` bypass the review reproduced
  *(landed 2026-07-26, ahead of this ADR's decision — see §11)*
- the same witness-type pattern, which TypeScript expresses with a branded type and a private constructor

**State the asymmetry in the book.** The Kotlin port is the reference for structural enforcement; the
TypeScript port demonstrates the same architecture with a weaker wall. Claiming both ports enforce
identically is the kind of overclaim this whole review exists to remove.

---

## 9. Execution order

These are **stages inside this ADR**, not phases of the ratified programme. All five sit within
`docs/DECISIONS.md`'s phase **P4** ("the walls"); that record's P0–P5 are a different and larger
sequence, and this section deliberately does not reuse its numbers.

- **Stage 1 — sequential, one builder.** `build-logic/` plugins plus `:spine` (kernel moved verbatim,
  `internal` constructors, the `Confirmed` witness). The top-level-function conversion §1.2.1 prescribed
  has already landed. Gate: `:spine` compiles, its `.api` is dumped and reviewed.
- **Stage 2 — sequential, one builder.** The reference block `:block:triage` end to end, **as the module
  pair D9 requires**: `:block:triage` pure, `internal` on everything §4's frozen set does not name, `.api`
  frozen to that measured surface; `:block:triage:adapter` holding its live IO. Triage declares no port
  and still freezes the six-symbol set §4 measures for it — the four names `:app` uses plus the two
  reached types `explicitApi` forces public — so this template shows the general case rather than a
  degenerate one. Every other block copies it.
- **Stage 3 — parallel, one builder per block.** `escalation · console · artifact · analysis · inbox`.
  Each creates its module pair, moves its files, applies `adr.block` and `adr.block.adapter`. Blocks do
  not import each other so they do not contend; the only shared write is `:app`'s construction list,
  which the orchestrator applies serially.
- **Stage 4 — sequential.** `:app`: the root constructs every block, constructs every adapter and binds
  it to its port, wires the agent and the demo. Delete what the restructure orphans.
- **Stage 5.** Residual konsist invariants, `.api` baselines, and the book's module-tree edits (§4.6,
  §4.7, §7.5/7.8) plus the honest TS asymmetry (§8). Two neighbours are **not** this ADR's to schedule
  and are named only so the dependency is visible: the TypeScript workspace split is **D11**, landing in
  the same ratified P4; book §15's inversion is **D3**, landing earlier, in the ratified P2.

Gate between every stage: `./gradlew build` green, and for Stage 2 onward the `.api` diff reviewed.

---

## 10. What this does to the 52 open findings

| class | count | disposition |
|---|---|---|
| gate bypasses | 5 | dissolved by the `Confirmed` witness (§6.6) |
| `internal`/visibility/ABI | 3 | dissolved by `.api` freeze plus `internal` (§4) |
| cross-block coupling | 1 | dissolved by the module DAG (§3) |
| spine naming a block | 1 | **not dissolved** — per Q2 the core names every feature deliberately, and per-feature slice types make cross-feature reads fail to compile. The finding is answered, not removed. |
| enforcement bypasses (`eslint-disable`, `@Suppress`, missing task inputs) | 3 | mostly dissolved: the checks they defeat stop being load-bearing (§6) |
| Kotlin idiom and concurrency (`Consumer.kt` cluster) | ~12 | **survive** — real defects, fixed as Kotlin-idiom work |
| prose and worked-example drift | ~15 | **survive** — plus the new book edits from §5 and §8 |
| tests, build config, nits | ~12 | **survive**, unchanged |

Roughly a third of the review dissolves because the defect becomes unrepresentable. The rest is real work
that this restructure does not touch, and must still be done.

---

## 11. Addendum (2026-07-26) — evidence update, and the subset landed ahead of the decision

> **Historical record.** This section states the ADR's position as it stood on 2026-07-26 *before*
> `docs/DECISIONS.md` was ratified later the same day. It is kept verbatim because its evidence is still
> the evidence; where it calls a question open, a bracketed note names the D-number that has since closed
> it. The Status line at the top of this file is the current one.

Status was, at the time of writing, unchanged: **proposed** *(since ratified — D1; see the Status line
above)*. This addendum records what a second adversarial review added to the evidence base, and which of
this ADR's own recommendations were landed at the check layer without waiting for the module-DAG
decision. Landing them is not that decision; the thesis (§5.1) stands or falls on its own.

**New evidence for the premise, all verified against the tree as it stood:**

1. **`Signature.copy()`** — the data-class stamp shipped a synthesized second production site that the
   detekt `<init>` rule structurally could not see. Exactly §7's prediction, live in shipped code.
2. **The Command-mint asymmetry** — the gate policed `ToolResult` production and nothing policed
   `Command` production, so a fold arm could stash a forged, replay-consistent Command into its own
   slice while the bus stayed clean.
3. **A check rotted silently under it** — C7's variant derivation read `interfaces()` while the
   transport had migrated to sealed classes: the live-tree variant list had been **empty** since that
   migration, the check vacuous, and its own interface-style fixtures kept its block-test green. This is
   the strongest single datum this file has for its own thesis: a checked, fixture-paired, review-passed
   rule still drifted to nothing, because a rule is a photo of the shapes its author anticipated.
4. **The C2 name-prefix classification** — Kotlin block isolation rests on `symbol.startsWith(BlockName)`
   over a shared package, convention-strength enforcement of the architecture's flagship claim.
5. **No directive posture existed** in either port: one comment silenced the gate, as §1 stated.

**Landed at the check layer (2026-07-26), the "cheap 20%" that stands regardless of this ADR's fate:**

- `linterOptions.noInlineConfig` in the TS gate and detekt `ForbiddenSuppress` over the gate's rules in
  the Kotlin one, each with a block-test watching a suppression fail to work.
- `Signature` is a **non-data class** in the Kotlin port (spelled-out value equality, no `copy()`), with
  a GateTest pinning the missing modifier. The `internal constructor` half of §7 still requires the
  module split and remains open as execution *(the split itself is ratified — **D1** as amended by
  **D9**, landing at P4)*.
- `Signature` in the TypeScript port is a **nominal class carrying a private `#` brand**, minted at one
  site, with C4 extended to deny every static ESM value binding of it outside `spine/boundary` — the
  local analogue of §7's `internal constructor`, since TypeScript has no module-internal visibility.
  MEASURED before the change: both `{ by: "Human", authority: sig.authority }` and
  `{ ...sig, by: "Human" }` compiled clean inside a block fold arm at `tsc` exit 0. The `unique symbol`
  brand this port already uses for `Authority` denies only the first — an object spread propagates the
  brand property from its source — which is why the shape is a class.
  **This is the first seam this ADR records as only PARTLY compile-enforceable, and the title's word
  "compile-enforced" does not hold for it.** Measured against the shape-plus-lint version: eight
  assertion-free vectors — `Object.assign`'s `T & U`, `structuredClone`'s `T -> T`, a user-written
  `<T>(base: T, over: Partial<T>) => T`, a structural widening write, `Reflect.set`, and
  `new (sig.constructor as …)()` — compiled AND linted clean inside a real fold arm with the whole gate
  green, and one of them relabelled the boundary's own stamp in place so the committed record carried an
  actor the gate never saw. The launder lives in the generic signature, not in the brand, so no brand
  spelling reaches it. What closes it is a RUNTIME pair: `Object.freeze` in the constructor, and an
  identity check at the single `verb.sign` call site, where a Command carrying anything but the stamp
  its own step minted becomes a signed refusal. Three layers, and the claim is bounded to them:
  *the stamp cannot be spelled, the constructor cannot be bound outside the boundary, and a forged stamp
  cannot ride a Command* — never "unforgeable". Named residue: `Reflect.set` on the frozen stamp returns
  `false` instead of throwing (pinned by a test); a cast still produces a value the type system accepts,
  though it can no longer ride a Command; and a fold arm may still write a literal actor string into its
  own slice, which is not a stamp forge at all. Enforcement: `test/gate/forge.test.ts` runs the real
  compiler over three spelling vectors, the C4 fixture pairs cover the binding vectors per file, and
  `test/spine/stamp-residue.test.ts` is the runtime pair's declared layer — every one of them proven red
  against the pre-repair tree.
- C7 extended to **Command construction** with the variant derivation fixed to read classes and
  interfaces, and the fixture pair re-cut in the live sealed-class idiom. The named residue — `copy()`
  on a *received* data-class Command variant — remains open and is §6.6's problem to close structurally.
- The durable dedupe key now rides the **committed staged fixture**, so exactly-once survives a restart
  (a correctness fix independent of enforcement, recorded here because finding 2 above is what surfaced
  the surrounding seam).

**What this addendum does not do:** decide §3's module DAG, §6.6's witness token, or §5.1's inversion of
book §15. Those were the open decision of this ADR when it was written. *(Since closed, the same day, by
`docs/DECISIONS.md`: the module DAG by **D1** as amended by **D9**, and §15's inversion by **D3**. **D16**
closes only the witness token's **requirement** — an irreversible effect must be unconstructible without
a gate-minted, payload-bound token — and does not choose between §6.6's two candidate mechanisms. That
choice stays open, and is still an open decision of this ADR, now alongside §4's block-surface
visibility mechanism — accept the measured public surface, or shrink it by friend association.)* The book meanwhile carries an explicit enforcement layer in each law's own row (§15.3's fourth
column), which is §5.1's "each invariant carries its enforcement layer" recommendation executed at the
prose layer — the honest interim state whichever way the decision goes.
