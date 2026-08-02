# The Agent-Driven Architecture

**An opinionated, platform-agnostic architecture for software where the agent — not the human — is the primary operator.**

When an autonomous agent drives an application instead of a person, the usual assumptions invert: the UI becomes a passive surface, and *every* action — whether a human tap or an agent tool-call — must be indistinguishable downstream. This repository is a short book about how to make that safe, testable, and replayable, plus a complete worked example that builds the whole thing one seam at a time, plus two functional reference ports whose every architectural claim is enforced by a test.

It is delivered the way Robert C. Martin's *Clean Architecture* teaches boundaries: a defined set of layers, a fixed nomenclature, a small set of invariants, and a single running example traced across every seam — *what each seam is, what crosses it, why it exists, and what breaks the moment you violate it.*

---

## The one idea

A human action and an agent action are the **same signed `Command`** on **one append-only, replayable stream**, differing only by the stamp the boundary mints — who acted (`Actor`) and under whose permission (`Authority`). Everything else follows from keeping that true:

- **Everything is a tool — even the UI.** The agent reaches the world *only* through tool calls; presentation actions are tools on equal footing with business actions, one mechanic and not two.
- **State is a pure fold** over the command stream. Nothing happens off the record, so any session reconstructs from its commands alone.
- **One impure seam.** A single *boundary adapter* mints identity, reads the clock, stamps the actor and the authority it acted under, commits the step, and only then performs its effects. Everything else — tools, the reducer, the view projection — is pure.
- **A feature is a folder.** Each block owns its contract, its slice of state, its tools, its fold arm and its projection; you plug it in by naming it at one composition root and pull it out by deleting the folder. Nothing outside a block may name a symbol inside it.

The payoff is measured on the ports, not asserted: a new verb is **four appended declarations** (TypeScript needs a fifth — a narrowing claim, derived from a table its compiler keeps exhaustive over the same union); a new state variant is one append plus **three sites the compiler names for you**. Where each append lands is a fact about a port, not about the architecture. Each port states its own measured counts — for a verb, for an effect kind and for a whole block — beside the command that recounts them, in its own README. A session re-folds from its committed bytes alone, a human override is free (it is the same command with a different actor), and a single bad inference cannot fire an irreversible effect.

---

## What's in this repository

| | |
|---|---|
| **The book** — [`wiki/index.html`](wiki/index.html) | The complete reference: the inversion, the signed command bus, the stateless-reducer agent, ports and adapters, the vendored-but-swappable spine, tiered cognition, concurrency and barge-in, replay and recovery, effect classes, and the enforced invariants (G1–G16), with a fixed nomenclature — and an honest per-law map of which layer enforces each one today. The book is **platform-generic**: it names no language, framework, or tool. |
| **The worked example** — [`wiki/example/`](wiki/example/index.html) | One running application — a support-ticket triage console — traced through every seam, Clean-Architecture style. An overview plus seven seam chapters, each running the same eight-slot template and ending in a "what breaks" anti-example. |
| **The reference implementations** — [`examples/`](examples/) | Two *functional, compiling* ports of that same example, mirroring one tree: [`examples/typescript`](examples/typescript) on the Vercel AI SDK (v6) and [`examples/kotlin`](examples/kotlin) on the `aisdk-kotlin` runtime. They are demos, judged against the book — never the reverse. |

The book and the example share one program: the `Command` built in the boundary chapter is the one folded in the state chapter and replayed in the last — the same identifiers throughout.

---

## What the reference ports actually prove

Each port builds and its tests pass, and the tests are not smoke checks — they perform the architecture's claims:

- **The pure core** folds a command stream to state with zero I/O.
- **A live run re-folds from its committed bytes alone** — state *and* the full effect sequence, every timestamp intact — so replay is proven, not promised.
- **The irreversible-action gate** sits before the fold and compares the confirming authority against the requesting one, so a self-confirm is refused and *the refusal is itself committed*.
- **Effect classes.** Every effect is `Routine` or `Irreversible`, and the refusal is a **property of the timeline**: admission is a pure rule applied in the *shared re-derivation*, so the live run, replay, and recovery agree by construction rather than by three code paths kept in step. A single bad inference cannot fire an irreversible effect on any of the three.
- **A barge-in mailbox** whose consumer preempts a running turn — cancelled, joined under a deadline, then folded — with a conflation policy that is observable, never silent.
- **A second cognitive tier** the fast loop reaches only through a recall tool that degrades to a *typed* last-known when the relay is slow — both proven on a virtual clock.
- **A scrub cursor** that re-folds any prefix of the timeline, proven by exercise at both ends and in between — state *and* effects.

---

## How it's enforced — and how that's proven

The architecture's central bet is that its invariants are held by **machine enforcement**, not by discipline. The first draft of the reference shipped *zero* checks — `Date.now()` inside a tool body and an `fs` import in the domain file both compiled clean. That is the failure this repository exists to prevent, and here is the machinery that prevents it.

**Sixteen portable laws.** `laws.toml` at the repo root is the single source of truth for the invariants **G1–G16** — the dependency rule, one production site for signed transport, an `Actor` unrepresentable upstream of the boundary, a pure fold that cannot key an effect, closed matches with no catch-all, the effect-class admission rule, and the rest. The book's §15.3 enforcement table — including the normative *guarantee* column that says what each law means — is **generated from `laws.toml` and asserted byte-for-byte**, so the book and the registry cannot drift, and a guarantee cannot be quietly reworded.

**Seventeen denying checks (C1–C17).** Each one **denies** — `npm test` and `./gradlew check` exit non-zero on a violation — and each ships **both a block-test and an allow-test**: a checked-in violating fixture it must reject *and* an idiomatic compliant one it must accept, so a rule cannot drift into a nuisance authors turn off. The block-test asserts a **per-file denial map**, so no clause of a multi-clause check can be deleted in silence. There is no warning tier and no baseline file.

**Two structural walls, where a rule reading file names is not enough.**

- **The purity boundary is drawn by the unit split, not by a filename rule.** Each block is *two build units* — a pure package and an adapter leaf — so a pure file reaching its own block's impure unit is a **resolution error from the real compiler**, not a lint message. The TypeScript port is a **14-package workspace** (`@adr/spine`, six blocks × a pure package plus an adapter package, and `@adr/app`); the Kotlin port is a **14-module Gradle build** whose convention plugins refuse a forbidden edge at configuration time, before a line compiles. Blocks with no seam to the outside declare the leaf and leave it empty — the pair is unconditional.
- **A frozen public API (Kotlin).** ADR-001 §4's API freeze is wired: every module commits a `.api` dump, `apiCheck` rides `check`, and a public declaration the dump does not carry fails the build. The freeze cannot be hollowed out — the validator's own exemption switches are denied, so silencing it for one class is itself a violation.

**Signed transport cannot be copied into the fold.** A signed `ToolResult` or `Command` may be *constructed* only in a verb body or at the boundary — that is one production site — and in the TypeScript port a copy of one (an object spread) is denied by the **type**, not by a lint rule: the transport carries a private brand no literal or spread can forge. The Kotlin residue (`copy()` on a data class) is tracked with a tripwire that reddens if it is ever closed silently.

**Proven by mutation, not by assertion.** A gate that is green because it reads nothing is worse than no gate. Every wall in this repository was red-green proven: the mutation it is meant to catch was *run*, and the check was watched to fail on it. The reference ports each carry a small library of these — a forged spread, a hidden effect, a scrub cursor that ignores its bound, a lambda decision the type-aware rule can't see — kept as permanent negative cases.

`npm test` and `./gradlew check` run all of this, and CI runs both on every push and pull request.

---

## How it was hardened

The reference ports and the book were put through **two rounds of adversarial review**, each with six independent lenses (runtime semantics, gate integrity, document consistency, wall evasions, port parity, the adopter's path, and the build plumbing itself), and every finding re-run by two independent refuters that killed anything they could not reproduce. **Thirty-three findings survived and were all closed** — including a gate that deleted the evidence of its own violation, a gate that stopped running on a warm build, and a gate that could not see the code it guarded. The second round pointed its sharpest lens at the first round's own fixes, and caught two claims that outran what had landed.

What remains genuinely open — a Kotlin transport-copy residue, an unwired `explicitApi()` half of the API freeze — is recorded in [`OPEN-GAPS.md`](OPEN-GAPS.md), each with measured evidence and a direction, and each with a mechanical tripwire so it cannot be forgotten or closed in silence. The book states no invariant its enforcement does not actually hold.

---

## How to read it

These are self-contained HTML documents (dark theme, diagrams, syntax-highlighted pseudocode). The easiest way to read them rendered:

- **GitHub Pages**: <https://torad-labs.github.io/agent-driven-architecture/> — the root redirects to the book; the worked example is at `…/wiki/example/`.
- **Locally**: clone the repo and open `wiki/index.html` in any browser. No build step, no dependencies — the only external resources are a web font, a syntax highlighter, and a diagram renderer loaded from a CDN, and each degrades gracefully offline.

Suggested path: read the book's first chapters for the mental model and the line between what you write, what you vendor, and what you depend on, then walk the worked example `01 → 07` to see every seam made concrete, then return to the book's advanced sections as the problems they name come up.

**Day one, if you would rather build than read.** Each port carries a step list that was walked end to end, and the two lists are held to different strengths — say which, because a single sentence covering both would overclaim one of them: the TypeScript list is re-executed end to end by the TypeScript gate, and the Kotlin list's every path, command, count and walked fact is resolved against the live tree by that same gate. A working one-verb app, from an empty repository, in about an hour. Pick yours —
[`examples/typescript/README.md#day-one-a-working-one-verb-app`](examples/typescript/README.md#day-one-a-working-one-verb-app)
or [`examples/kotlin/README.md#day-one-a-working-one-verb-app`](examples/kotlin/README.md#day-one-a-working-one-verb-app).
The spine is a vendored template and nothing is published on any registry, so day one is a copy.

---

## The shape, in one paragraph

The architecture sits **on top of a generic agent-loop runtime** — any runtime that satisfies the capability contract stated in §8.2 of the book, of which the Vercel AI SDK is one — and its two halves reach you differently. **The loop you depend on**: that tier gives you the loop, none of its source lives here, and exactly one spine file names it (outside the spine, only the composition root touches it, to bind a model). **The spine you vendor**: the signed bus, the pure fold, replay, the barge-in mailbox, the tier relay, and the enforcement gate are a fixed, small, self-contained tier — **37 files in the TypeScript port, 38 in the Kotlin port: the same components, spelled per language, with each port's exact roster pinned by a test** — that you copy in once and never author again per feature, each component swappable behind its own contract. It is source you hold but do not write, and a gate check keeps the tier liftable: nothing under `spine/` may name a block or the app root. No spine package is published on any registry; that is the repository owner's call, and future work. What both halves buy is the same thing — you spend your effort on *tools, not plumbing*. The tree is that structure made visible: `spine/` is the trunk, `blocks/<feature>/` are the leaves, and `app/` is the one root allowed to name every block. A feature is a folder plus its registration at that root, and no block may reach into a sibling — so features stack like lego. What one more verb costs is measured per port, in that port's README, and never claimed once for both. It is prescriptive and batteries-included, with a single, contract-bounded door for the heavy cases that genuinely need more. Drop the contract onto any language, framework, or platform — the spine does not move.

---

## Repository structure

```
.
├── wiki/                     ← the HTML "pages": the book + the worked example
│   ├── index.html            ← the book (the reference — platform-generic)
│   └── example/              ← the worked example
│       ├── index.html        ← overview: the rings, the law, a Clean-Architecture mapping, the typical scenario
│       ├── 01-state-and-fold.html … 07-replay-and-advanced.html
│       ├── agentd.css        ← shared design system
│       └── agentd.js         ← shared rendering (highlight + diagrams + scrollspy)
├── examples/                 ← functional reference implementations (runnable code)
│   ├── typescript/           ← on the Vercel AI SDK (v6):  npm install && npm test
│   └── kotlin/               ← on aisdk-kotlin (Maven Central):  ./gradlew check
├── laws.toml                 ← the single source of truth for the sixteen invariants (G1–G16)
├── docs/
│   ├── DECISIONS.md          ← the ratified architecture-decision record
│   └── adr/                  ← ADR-001: the compile-enforced seams
├── OPEN-GAPS.md              ← what remains open, by decision — each with evidence and a tripwire
├── index.html                ← redirect → wiki/index.html (so the GitHub Pages root works)
├── README.md
├── LICENSE                   ← CC BY 4.0 (the writing)
└── LICENSE-CODE              ← MIT (the code)
```

Both ports mirror **one tree** — TypeScript as `kebab-case.ts` under `src/`, Kotlin as `PascalCase.kt` under `src/main/kotlin/adr/`. The folder names *are* the layering:

```
src/
├── spine/                    ← THE TRUNK — block-agnostic, vendored once, never forked (37 TS / 38 KT files, test-pinned)
│   ├── pure/                 ← ZERO I/O — the closed transport: Action · ToolResult · Command ·
│   │                           Effect · KeyedEffect · Notice · RunStatus · StepRecord · Context ·
│   │                           ViewModel · Verb · Message · Recall, their id and Signature value
│   │                           types, and the spine's own slice of State
│   ├── ports/                ← INTERFACES ONLY — clock · id-source · bus · sink · authorization ·
│   │                           model-provider · event-source · mailbox · relay · scheduler
│   ├── boundary/             ← THE ONE IMPURE SEAM — action · gate · boundary · in-memory
│   ├── concurrency/          ← the serial consumer — the barge-in select — plus an in-memory
│   │                           mailbox (lease · ack · redeliver) and append-only relay
│   ├── agent/loop            ← the only file that imports the agent-loop runtime
│   ├── surface/controller    ← one ViewModel stream + one onAction(Action)
│   └── replay/replay         ← refold · stateAtStep · collectPerform · contextDivergence
├── blocks/                   ← THE LEAVES — one folder per feature, and TWO build units each: a pure
│   │                           unit and an adapter leaf, so a block's pure half has no route to its
│   │                           impure one and the purity boundary is held by resolution rather than by
│   │                           a rule reading file names. `register` is the one public symbol. The pair
│   │                           is unconditional: a block with no seam declares the leaf and leaves it
│   │                           empty. (TypeScript: a 14-package workspace. Kotlin: a 14-module build.)
│   ├── triage/               ← contract · slice · tools · fold · project · register + adapter/ (empty)
│   ├── escalation/           ← … + port · adapter/  (the block's frozen contract, and its one client)
│   ├── console/              ← … + view-state       (presentation: folds AND signs, like any block)
│   ├── artifact/             ← … + port · adapter/  (the work product, as a folded slice)
│   ├── analysis/             ← … + port · adapter/  (the second tier: publish deep, recall fast)
│   └── inbox/                ← …                    (the barge-in ledger: drops and faults, folded)
└── app/                      ← THE ROOT — the only place that may name every block
    ├── contract              ← State (a product of slices) + the three closed unions
    ├── assemble              ← fold · project · projectContext — the three total dispatchers
    ├── wire                  ← ports→adapters, the effect sink, the boundary, the registry
    └── demo                  ← a runnable, offline end-to-end script

test/                         ← mirrors it: spine/ · blocks/ · app/ · gate/, the last running one
                                block-test and one allow-test per check over its own fixtures
```

---

## License

This is a book with code, so it carries two licenses — both permissive, both free to use, **both requiring attribution**:

- **The writing** — the book, the prose, the diagrams, every word of explanation — is © 2026 **Marcos Paulo Souza Damasceno**, licensed under [**Creative Commons Attribution 4.0 International (CC BY 4.0)**](LICENSE). Use it, share it, adapt it, teach from it — just credit the author.
- **The code** — the worked example's HTML/CSS/JavaScript, the reference implementations (TypeScript + Kotlin), and the pseudocode snippets — is licensed under the [**MIT License**](LICENSE-CODE). Use it in anything, including commercially; keep the copyright notice.

You do not need permission and you do not owe anything. The only ask is the one both licenses make: **name the source.**

### How to credit

> The Agent-Driven Architecture, by Marcos Paulo Souza Damasceno — https://github.com/torad-labs/agent-driven-architecture (CC BY 4.0)
