# Agent-Driven Architecture — TypeScript reference port

Runnable, offline, no API keys. The runtime binding is the Vercel AI SDK v6.

```
npm run typecheck   # tsc --noEmit over the whole tree, then the workspace wall
npm run lint        # eslint . — the denying gate checks
npm test            # typecheck + lint + vitest   ← the gate runs HERE, not separately
npm run demo        # a scripted model drives the real loop, end to end
```

A check you have to invoke separately is not a gate, so `npm test` runs all three. The gate's own
block-tests and allow-tests are vitest tests, so `npx vitest run` on its own exercises them too.

`npm install` once before anything else: the tree is an **npm workspace** of eight private packages, and
the wall below is nothing without the links `install` creates.

---

## The workspace wall — what is a resolution error, and what is still a lint message

Every block is a package (`@adr/block-<x>`), the spine is a package (`@adr/spine`), the composition root
is a package (`@adr/app`), and none of them is published. Each has a `tsconfig` with `composite: true`,
which roots the project at the package folder, and a `references` list naming the only project it may
see. `npm run typecheck:wall` builds that graph with `tsc -b --force`.

Measured against the standing workspace, one probe file per row, `tsc -b` exit code recorded:

| from inside `blocks/triage`, importing | exit | verdict |
| --- | --- | --- |
| `../escalation/fold` | 2 | **denied** — TS6059 + TS6307: outside this project's `rootDir`, and in a project it does not reference |
| `../../app/contract` | 2 | **denied** — TS6059 + TS6307, same mechanism |
| `@adr/block-escalation/fold` | 2 | **denied** — TS2307: the sibling's `exports` map publishes no such subpath |
| `@adr/block-escalation/adapter` | 2 | **denied** — TS2307, for the same reason: `./adapter` is NOT published either |
| `@adr/block-escalation` | 2 | **denied** — TS2307: a block package has no `.` export, only `./register` |
| `@adr/app` | 2 | **denied** — TS2307: the root publishes no exports at all |
| `../../spine/pure/ids` | 0 | resolves — a relative reach into a **referenced** project is redirected to its declarations; `references` is the permission list, and check C1 is what keeps the block on `@adr/spine/pure` |
| `@adr/spine/boundary/boundary` | 0 | resolves — an `exports` map cannot vary by consumer, so tier permission stays check C1's job |
| `@adr/block-escalation/register` | 0 | resolves — **the one cross-block route the wall cannot close** |

That last row is the honest limit and it is why the hand-rolled import checks are marked for sunset in
`v0.3.0` rather than deleted now. npm links every workspace package into the single root `node_modules`,
and neither an `exports` map nor a `tsconfig` reference can make a package's *published* entry visible to
one consumer and invisible to another. Check C2 is what denies it, and the release that deletes C2 owes
that route a replacement layer. The same measurement is why C1 survives: of its nineteen allow-list sites
the package boundary subsumes none — ten are intra-spine-tier and the spine is one package, eight are
intra-block per-file and npm cannot scope a dependency below package granularity.

A block publishes **exactly one** subpath, `./register`. The composition root still binds each block's
live client, and it does so by reaching `../blocks/<x>/adapter` **relatively** — legal because `app`
references every block, so the reach is redirected to that project's declarations rather than resolved
through its `exports` map. Publishing an `./adapter` subpath instead would have widened the row above
from one bare route to two.

A block's test lives **in the block folder**, which is what makes the block's internals visible to it and
to nothing outside: the package publishes only `./register`, so no bare specifier reaches `fold.ts` at
all. The co-located test is a resident rather than part of the shipped package — the package `tsconfig`
excludes `*.test.ts` — and it has its own gate bucket, so a test cannot become the route by which a block
folder reaches the composition root.

`npm run typecheck:wall` goes through `scripts/wall.mjs` rather than calling `tsc -b` directly, because
`tsc -b` is a BUILD: on the red path it cannot place a `rootDir`-violating file's output under `outDir`
and emits it beside the source instead. The script sweeps those droppings before and after the build, so
a failed run cannot change the verdict of the next one.

---

## The tree teaches the architecture

```
src/
├── spine/                  THE TRUNK — block-agnostic, written once, never forked (37 files, roster pinned by a gate test)
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

Every import rule above is machine-enforced (`npm run lint`, check C1), and the cross-package half of it
twice over: `npm run typecheck:wall` gets there first, as a resolution error rather than a lint message.

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

`docs/DECISIONS.md:122` asks for this as **three measured rows**, written after the workspace wall
and after the handler split, and *measured* rather than asserted. It is measured here, in this port's
README, because counts are port-facts: the book states the shape, each port states its own numbers,
and where the two ports disagree the disagreement is the result rather than an embarrassment.

**Two counting conventions, both stated, because collapsing them is how the old numbers went wrong.**
A **declared site** is a decision you author — a case, a table entry, an arm, a field, a config
entry. An **edit site** is every *code* line the change touches, imports included; a comment line
that merely names the block is not one, and a single declaration spanning several physical lines is
ONE edit site. Every excluded line below is named by number so you can add it back.

### Row 1 — a verb whose effects reuse effect kinds that already exist

**5 declared sites, 3 files, 1 folder — which here is also 1 npm workspace package.**

| # | Site | File | Named by |
|---|---|---|---|
| 1 | the `ToolResult` case | `blocks/<X>/contract.ts` | it *is* the thing you are adding |
| 2 | the `Command` case | `blocks/<X>/contract.ts` | it *is* the thing you are adding |
| 3 | the `owns` narrowing predicate's tool-name clause | `blocks/<X>/contract.ts` | **nothing — see below** |
| 4 | the `Verb` entry (name, description, schema, pure `run`, `sign`, reversibility) | `blocks/<X>/tools.ts` | gate check C13 |
| 5 | the fold-arm branch | `blocks/<X>/fold.ts` | `never`-guarded match |

**This row is measured by recount, not by a gate — and that asymmetry is stated rather than
implied.** The Kotlin port enforces its row 1 with a live-tree census in `adr.gate.GateTest`; this
port has no equivalent, so here is the command that reproduces the five sites, on the presentation
verb where a carve-out would have hidden if one still existed:

```
cd examples/typescript && grep -rnE 'setPanel|SetPanel' src/blocks/console
```

Read it against the table: `contract.ts:29` the `SetPanelResult` interface, `:36` its membership of
`ConsoleResult`, `:45` the `SetPanelCommand` interface, `:52` its membership of `ConsoleCommand`,
`:59` the `owns` clause; `tools.ts:31` the verb entry (plus its two import lines at `:12` and `:13`);
`fold.ts:24` the arm. Excluded and named: `contract.ts:8` is prose, and `console.test.ts` is the
block's co-located test rather than a declaration. **So a verb is 5 declared sites and 9 edit lines**
— sites 1 and 2 each cost TWO edits in this port, the interface and its membership in a union that
is written out by hand, which is precisely what Kotlin's sealed hierarchies do for you.

**Where this port differs from Kotlin, and it is the interesting half of the row.** Kotlin pays four
declared sites, not five — it has no hand-written `owns` — but two of its four are authored in the
`:spine` module, because Kotlin seals a hierarchy within one *module*. TypeScript pays a fifth site
and keeps all five inside the block's own folder **and** its own workspace package, because
`tsconfig` project references, not module sealing, are what closes this port. Neither port is
strictly cheaper; they pay in different currencies, and a single averaged number would hide both.

**Zero production sites outside `src/blocks/<X>/`**, and the fold arm is compiler-forced:

```
src/blocks/triage/fold.ts(51,13): error TS2322: Type '"resolveTicket"' is not assignable to type 'never'.
```

**KNOWN HOLE — site 3 has no guard.** Each block exports an `owns` type predicate (`isTriageResult`)
whose declared return type is `r is TriageResult` but whose body enumerates tool names by hand.
Measured: with sites 1, 2, 4 and 5 written and `owns` left stale, `tsc --noEmit` exits **0**, `eslint`
exits **0**, and the whole suite passes — then the verb fails at runtime the first time it is
dispatched:

```
TypeError: out.effects is not iterable (cannot read property undefined)
  ❯ fold src/app/assemble.ts:50:13
```

because `foldOk` fell through to `const _never: never = r; return _never;`, which returns
`undefined`. Kotlin does not have this hole — its root dispatch is `is TriageResult ->`, a real sealed
type check. **Do not write "4 sites, all compiler-forced" for this port.** Its number is five, and one
of the five is on you.

**Out of folder, in the test tree: two hand-maintained name ledgers** — `test/app/totality.test.ts`'s
verb map (`:55-56` for the inbox pair) and `test/gate/gate.test.ts`'s `declared` list (`:179-180`).
Both deny, so both are on the edit list. A block going from one verb to two additionally needs its
fold's `const _never: never = r.tool` changed to `= r` — that one *is* compiler-forced.

Adding `setPriority` (domain) and adding `setPanel` (presentation) touch **the same five sites**.
§6.8's "a UI tool folds, does not sign" carve-out is gone, and with it the two tool mechanics that
made G11 and §16.1 worse, not better.

### Row 2 — a verb that also introduces a NOVEL EFFECT KIND

**Row 1, plus 2 declared sites — both inside the owning block, and zero at the root.**

| # | Site | File | Named by |
|---|---|---|---|
| 6 | the `Effect` case | `blocks/<X>/contract.ts` | it *is* the thing you are adding |
| 7 | the handler arm in the block's own registration | `blocks/<X>/register.ts` | the block's own exhaustive handler table |

**The composition root does not move**, and that is what `docs/DECISIONS.md:64-69`'s handler split
bought. The one qualifier, written verbatim in `src/app/wire.ts`: a block growing its **first** effect
kind also costs one compiler-named line in that file's dispatcher assembly; a kind appended to a union
the block already has costs none.

**Out of folder: exactly one gate ledger** — `test/app/totality.test.ts`'s `EXPECTED_EFFECTS`,
maintained per effect case the way `EXPECTED` already is for verbs.

Not asserted: `test/gate/exhaustiveness.test.ts` applies
`test/gate/fixtures/novel-effect-kind/patch.json` to a package farm, compiles the gate's own program
over it, and asserts `errors: 2` and `outOfFolder: ["test/app/totality.test.ts"]` as an **exact set
equality** — an absence proved by naming what is present, not by counting nothing.

### Row 3 — a whole new block

Measured against `inbox`, the minimal block in the tree: no port, no adapter, no effect.

**New files: 8**, all under `src/blocks/<X>/` — `contract.ts`, `fold.ts`, `project.ts`, `register.ts`,
`slice.ts`, `tools.ts`, plus the package's own `package.json` and `tsconfig.json`, which are what make
the folder a wall rather than a convention.

**Root cost: 18 edit sites across 6 files, 14 of them declared sites.** Recount it with:

```
cd examples/typescript && grep -nE 'Inbox|inbox|noteDrop|noteFault' \
  src/app/contract.ts src/app/assemble.ts src/app/wire.ts \
  src/app/package.json src/app/tsconfig.json tsconfig.wall.json
```

| File | Edit sites | Declared | The lines |
|---|---|---|---|
| `src/app/contract.ts` | 7 | 5 — the `ToolResult` member, the `Command` member, the `State` field, the `AppView` field, the `initialState` entry | 41, 42, 69, 78, 102, 111, 128 |
| `src/app/assemble.ts` | 4 | 3 — the `foldOk` branch, the view row, the context lines | 23, 117–118, 162, 183 |
| `src/app/wire.ts` | 4 | 3 — the `register()` line in each of the three tiers | 68, 259, 269, 275 |
| `src/app/package.json` | 1 | 1 — the workspace dependency | 12 |
| `src/app/tsconfig.json` | 1 | 1 — the project reference | 33 |
| `tsconfig.wall.json` | 1 | 1 — the solution reference, without which the package has no wall | 22 |

**The difference between 18 and 14 is four `import` lines, and they are these four:**
`src/app/contract.ts:41` and `:42`, `src/app/assemble.ts:23`, and `src/app/wire.ts:68`.

**What the command prints that the table does not count, named so the two recounts land in the same
place.** Prose: `src/app/wire.ts:110` and `:325` are comment lines. And **four lines of the barge-in
consumer bridge are excluded** — `src/app/wire.ts:350`, `:357`, `:362`, `:366`, where a `ConsumerEvent`
is mapped to a `noteDrop`/`noteFault` Action. That mapping exists because `inbox` is the block the
barge-in consumer happens to report into; it is role-specific wiring, not generic per-block cost, and
a new block gets none of it. **Put them back and `src/app/wire.ts` reads 8 edit sites and the total is
22 / 14** — that is the honest other number, and both recounts are now reproducible from one command.
`src/app/demo.ts` is excluded because it is the runnable demo rather than wiring, and its one hit is an
unrelated `"inbox"` source name; `src/spine/pure/staged.ts` names the English word in a comment.

The **root** `package.json` costs nothing — `src/blocks/*` is globbed — and `package-lock.json` is
regenerated by `npm install` rather than authored. Every union membership is written out by hand,
which is the whole TypeScript/Kotlin delta on this row: Kotlin's sealed hierarchies close themselves
and pay instead by authoring the block's transport inside `:spine`.

**Six gate ledgers move, and they are the receipt** for a new block carrying two verbs. Four are
structural: `test/gate/gate.test.ts`'s eight-package equality, `test/gate/anchors.test.ts`'s per-block
file roster, `test/gate/exhaustiveness.test.ts`'s package farm, and `test/laws/edges.test.ts`'s package
map. Two more are the verb ledgers row 1 already names: `test/app/totality.test.ts`'s verb map and
`test/gate/gate.test.ts`'s `declared` list. The spine roster of 37 in `test/gate/gate.test.ts` does
**not** move — a block adds no spine file. One further pin sits in this port's tree but counts *both*
ports, and is named here so nobody looks for it twice: the citation census's per-root file and
citation counts in `test/laws/citations.test.ts`.

Removing a block is the same list, subtracted, plus `rm -rf src/blocks/<X>/`.

**A new State variant — 1 append + 3 compiler-named arms, all inside one block folder.**

G11's literal "one line" is unattainable *with* compile-time exhaustiveness. What the design does buy
is the honest headline ADR-001 §1.3 Q1 states: **a handful of appends, every one of them named by the
compiler or by a check — with this port's one documented exception — none of them a rewrite of shared
logic.** No builder should pretend otherwise.

---

## What you inherit, and what you vendor (G14)

The honest statement, because "zero of their source lives in your repository" was only ever true of
one of the two things you get:

* **You inherit the loop.** A generic agent-loop runtime supplies the loop, the step lifecycle and
  the provider abstraction. That is a real dependency — resolved from the registry, zero source in
  this repository — and `spine/agent/loop.ts` is the only file that names it.
* **You vendor the spine.** The signed command bus, the fold driver, state derivation, replay, the
  barge-in mailbox, the tier relay and the enforcement gate are a **fixed, small, self-contained
  tier: 37 files, roster pinned by a test**, the same components as the Kotlin port's 38 — spelled per language, not file-for-file identical. **No spine package is published on
  any registry**, and this pass does not publish one — that is the repository owner's decision. What
  is true today is that you copy the tier once and **never author it per feature**: every feature you
  add lands in `blocks/<X>/` plus the root, and each component is swappable behind its own contract.

**Gate check C15 is what turns that from a claim into a property of the build**: `spine/**` may not
name `blocks/**` or `app/**` — so the tier can be lifted out whole.

The honest headline is therefore: **two kinds of tool + thin wiring + a loop you depend on + a spine
you vendor once and never author per feature.**

---

## Day one: a working one-verb app

**Read this first: it is a step list for YOUR new repository, not for this one.** The spine is a
vendored template and no package is published on any registry (docs/DECISIONS.md:155), so day one is
a copy, not an install. Nothing below asks you to touch this repository, and none of this port's
roster pins, anchor rosters or verb ledgers are yours to maintain — they exist because this tree is
the reference, and an adopter inherits none of them.

Every step was executed end to end before it was written, and `test/laws/quickstart.test.ts` keeps it
that way: on every `npm test` it materialises this port's live `src/spine/` beside the adopter
template in `test/laws/fixtures/quickstart/walk/`, then runs the very commands step 6 instructs
against it.

<!-- quickstart:begin -->
**Scope, first, because it is the one thing a step list can be wrong about silently:** everything
below is for YOUR new repository. None of this port's roster pins, anchor rosters or verb ledgers
travel with the copy; they exist because this tree is the reference.

**1 — the workspace.** `npm init -y`, then make the manifest `"private": true`, `"type": "module"`,
and give it `"workspaces": ["src/spine", "src/blocks/*", "src/app"]`. The workspace list is what
turns `npm install` into the linking step that makes `@adr/spine` resolvable at all.

Give it a `"scripts"` table in the same edit, because step 6 issues exactly these three and an
earlier version of this list never provisioned them:

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "demo": "tsx src/app/main.ts"
}
```

You also need a root `tsconfig.json` beside `tsconfig.base.json` — the base is what the packages
EXTEND, and the root is what `tsc --noEmit` reads when you run it with no argument. Both files are
in the adopter template this list is walked against, so copy them from there rather than authoring
them.

**2 — copy the spine.** `cp -r <this repo>/examples/typescript/src/spine <yours>/src/spine`.

*What you get:* the folder holds 39 entries — the 37 `.ts` this port's roster pin names, plus
`src/spine/package.json` (the `@adr/spine` name and its one-subpath-per-tier `exports` map) and
`src/spine/tsconfig.json`. It carries its own version marker at `src/spine/pure/version.ts`, so a
copy can always say which template revision it holds; keep that file, it is what `CHANGELOG.md`
entries key on.

*The step that is not obvious, and cost the walk a red run:* the copied `src/spine/tsconfig.json`
begins `"extends": "../../tsconfig.base.json"`. That file is NOT inside the folder you copied, so
create `tsconfig.base.json` at your repository root — this port's is a fine starting point — before
anything else. Without it the copy is a broken project: `Failed to load tsconfig for
src/spine/pure/actor.ts: Tsconfig not found`.

**3 — the dependencies.**

Mandatory install: `npm i ai @valibot/to-json-schema valibot`

All three are needed to COMPILE, not merely to run, and the difference is the trap. Step 2 copies the
whole folder and your root config will say `include: ["src"]`, so `src/spine/agent/loop.ts` is in
your program whether or not your app ever calls the agent loop — and that one file names the runtime.
Measured on a tree outside this repository, with the first two absent, the first command step 6
issues exits 2: `error TS2307: Cannot find module 'ai'`, and three more beside it. `valibot` is the
third because a verb's schema names it. Dev side: `npm i -D typescript tsx vitest @types/node`.

*The one escape hatch, also measured:* if you do not want the agent loop at all, `rm -rf
src/spine/agent/` and the first two become unnecessary — that tree typechecks clean with neither
installed. Your copy is then 38 entries rather than 39, and you have given up the loop, not deferred
it.

**4 — register one verb.** A feature is a folder. Create `src/blocks/<x>/` with a `package.json`
whose only `exports` subpath is `./register`, and write the six files this port's
`src/blocks/console/` shows you: `contract.ts`, `slice.ts`, `tools.ts`, `fold.ts`, `project.ts`,
`register.ts`. Four of the edits are the verb itself — the `ToolResult` case and the `Command` case
in `contract.ts`, the `Verb` entry in `tools.ts`, the arm branch in `fold.ts` — and the fifth is the
hand-kept `is<X>Result` predicate that TypeScript will not check for you. All five are inside the
folder.

**5 — the root.** `src/app/` gets `contract.ts` (State as a product of slices, plus the three closed
unions), `assemble.ts` (fold, project, projectContext) and `wire.ts` (ports to adapters, the effect
sink, the boundary, the registry) — read `src/app/wire.ts` here and delete what you do not have.
`src/app/main.ts` is the one file allowed to touch the console.

**6 — run it.** `npm install`, then `npm run typecheck`, `npm test`, `npm run demo`. The fourth beat
is in the demo: re-fold the committed records with `refold(...)` and compare. The walk's own app
prints

```
[state]   2 note(s) folded
[bus]     2 committed step(s)
[replay]  state and full effect sequence re-derived from the bus: true
```

**7 — what you did NOT copy, and what it costs.** The tier lifts out whole because gate check C15
holds `spine/**` to naming no block and no root — but the walls that hold the REST of the
architecture are not in the folder. `eslint.config.js`, `tsconfig.wall.json`, `scripts/wall.mjs` and
the `test/gate/` fixtures stay here. Measured, the good news: no RULE in this port's lint config keys on a block name — the block names
that do appear in `eslint.config.js` sit in explanatory comments (seven mentions, all annotations
on what a rule denies), so the live config is copyable essentially as-is when you want it. Until you take it, you
have the architecture and not its enforcement.
<!-- quickstart:end -->

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

## The adoption ladder (17.4), rung by rung — what this port exercises

17.4 states the ladder as architecture and deliberately makes no claim about any codebase: which
rungs a port has actually climbed is the port's own claim to make, in the one place a build can
settle it. This is that claim. Read it with the section immediately below, which is its other half —
this table is what is **exercised**, that one is what is still **specified but unproven**, and
together they are the whole answer. Every row names the file that goes red when the claim stops
being true.

| Rung | In this port | Goes red in |
|---|---|---|
| **Core** | **Exercised.** A live run under a moving clock re-derives from its own committed bytes — the same state, the same effect sequence, the same keys, the same timestamps, and the same context digest the model was shown. `REPLAY` mode collects every descriptor and fires nothing, and the harness is proven non-vacuous by a divergent re-fold that must be detected. | `test/spine/replay.test.ts` · `test/spine/context.test.ts` |
| **+ Safety** | **Exercised**, on two layers. The gate refuses a self-confirm and a confirm with no pending request *before* the fold, so the refusal commits as a `ToolResult` and re-folds; an unattended agent and a human host both confirm through the same mechanism; a product `ConfirmPolicy` can refuse even a different principal; and an `Actor` smuggled through a tool's raw input never reaches it. Since the effect classes landed (C16/C17), refusal is also a property of the timeline: an `Irreversible` effect no `Irreversible` verb earned is refused at its own key and substituted — identically live, on `REPLAY`, on `RECOVERY`, and from a snapshot resume. | `test/spine/gate.test.ts` · `test/spine/admission.test.ts` |
| **+ Concurrency** | **Exercised.** Preemption asserted on a virtual clock against a *measured* control run — the interrupt is handled at t = 100 where the book's own 12.3 drain loop does not see it until t = 10 000 — plus both `InputPolicy` branches, per-source dedupe with ack-after-commit, a dedupe scope that survives a restart, the drain defer, the bounded-cancel timeout that revokes an abandoned turn, and a turn that throws without killing the consumer. | `test/spine/mailbox.test.ts` |
| **+ Cognition** | **Exercised.** Two tiers holding no handle to one another, the typed degrade (`Fresh` / `LastKnown` / `Empty`, with `Empty` a different fact from stale), a replay check that tampers with the committed record by swapping *only* the variant and requires the golden trace to go red, and a recalled "authorization" that cannot buy an irreversible act even with a request already pending. | `test/spine/relay.test.ts` |
| **+ Inputs** | **Partly**, and the gap is the modality, not the seam. Off-bus input is staged in order, captured on the record and fed back from it on re-fold rather than re-queried. But all three adapters — `blocks/analysis`, `blocks/artifact`, `blocks/escalation` — resolve in-process text; no image, audio or document modality is exercised anywhere in this port. | `src/blocks/*/adapter.ts` (all three) |
| **+ Enforcement** | **Exercised**, on two layers rather than one. Seventeen denying checks, each with one block-test and one allow-test over real fixtures, wired into `npm test` — the same entry point `.github/workflows/ci.yml` runs on every push and pull request, with no warning tier and no baseline file. Under the lint layer sits the workspace wall: `npm run typecheck:wall` builds the package graph with `tsc -b --force`, and a cross-block or block-to-root import is a *resolution* error (TS6059/TS6307/TS2307) rather than a lint message — measured row by row at the top of this file, including the one route the wall cannot close. | `test/gate/gate.test.ts` · `npm run typecheck:wall` |

---

## Deliberate scope limits — specified but unproven

16.4 licenses stopping early, and that stays true. These rungs are built so the *reference* exercises
what it specifies, not so every adopter takes them. What is still **specified but unproven** is named
here rather than left to imply a parity that does not exist:

| | why |
|---|---|
| **Cross-session global ordering** | 5.2 puts causal consistency across independent streams out of scope. The two-tier test proves *separate* buses; it proves nothing about ordering between them. |
| **Replay tooling beyond a re-fold** | an interactive scrubber UI, a fork-from-step and an interactive diff are drawn in 14.1; none is built. What *is* built is the re-fold itself, the prefix re-fold at step `k` a scrubber would sit on (`refoldFrom`), the effect-sequence comparison and the per-step context-digest check — the machinery such a UI would call, with no UI over it. |
| **A distributed or sharded bus, bespoke persistence/retention, multi-tenant isolation** | 8.5 names these as swaps. The contracts exist; no adapter does. |
| **Where a snapshot is stored, compaction, retention (14.1/16.2)** | product policy. The snapshot *mechanism* left this row: `spine/replay` ships the memoized fold prefix, tagged with the reducer version, the timeline offset it covers, and the mark of the record it stops at. `test/spine/replay.test.ts` proves a snapshot-seeded resume equals what the live boundary and live sink produced, and that a snapshot resumed under a reducer version the caller is not folding with — or over a tail whose boundary the log does not confirm — is refused rather than folded. Two logs whose boundary records are byte-identical stay indistinguishable to that seam; the file says so. What a product still owns is where a snapshot *lives*, and how far below one it may compact. |
| **CI** | `.github/workflows/ci.yml` runs `npm test` (and the Kotlin suite) on every push and pull request — the same entry point a developer runs locally, no CI-only rule set. |
| **Dispatcher confinement of `submit`** | the consumer mints the turn's only channel and calls the boundary itself, so the reference cannot violate it — but an adopter who runs a turn on another thread could interleave two folds despite the design. Structural, **not gate-checkable**. |
| **The abandoned turn can leak** | after a cancel-deadline timeout the turn may never unwind. The design bounds the *consumer*, not the turn; removing the leak needs an unbounded join, which 12.3 itself calls a hang. The leak is named, degraded, counted and folded — never hidden. |
| **The `owns` type predicate is unguarded** | see the blast-radius note above: a new verb whose name is not added to `isXResult` typechecks and lints clean, then fails at runtime. TypeScript-only; Kotlin's root dispatch is a real sealed type check. |

---

## Deliberate scope decisions

* **Schema evolution (14.7) ships, one rung of it.** `StepRecord` carries a required
  `schemaVersion` (current 2, genesis 1 — nothing was ever persisted, so there is no v0), and one
  worked v1 -> v2 upcaster lifts the block payload that gained an optional field. The refusal is the
  compiler's, in both halves: a `StepRecordV1` is not a `StepRecord`, and a v1 payload is not a
  `ToolResult` — its `outcome` is `"ok-v1"`, a value `ResultOutcome` does not have, which is how a
  structural language refuses what Kotlin refuses nominally. So an un-upcast log cannot reach
  `refold` at all. What is *not* here is a chain of upcasters, a versioned wire encoding (14.1 leaves
  that product-owned), a golden trace pinned per reducer version, or any dispatch on the version at
  load time: the envelope is read by the COMPILER and never at run time, because this reference
  deliberately ships no loader to read it in.
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

Seventeen checks, each **denying** (`npm run lint` exits non-zero), each with one **block-test** and
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
| C13 | registry totality plus handler totality — every declared result case has a `Verb` entry that signs, and every declared `Effect` kind has a registered handler |
| C14 | G3 — the loop is a declaration, not a program |
| C15 | G14 — the spine tier is self-contained: `spine/**` names no block and no root |
| C16 | G6 — only the admission rule opens the fold's attributed output: an effect reaches `perform` through `admit`, never by field access |
| C17 | G6 — an Irreversible-class effect is constructed only at its own pinned site, never in a Reversible verb's arm |

**Boring tooling on purpose.** Fifteen of the seventeen are ordinary ESLint rules in
`eslint.config.js` — `no-restricted-imports` (with one allow-list regex per folder, which is §1.3's
import table written out verbatim), `no-restricted-syntax` (the forbidden-call list) and the
type-aware `@typescript-eslint/switch-exhaustiveness-check`. Nothing is a bespoke analyser, so you
can check a rule against the ESLint docs rather than against us. C13 is a vitest check, because it
is a question about values rather than syntax.

**One checker, not two.** `test/gate/gate.test.ts` imports `gate` straight out of `eslint.config.js`,
so the block-tests and allow-tests run the same rule objects `npm run lint` runs. There is no second
implementation to drift.

**Every check has been watched deny.** Each rule was introduced as a violation into the real tree,
the gate was run, the denial observed, and the edit reverted — for all seventeen. Sample:

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
