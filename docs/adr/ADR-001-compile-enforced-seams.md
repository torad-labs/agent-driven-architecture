# ADR-001 — Compile-enforced seams: the reference implementation becomes a module DAG

Status: **proposed** · Supersedes the single-module `examples/kotlin` layout · Requires a change to the book (§4.7, §7.5/7.8, §15)

This is the execution blueprint for restructuring this repository's reference implementations so the
architecture's laws are **walls that do not compile**, not lint rules a comment switches off. It defines
the module DAG, the convention plugins that enforce every edge, the file structure, what moves to
compile-time versus what stays a residual check, and the execution order.

Reference: `grailseeker-xr` ADR-009 and its fold-stays-central addendum, which already execute this shape
against the same book. Builders execute against this doc; they do not invent structure.

---

## 1. Why this exists — the diagnosis

An adversarial review of PR #1 produced 52 verified findings. Read individually they are 52 bugs. Read
together they are **one** finding, and it is a layering error:

> The architecture's only structural safety property (the irreversible-action gate) had **five
> independent routes around it**, and the fifteen checks meant to catch that class were **switchable off
> by a one-line comment** (`/* eslint-disable */` in TypeScript, `@Suppress` in Kotlin).

The governing law is brain concept **#924 — "You make drift not compile"**, the enforcement law for
agent-driven codebases:

> CLAUDE.md, write-time hooks, and code review are probabilistic filters over an **unbounded output
> space**. An agent will, with certainty over time, emit a structure none of them anticipated — a new
> pattern, a new failure mode, a rule routed around. They REDUCE drift; they cannot STOP it, **because
> you cannot enumerate what a generator will invent.** The only enforcement that scales with an unbounded
> generator is one that makes the violation **IMPOSSIBLE TO EXPRESS** — a compile-time structural
> boundary. You don't review your way out of drift. You make drift not compile.

PR #1 put lint on the front line. Every finding below is that mistake, seen from a different angle.

### 1.0 The corollary, and why this review nearly missed the point

#924's corollary is the **parameterization trap**:

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

#924 is the enforcement law for **any codebase written by an LLM**. Its trigger condition is stated in
its own framing — *"because the code is written by agents/LLMs"* — not the domain it was discovered in
and not the size of the codebase. RealTour and grailseeker are where it was found; they are not its
boundary.

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
   pays for itself. The book therefore identifies #924's exact trigger condition, and then answers it in
   §15 with four dozen bypassable checks.

That is the sharpest statement of the defect: **a book about agent-driven architecture teaches the
probabilistic-filter layer to precisely the audience that can least afford it.** Every reader who adopts
§15 as written inherits enforcement that a comment disables, in a codebase written by a generator that
will eventually emit the shape no rule anticipated.

Fixing the reference implementation is therefore necessary but not sufficient. §15 must be inverted (§5.1)
because the book's readers, not just this repository, are the ones the law protects.

### 1.1 The second, deeper defect: the core is unsubstitutable

The book's testing pitch is port substitution (§7.2 "a fake-in-test and the real-in-production runtime
swap behind one interface"; §7.3 the composition root binds ports to adapters). The shipped core is then
expressed as **top-level functions** — `fold(state, results, now)`, `project(state)`, `wireApp(env)` —
and `object` singletons, none of which can be bound, faked, or swapped at that root.

Measured on the reference project doing this correctly: `grailseeker-xr:core` has **78
classes/interfaces/objects against 11 top-level `fun`s, and 10 of those 11 are `fun interface`
declarations**. Every seam this repository made a loose function, that one made a SAM interface:
`public fun interface Projection`, `Clock`, `IdSource`, `Sink`, `ActionDispatcher`, `ToolRun<I, O>`.

`fun interface` costs nothing at the call site (SAM conversion keeps `Projection { state -> ... }`) and
buys full substitutability. **Top-level functions are a TypeScript idiom.** They are not testable in the
sense this architecture means by testable: not injectable, not fakeable, not bindable.

### 1.2 The book is wrong, not only the code

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
sites inside one folder and zero sites outside" is false under this answer, and must be deleted.** Some
of the sites are in the shared core.

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
naming its speakers is not coupling in the harmful sense. The reference project accepts exactly this —
its root state is the union of its blocks' slices.

Better: if each feature's slice is its own type in the core, then a projection typed to one slice
**cannot read another one at all**. That lifts "a feature writes only its own slice" from a residual
check to a compile-time wall. Naming the features makes the wall stronger, not weaker.

**Correction required in this document:** §1.0 and §10 currently credit the module graph with
*dissolving* the review finding that a spine type named a block. It does not dissolve it; it makes it
deliberate. Both passages are wrong and are corrected.

### Q3. What is a feature's one public symbol?

**Answer: a type the root constructs** — `public class TriageBlock : Block<TriageSlice, TriageResult,
TriageView>`, implementing an `interface Block` declared in the core.

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

- **Three rings, dependencies point inward, only the boundary is impure.** Unchanged from the book.
- **A block is a vertical slice whose only public symbol is a TYPE the root constructs** —
  `class TriageBlock : Block<TriageSlice, TriageResult, TriageView>`. It contributes a **tool** and a
  **projection**. It owns **privately** its ports, its decision logic, and its view model.
- **Blocks couple only through the one folded `State` and the one bus — never by import.**
- **The kernel stays whole.** `Command`, `ToolResult`, `Effect`, `State`, the fold, the boundary and the
  bus live in `:spine` and nowhere else. They are the shared language every block speaks; they are not
  any one block's private property.
- **Every seam is a `fun interface` or an `interface`, never a top-level function**, so it can be bound
  at the root and faked in a test.

---

## 3. Module DAG (the dependency law — compile-enforced)

```
build-logic/                        convention plugins (adr.*) — an included build; ENFORCES every edge

:spine        → (nothing)           THE KERNEL: sealed Command/ToolResult/Effect/State,
                                    the exhaustive fold, the boundary, the bus, replay, ports
:block:<x>    → :spine              a vertical slice: its tool(s), its decision logic,
                                    its port interfaces, its projection.  PURE JVM.
:app          → :spine, :block:*    THE ROOT: register()s every block, binds every adapter,
                                    constructs the boundary, builds the agent, runs the demo
```

Blocks: `triage · escalation · console · artifact · analysis · inbox` (the six the current code already
has).

**Forbidden edges, rejected at configuration time by the convention plugin:**

- `:block:*` may depend on **`:spine` only**. Not a sibling block. Not `:app`. Not an adapter library.
- `:app` is the **only** module permitted to name a concrete adapter or an IO dependency.
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
| `adr.spine` | `:spine` only | asserts it is the only module declaring the boundary, bus or fold |
| `adr.block` | `:block:*` | auto-adds `implementation(project(":spine"))`; **rejects every other project dependency**; forbids IO libraries on the classpath |
| `adr.root` | `:app` only | the only plugin permitting adapters and IO dependencies |

Rejection mechanism, verbatim in shape from grailseeker:

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

**API freeze.** `apiDump`/`apiCheck` commits a `<module>.api` per block whose entire content is one
symbol: the block's type, `class TriageBlock`. A second public declaration fails `apiCheck` in CI. `internal` on
everything else makes that automatic. This replaces the current situation, where the review measured
**14 to 20 public declarations per block and zero uses of `internal` repository-wide.**

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

// each :block:<x> exposes exactly one public symbol — a TYPE the root CONSTRUCTS:
public class TriageBlock : Block<TriageSlice, TriageResult, TriageView>
```

**Not `public fun register(spine: Spine)`, and not `public val Triage: Block`.** An earlier draft of
this ADR wrote the first while §1.3 Q3 simultaneously named it as contradicting the ADR's own first
decision — the contradiction sat here unfixed until two independent audits reported it. Q3's own
answer, a top-level `val`, does not survive either: Q3 wanted a value because a value "can be
substituted in a test", and a top-level `val` is a global that every consumer hard-names, which is the
property being cured rather than the cure. A class satisfies Q3's *reason*. The root constructs it,
and a test constructs a different one.

and owns privately: its decision logic, its port interfaces, its projection, its view model.

**Book change required:** §4.7's "contributes to shared: `Command` case(s) the feature adds" and "the
state slice + its fold arm(s)" become "contributes a tool and a projection; the shared language stays in
the spine." §7.5/§7.8's folder trees become module trees.

### 5.1 §15 is the largest book change, and it is a thesis inversion

§15 ("Executable architecture: enforce, don't review") asks **exactly** the question #924 answers:

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

1. `block ↛ sibling`, `block ↛ app`, only-`:app`-names-adapters — module DAG plus convention plugins (§3, §4).
2. **One baseplate** — boundary, bus and fold have `internal` constructors in `:spine`. A block cannot
   instantiate a second because it is not visible across the module boundary. *(currently a lint rule)*
3. **Tool purity** — the tool `Ctx` carries only `{state, context}`, and `:block:*` has no IO library on
   the classpath. A tool cannot read a clock or perform IO because neither is in scope. *(currently a lint rule)*
4. **Fold exhaustiveness** — sealed `ToolResult` plus `when` with no `else` is a Kotlin compile error.
   *(already correct; preserve it by keeping the kernel whole)*
5. **One public symbol per block** — `internal` everywhere plus the `.api` freeze. *(currently unenforced)*
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
- `tsconfig` project references so `:block` cannot see a sibling's source
- `linterOptions.noInlineConfig = true`, closing the `/* eslint-disable */` bypass the review reproduced
- the same witness-type pattern, which TypeScript expresses with a branded type and a private constructor

**State the asymmetry in the book.** The Kotlin port is the reference for structural enforcement; the
TypeScript port demonstrates the same architecture with a weaker wall. Claiming both ports enforce
identically is the kind of overclaim this whole review exists to remove.

---

## 9. Execution order

- **P1 — sequential, one builder.** `build-logic/` plugins plus `:spine` (kernel moved verbatim, seams
  converted from top-level functions to `fun interface`, `internal` constructors, the `Confirmed`
  witness). Gate: `:spine` compiles, its `.api` is dumped and reviewed.
- **P2 — sequential, one builder.** The reference block `:block:triage` end to end: `register()`,
  `internal` everything, `.api` frozen to one symbol. This is the template every other block copies.
- **P3 — parallel, one builder per block.** `escalation · console · artifact · analysis · inbox`. Each
  creates its module, moves its files, wires `register()`, applies `adr.block`. Blocks do not import each
  other so they do not contend; the only shared write is `:app`'s registration list, which the
  orchestrator applies serially.
- **P4 — sequential.** `:app`: the root, adapters, agent binding, demo. Delete what the restructure orphans.
- **P5.** Residual konsist invariants, `.api` baselines, the TypeScript workspace split, and the book
  edits (§4.7, §7.5/7.8, §15, plus the honest TS asymmetry).

Gate between every phase: `./gradlew build` green, and for P2 onward the `.api` diff reviewed.

---

## 10. What this does to the 52 open findings

| class | count | disposition |
|---|---|---|
| gate bypasses | 5 | dissolved by the `Confirmed` witness (§6.6) |
| `internal`/visibility/ABI | 3 | dissolved by `.api` freeze plus `internal` (§4) |
| cross-block coupling | 1 | dissolved by the module DAG (§3) |
| spine naming a block | 1 | **not dissolved** — per Q2 the core names every feature deliberately, and per-feature slice types make cross-feature reads fail to compile. The finding is answered, not removed. |
| enforcement bypasses (`eslint-disable`, `@Suppress`, missing task inputs) | 3 | mostly dissolved: the checks they defeat stop being load-bearing (§6) |
| Kotlin idiom and concurrency (`Consumer.kt` cluster) | ~12 | **survive** — real defects, fixed under the kotlin-best-practices skill in P1/P2 |
| prose and worked-example drift | ~15 | **survive** — plus the new book edits from §5 and §8 |
| tests, build config, nits | ~12 | **survive**, unchanged |

Roughly a third of the review dissolves because the defect becomes unrepresentable. The rest is real work
that this restructure does not touch, and must still be done.
