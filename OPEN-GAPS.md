# Open gaps

Architectural questions raised by review that are **not** covered by the F1–F13 remediation pass.
Each is a real decision with a recommended direction, not a bug report. Numbered `A*` so they never
collide with the `F*` finding IDs.

Status legend: `open` · `decided` · `done`

---

## A1 · §6.8 unsigns UI tools, and that guts the differentiator — `done`

**Landed in full (book + both ports).** §6.8's axis is decision-vs-ephemeral; a presentation verb
folds *and signs* through the same site set as a domain verb in both ports (the GateTest asserts
the registration shapes are identical); ephemeral view-state stays in one file per block, visible only
to its own projection (check C12). The record below is the original case, kept for its reasoning.

**Severity: major.** Folded into the remediation pass rather than deferred: it is an *architectural*
change (it grows the sealed `Command` hierarchy, puts both tool kinds through the `name → Command`
map, and changes the blast-radius number), so applying it after the ports were built would have meant
rebuilding them. Caught while the run was still one agent in, before anything was written.

§6.8's table says a UI tool "folds, does not sign." That carve-out contradicts the architecture's own
core move and removes the property that makes agent-driven UI worth having: an agent that can
show/hide, reposition, and restructure the interface, *auditably and replayably*.

It contradicts three claims made elsewhere:

| Claim | Where | How §6.8 breaks it |
|---|---|---|
| "a person tapping a control and the agent calling a tool resolve to the identical `Command`" | §3.2 | not identical if one signs and one does not |
| "the authoring discipline is identical … Both fold identically" | §4.4 | not identical if one mints a Command and one does not |
| the discriminator is "does a human need to ask *who did this, and when?*" | §5.4 | for agent-driven layout the answer is plainly **yes** |

It is also self-defeating on its own terms. §6.8 buys a cheaper UI tool (1 declared site vs 3) at the
cost of two tool mechanics instead of one — which is *worse* for lego composition and for a uniform
blast-radius story, not better.

**The line is already in the book; §6.8 drew it on the wrong axis.** §4.6 gives the right test:
*"If losing a field on a re-fold would change what the system believes or what the artifact contains,
it is truth — fold it."*

**Recommended resolution** — replace the UI-vs-domain axis with the decision-vs-ephemeral axis:

- **Agent presentation decisions** (show/hide, reposition, focus, surface a draft for review) are
  authored acts. They **fold and sign**, exactly like domain tools. Attributable, replayable,
  reconstructable.
- **Ephemeral local view-state** (hover, scroll offset, expanded panel, unsubmitted text) never enters
  a tool, never folds, never signs. Already §4.6's rule; leave it untouched.

Consequences to carry through: §3.2 and §4.4 become true as written; blast radius becomes **uniform**
across both tool kinds; Fig 3.1's fan-out to view toggles stops needing its apologetic caption; and
"why did the panel move?" becomes answerable from the timeline.

The volume objection behind §6.8 is real but misapplied — §5.4's concern was byte-heavy, high-rate
input (blobs, sensor streams), not deliberate low-frequency layout decisions. A repositioning is
precisely the "discrete, auditable, low-frequency action" §5.4 says belongs on the bus.

**Touches:** §6.8 (the table and the ADDING A TOOL callout), §3.2, §4.4, Fig 3.1's caption, §5.4's
worked discriminator, §16.1's per-feature economics card, and the `name → Command` map in both ports.

---

## A2 · The guarantee is auditability, not reliability — say so — `done`

**Landed.** The book now states plainly, in §14.1.1 ("What replay does and does not buy"), what replay does and does not buy —
determinism over a *recorded* timeline (forensics, audit, traces-as-fixtures), never behavioural
reproducibility — and the payoff grid carries the matching line. The record below is the original case.

**Severity: moderate — framing, but it sets reader expectations that the architecture cannot meet.**

What is actually delivered is *replay-determinism over a recorded timeline*. The book is honest about
this in the caveats (§12.3: reproducible from the recorded stream, not the raw firehose; §14.5: no test
layer validates model behaviour). But the cumulative impression a reader takes away is "my agent system
is deterministic," which is not on offer — the **recording** is faithful; the **behaviour** is not
reproducible.

That is still a strong pitch: audit trails, incident forensics, production traces as permanent
regression fixtures. It is a *forensics* guarantee, not a *control* guarantee, and the two get
conflated constantly in this space.

**Recommended:** one short subsection near §14.1 stating plainly what replay does and does not buy,
and a matching line in §16.1 so the payoff grid does not imply behavioural determinism.

---

## A3 · Everything upstream of the model is unspecified — `decided`

F4 adds the missing context seam (`projectContext`), which closes the mechanical hole. The broader
point is not closed by that fix: the architecture specifies everything **downstream** of the model in
exhaustive detail and almost nothing **upstream**, and in practice context construction is the part
that determines whether an agent works at all.

**Recommended:** after F4 lands, decide explicitly whether context engineering is *in scope* (then it
needs the same treatment as the view projection: a type, a bound, invariants, a test layer) or *out of
scope* (then say so in §16.2's non-goals, so the silence reads as a boundary rather than an oversight).
G9's own rationale currently leans on "a context summary" the book never defines — F4 fixes that
sentence, but not the scope question behind it.

**Decided: the context *seam* is in scope, context *engineering* is not.** The two are separated on
the same axis the book already uses for authorization, persistence and configuration — the
architecture owns the invariant, the product owns the strategy.

- **In scope, specified and enforced.** `projectContext(state, staged) → Context` is the third pure
  projection, a function of committed State plus this step's *ordered* staged input. It carries a
  stated growth bound (O(1) in timeline length; `MAX_CONTEXT_LINES_PER_BLOCK = 8`,
  `MAX_CONTEXT_NOTICES = 8`, tested against 500 tickets and 200 notices), `render(context)` is the
  exact text the model saw, and that text plus the active prompt version ride the committed
  `StepRecord` as `ContextFixture` — so a re-fold re-derives the digest and a change that silently
  alters what the model read fails the golden trace **without re-running the model**.
- **Out of scope, and product-owned** — recorded in §16.2's non-goals *and* as a row in §17.1's
  product-owned-seam list, beside authorization (§14.3), persistence and retention (§14.6), and
  configuration/secrets (§14.4): **what** you choose to project, how you rank, retrieve, compact or
  summarise it, and how you author the prompt.

The obligation the architecture keeps is the invariant, not the strategy: **whatever you project is
a pure function of committed State plus staged input, and if you compact, the summary is a captured
fixture** — because "why did the agent decide this?" is unanswerable without the text the model
actually read (§14.7's reasoning, generalized).

**What this does not buy, stated so the silence stays a boundary:** no ranking policy, no retrieval
or compaction strategy, and no test layer for prompt quality. Choosing badly here still produces an
agent that does not work; the architecture only guarantees you can see exactly what it was given.
One correction fell out of the seam and every app pays it, rung or no rung: `staged` is an **ordered
list** of `StagedInput`, not a single value — §5.4 always specified plural off-bus inputs "in their
staging order, keyed to the consuming step", and both ports were narrower than the book until now.

---

## A4 · Pattern marketed as a dependency — `reframed · the package itself stays open`

**Severity: moderate — adoption-facing, not correctness-facing.**

§1.3 and §8.1 promise "you build two kinds of tools; the spine you inherit — zero runtime source in
your repository." No spine package exists, and both reference ports hand-write the entire right column
of Fig 8.1. §8.4 concedes this honestly, but the concession swallows the headline: an architecture
*pattern* and a *dependency you install* have very different adoption costs.

The value does not depend on the library existing. "Here is a pattern, here is a reference
implementation, here are the gates that keep it honest" is true and strong today.

**Recommended:** pick one and commit — either (a) reframe §1.3/§8.1 so the spine is described as a
pattern with a reference implementation, with the library named as future work, or (b) extract the
spine from `examples/` into an actual published package and make the claim true. Do not leave the
headline claiming (b) while the repo demonstrates (a).

**Taken: (a), and sharpened by something that was not true when this gap was written.** The spine is
no longer prose scattered through a flat port — it is a **tier**: 37 files in TypeScript, 38 in Kotlin
(the same components, spelled per language; each port pins its exact roster with a test), holding the
signed bus, the fold driver, state derivation, replay, the barge-in mailbox, the tier relay and the
enforcement gate. It can be lifted out whole and vendored.
The claim is therefore restated everywhere it appeared, in these terms: **you depend on the loop, you
vendor the spine.** The runtime is a real dependency with no source here that exactly one file names;
the spine is source you hold but do not author per feature — every feature lands in `blocks/<X>/`
plus the root, and each component stays swappable behind its own contract (§8.5). *"Zero of their
source lives in your repository"* is retired; the honest headline is **two kinds of tool + thin
wiring + a loop you depend on + a spine you vendor once and never author per feature.**

**A gate check makes the tier's independence a property of the build, not a promise.** `C15` denies
any import from `spine/**` into `blocks/**` or `app/**`, in both ports, with the paired
violating/compliant fixtures every other check ships and no separate command to run. It is not
redundant with `C1`: `C1` is a per-folder allow-list that a future folder could quietly relax, `C15`
is a tier-level denial. In Kotlin it catches what `C1` structurally cannot — the sealed-hierarchy
package rule forces every block's transport declaration into `adr.contract`, which `C1` must permit
from spine folders, so `C15` additionally denies any `adr.contract.*` symbol outside the three roots
the spine itself owns.

**Still open, and deliberately: (b).** No spine package is published on any registry, and this pass
does not publish one. That is the repository owner's decision — coordinates, release cadence,
versioning and the support surface a published artifact commits you to are not a remediation task —
so no package name, registry coordinate, install command or version number appears anywhere in the
repo, and the prose says publishing is future work rather than implying it already happened. This
gap closes when that decision is made, either way.

---

## A5 · The advanced rungs are the least-exercised material — `both rungs built; the residue labelled`

Defects clustered in tiering (§11), barge-in (§12), and blocks (§4.5–4.7) — and neither reference
implementation exercises any of them. That correlation is not a coincidence: unexercised specification
drifts.

**Recommended:** apply the book's own §16.4 discipline to itself. Either exercise a rung in the
reference implementation (a second tier behind a relay; a real mailbox with a preemption test), or mark
it explicitly as *specified but unproven* so a reader knows which parts have been run and which have
only been written. The honesty costs nothing and the current silence implies parity that does not exist.

**Both halves were taken: the two rungs were built in both ports, and what is still unbuilt is now
labelled rather than silent.** Blocks (§4.5–4.7) were already answered by six shipped blocks.

**The barge-in mailbox (§12), and it fixes F11.** The book's 12.3 drain loop cannot preempt —
`outcome = await(inFlight)` sits at loop-body indentation, so control never reaches `take()` during a
turn, `turnInFlight` is false at every take, and all three guards below it are dead code. What ships
is a **select over `{ the next message, the running turn's completion }`** — Kotlin's `select`,
TypeScript's `Promise.race` — so a message is observable *while* a turn runs. On that: `Input` takes a
**closed policy choice, not a boolean** (`Perishable` conflates to the newest and folds a *counted*
drop; `DurableQueue` never conflates, dedupes on a source key, and acks only after the commit — and
it is the **default**, because losing durable work silently is worse than repeating perishable work
visibly); `Interrupt` **preempts**, cancelling and *joining* the running turn before the next fold
starts, so two folds cannot interleave; `Drain` **defers**. Preemption is proven against a virtual
clock, not asserted: the interrupt's turn starts at t=150 (Kotlin, against a *measured* control run
of 10 000) and t=100 (TypeScript, against 10 000), and the TypeScript suite carries the book's own
12.3 loop inline as a contrast test that does not see the interrupt until t=10 100. Also proven:
cancellation lands on a **step boundary** — a preempted turn's already-committed step stays folded and
its effect stays performed, with no rollback — and a turn that throws degrades to a typed status
carrying its cause without killing the consumer (§12.4). Every barge-in decision travels the one
existing path (`resolveAction → gate → fold → commit → signed Command`), so a conflated drop is
observable, and the conflation count is folded *before* the winning turn, which means the model is
told it is shedding load.

**The tiered relay (§11).** A deep tier publishes conclusions to an **append-only** relay; the fast
tier reaches them only through a recall tool returning **text** — no method handle, no shared mutable
object, no synchronous request. The port promises neither speed nor return, so the party that must not
block does the bounding: recall reads under a deadline and degrades to a **typed** `LastKnown`, which
is a distinct variant from `Fresh` and from `Empty` ("the deep tier has not published yet"), with
`never`-guarded consumers so a fourth variant cannot slip past — a relay that never answers costs the
fast path exactly the deadline, and stale is never rendered as fresh. The recall result is off-bus
input, so it is **captured at both sites that matter** — the record's ordered `staged` fixture, which
reaches the committed digest, and the committed `ToolResult`, which is what the fold reads — and read
once per turn, so a re-fold resolves the same snapshot *and the same branch* and can never re-query.
Recalled content is untrusted (§10.2, §11.3) by construction: `Recalled` carries no `Authority` and
has no field that could, so an injected relay entry demanding an irreversible confirmation is refused
at the gate, which keys on authority a recall cannot supply. The second tier is optional and plugs in
without editing the fast tier or an existing block — two buses, two clocks, neither holding a handle
to the other.

**Still labelled *specified but unproven*, in both ports' READMEs, because §16.4 licenses stopping
early but not implying parity:** the rungs of schema evolution (§14.7) that did NOT ship — `StepRecord`
now carries a required `schemaVersion` and one worked v1 -> v2 upcaster, but no upcaster CHAIN, no
versioned wire encoding (§14.1 leaves it product-owned) and no per-reducer-version golden trace. The
one easiest to mistake for an omission, so it is recorded as a deliberate bound rather than a gap:
**the envelope is enforced by the COMPILER and never read at run time, because the reference ships no
loader** — there is no `JSON.parse`, `readFile` or `deserialize` anywhere in either port's `src`, so a
runtime version check would exist only to be called by its own test. A version-dispatched load path,
if an adopter wants one, is theirs to build where their encoding lives. Also: dispatcher confinement
of a turn's `submit` channel, which is structural in the
reference (the consumer mints the channel and calls the boundary itself) but is not gate-checkable,
so an adopter running turns on another thread could still interleave two folds; and the honest cost
of the cancel bound — it bounds the **consumer**, not the turn. A turn that ignores cancellation is
abandoned at the deadline, its `submit` channel revoked so it can no longer fold, and the blown
deadline folded as a signed command. It is named, degraded and counted, never hidden — removing the
leak entirely needs an unbounded join, which §12.3 itself calls exactly a hang.

---

## A6 · TypeScript block dispatch trusts a predicate it cannot verify — `crash fixed · hardening open`

**Found during independent verification of the A3–A5 pass, not by review.** Reproduced, fixed, and
regression-tested; one half remains.

`foldOk` dispatches by asking each block `owns(r)`. Those are hand-written type predicates
(`isTriageResult` returns `r.outcome === "ok" && r.tool === "setPriority"`), and **TypeScript trusts a
predicate it cannot verify** — so after the chain, `r` narrows to `never` at compile time while a real
value flows through at runtime. `const _never: never = r; return _never;` then returned `undefined`,
and the caller died on `out.effects is not iterable`.

Measured before the fix: all four declared appends written, `tsc --noEmit` exit 0, `eslint` exit 0,
101/101 tests green — then a crash on first dispatch. Kotlin has no such hole; `when (r) { is
TriageResult -> }` is a compiler-verified type check, not a trusted predicate.

**Fixed (the floor).** `unclaimedArm` in `spine/pure/spine-slice.ts`: an unclaimed result now folds
like any unknown tool name — no transition, one `Diag` effect, one `Rejected` notice naming the tool.
Total *and* observable, which is what §6.5 demanded all along; the previous behaviour was a crash out
of the one arm §6.5 says must never crash. Regression test in `test/app/totality.test.ts`, red-green
proven (reverting the fix reproduces the original `TypeError` exactly).

Note the gate caught the first attempt at this fix: constructing the marker inside the fold tripped
`[C7] a ToolResult may only be produced by a verb body or by the boundary`. That was correct — the
fold does not mint transport — so the arm moved into the spine. The enforcement worked on its author.

**Still open (the hardening).** `owns` should be *derived* from each block's verb table rather than
hand-written, so it cannot go stale at all: `VerbSpec.name` is typed `R["tool"]`, so the table is
already bound to the result variant at compile time, which would make adding a verb and updating the
predicate the same edit. Attempted and reverted — the six blocks have different verb-function
signatures.

- ~~**`isAnalysisResult` is narrower than the analysis verb table.**~~ **Resolved by relocation:**
  `noteDrop`/`noteFault` now live in the inbox block's own contract, claimed by the inbox's `owns`,
  so no block's predicate under-claims its own verbs. The general derive-`owns` hardening above is
  what remains genuinely open — the class of bug is still writable, this instance is not.

## A7 · Signed transport can be copied, not only constructed — `open · named on both ports`

**The rule both ports ship is a CONSTRUCTION rule, and copying is not construction.** Kotlin's C7
has always named its half of this (`cmd.copy(…)` on a received command, `Rules.kt`); the TypeScript
half is the object spread, `{ ...received }`, which carries the `outcome` key without writing it and
so passes a selector keyed on the property. Measured on the live tree: the spread produces no
message. The TypeScript comment previously claimed the opposite — that `outcome` being a required
member meant no literal could be spelled without the key — which is true of a literal and false of a
spread; that sentence is corrected, and this row is where the residue now lives.

**Why it is not closed by widening the rule.** Denying `SpreadElement` inside an `ObjectExpression`
in the pure buckets would redden legitimate code — `slice.ts:withPriority` spreads its own slice —
and a rule that fires on idiomatic code is the nuisance §15.2 warns about, which authors turn off.
The honest options are a type-level brand on the transport (the move D2 used for `Signature`) or a
runtime identity check at the boundary; both are real work, neither is a comment.

**What is NOT at risk, and why this is `open` rather than a blocker.** The stamp cannot be forged
this way in either port: `Signature` is a class in TypeScript and a non-data class in Kotlin, so a
copied Command or ToolResult carries its ORIGINAL signature, and the boundary's authority check
still keys on that. What a copy buys is a transport whose payload was edited after signing — which
replay detects, because the re-fold of the committed bytes disagrees with what was performed.

**Direction.** Brand the transport types the way `Signature` is branded, so a copy is not
assignable; then narrow C7's claim to construction, which is what it actually enforces.

---

## A8 · ADR-001's API freeze is specified but not wired — `open`

**What the ADR says is landed, and is not.** ADR-001 §4's plugin table has `adr.kotlin.library` —
applied by every module — wiring `explicitApi()` and the binary-compatibility-validator, with `.api`
dumps checked by `apiCheck` in CI, and §4 goes on to state that "a public declaration beyond the
frozen set fails `apiCheck`". The module DAG landed; this half did not. Measured: no `.api` dump
exists in the tree, and `explicitApi()` appears in no convention plugin, so nothing fails when a
module publishes a new public declaration.

**Why it matters and why it is not a blocker.** The measured floor (4·4·5·6·7·6) and the frozen set
(6·5·5·8·9·8) are already written into ADR-001, so the item is fully specified — what is missing is
the wiring, not the decision. Nothing about the DAG's *dependency* walls depends on it: those are
enforced at configuration time and are separately red-green proven. What is unprotected is
accidental API GROWTH inside a module that already exists.

**Direction.** Wire `explicitApi()` and the validator into `adr.kotlin.library`, dump the current
`.api` files, and check that the dumped counts match the frozen set the ADR already names. Until
then the ADR's §4 rows read as landed when they are specified — the honesty half of this entry.

---

## A9 · The TypeScript gate's verdict was load-dependent — `done`

Recorded because the class matters more than the instance. Six gate cases shell out to `tsc`, `npm`
or the demo runner, and they ran under vitest's DEFAULT 5000 ms per-test timeout, so on a contended
machine the gate went RED on byte-identical, pristine source with an error naming nothing about the
code. `scripts/wall.mjs` opens with "a gate whose verdict depends on whether it was previously
exercised is not a gate"; the same objection applies to a verdict that depends on host load, and a
gate that fails at random is the fastest route to the re-run culture §15.2 is written against.

Closed by an explicit 60s `testTimeout`/`hookTimeout`. The general rule this leaves behind: **any
gate case that spawns a subprocess owns its own timeout**, because the default was chosen for unit
tests and a compile is not one.

---

## A10 · Neither demo draws the purity boundary the way the architecture specifies — `open`

**Direction of this entry, stated because it is the whole point.** The book is the
platform-generic specification; `examples/typescript` and `examples/kotlin` are demos showing how
it could be done on two stacks. A divergence between them is therefore a finding against the DEMO,
never an overclaim by the book, and it is closed by fixing a demo or by recording its gap here —
never by narrowing an architectural law to one platform.

**What the architecture specifies.** §4.6: a block is one folder holding TWO build units, and "the
pair is unconditional — a block with no seam to the outside declares the leaf and leaves it empty".
§7.8: "the purity boundary is drawn inside each block by the unit split, **not by a rule reading
file names**", because the block's own unit permits the spine and nothing else, so there is no I/O
for its pure tier to reach. §4.7 and §15.3's G10/G11 notes say the same. That is a coherent law and
it is what makes package-by-feature safe: the boundary is held by the build, and the folder names
are a legend for it rather than the thing itself.

**Where each demo falls short, measured.**
- The **TypeScript** demo ships ONE workspace package per block, so `adapter.ts` sits in the same
  build unit as `fold.ts`. Its `exports` map and `tsconfig` references cannot separate them, and
  the purity line is held instead by an eslint per-file rule keyed on the FILENAME — precisely the
  mechanism §7.8 says the architecture does not use. The pair is not unconditional here; it does
  not exist.
- The **Kotlin** demo does ship the pair, and its convention plugin bans I/O libraries from the
  pure module's classpath at configuration time — the specified mechanism, genuinely held. But its
  file-level rules (C8's import ban, C1's allow-list) still key on file names inside the module, so
  even here the unit split is not carrying the whole boundary on its own.

**Why this is `open` and not a blocker.** Both demos DO keep I/O out of a block's pure tier — the
guarantee holds in each, by different means. What neither fully demonstrates is the architecture's
stated MECHANISM for it. A reader who takes the book's law and looks to a demo for the shape will
find it in Kotlin and will not find it in TypeScript.

**Direction.** Split each TypeScript block into two workspace packages (`@adr/block-x` and
`@adr/block-x-adapter`), so the pure package's dependency list can omit every client library and
the boundary is held by resolution rather than by a filename rule. That is the change that makes
the TypeScript demo demonstrate the law it is shipped to demonstrate. Until then this row is what
an honest reader is owed.

---

## Not in this file

F1–F13 (the verified review findings) are handled by the remediation pass and tracked there. This file
is only for gaps that pass did **not** address.
