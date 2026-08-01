# The Agent-Driven Architecture

**An opinionated, platform-agnostic architecture for software where the agent — not the human — is the primary operator.**

When an autonomous agent drives an application instead of a person, the usual assumptions invert: the UI becomes a passive surface, and *every* action — whether a human tap or an agent tool-call — must be indistinguishable downstream. This repository is a short book about how to make that safe, testable, and replayable, plus a complete worked example that builds the whole thing one seam at a time.

It is delivered the way Robert C. Martin's *Clean Architecture* teaches boundaries: a defined set of layers, a fixed nomenclature, a small set of invariants, and a single running example traced across every seam — *what each seam is, what crosses it, why it exists, and what breaks the moment you violate it.*

---

## The one idea

A human action and an agent action are the **same signed `Command`** on **one append-only, replayable stream**, differing only by the stamp the boundary mints — who acted (`Actor`) and under whose permission (`Authority`). Everything else follows from keeping that true:

- **Everything is a tool — even the UI.** The agent reaches the world *only* through tool calls; presentation actions are tools on equal footing with business actions, one mechanic and not two.
- **State is a pure fold** over the command stream. Nothing happens off the record, so any session reconstructs from its commands alone.
- **One impure seam.** A single *boundary adapter* mints identity, reads the clock, stamps the actor and the authority it acted under, commits the step, and only then performs its effects. Everything else — tools, the reducer, the view projection — is pure.
- **A feature is a folder.** Each block owns its contract, its slice of state, its tools, its fold arm and its projection; you plug it in by naming it at one composition root and pull it out by deleting the folder. Nothing outside a block may name a symbol inside it.

The payoff is measured on the ports, not asserted: a new verb is **four appends inside one block folder** and nothing outside it (TypeScript needs a fifth — a hand-kept type predicate its compiler will not check for you); a new state variant is one append plus **three sites the compiler names for you**, all in the same folder. A session re-folds from its committed bytes alone, a human override is free (it is the same command with a different actor), and a single bad inference cannot fire an irreversible effect.

---

## What's in this repository

| | |
|---|---|
| **The book** — [`wiki/index.html`](wiki/index.html) | The complete reference: the inversion, the signed command bus, the stateless-reducer agent, ports and adapters, the vendored-but-swappable spine, tiered cognition, concurrency and barge-in, replay and recovery, and the enforced invariants (G1–G16), with a fixed nomenclature — and an honest per-law map of which layer enforces each one today. |
| **The worked example** — [`wiki/example/`](wiki/example/index.html) | One running application — a support-ticket triage console — traced through every seam, Clean-Architecture style. An overview plus seven seam chapters, each running the same eight-slot template and ending in a "what breaks" anti-example. |
| **The reference implementations** — [`examples/`](examples/) | Two *functional, compiling* ports of that same example, mirroring one tree: [`examples/typescript`](examples/typescript) on the Vercel AI SDK (v6) and [`examples/kotlin`](examples/kotlin) on the `aisdk-kotlin` runtime. Each builds and its tests pass — the pure core; a *live* run re-folded from its committed bytes alone, state and the full effect sequence with every timestamp intact; the irreversible-action gate sitting before the fold and comparing the confirming authority against the requesting one, so a self-confirm is refused and the refusal is itself committed; a barge-in mailbox whose consumer preempts a running turn — cancelled, joined under a deadline, then folded — and a second tier the fast loop reaches only through a recall tool that degrades to a *typed* last-known when the relay is slow, both proven on a virtual clock; and seventeen architecture checks that **deny**, each with a paired block-test and allow-test — sixteen over checked-in violating/compliant fixtures, the value-level registry check running one checker over the shipped registry and a deliberately thinned one — run by `npm test` and `./gradlew check`, and by CI on every push. |

The book and the example share one program: the `Command` built in the boundary chapter is the one folded in the state chapter and replayed in the last — the same identifiers throughout.

---

## How to read it

These are self-contained HTML documents (dark theme, diagrams, syntax-highlighted pseudocode). The easiest way to read them rendered:

- **GitHub Pages**: <https://torad-labs.github.io/agent-driven-architecture/> — the root redirects to the book; the worked example is at `…/wiki/example/`.
- **Locally**: clone the repo and open `wiki/index.html` in any browser. No build step, no dependencies — the only external resources are a web font, a syntax highlighter, and a diagram renderer loaded from a CDN, and each degrades gracefully offline.

Suggested path: read the book's first chapters for the mental model and the line between what you write, what you vendor, and what you depend on, then walk the worked example `01 → 07` to see every seam made concrete, then return to the book's advanced sections as the problems they name come up.

---

## The shape, in one paragraph

The architecture sits **on top of a generic agent-loop runtime** — any runtime that satisfies the capability contract stated in §8.2 of the book, of which the Vercel AI SDK is one — and its two halves reach you differently. **The loop you depend on**: that tier gives you the loop, none of its source lives here, and exactly one spine file names it (outside the spine, only the composition root touches it, to bind a model). **The spine you vendor**: the signed bus, the pure fold, replay, the barge-in mailbox, the tier relay, and the enforcement gate are a fixed, small, self-contained tier — **37 files in the TypeScript port, 38 in the Kotlin port: the same components, spelled per language, with each port's exact roster pinned by a test** — that you copy in once and never author again per feature, each component swappable behind its own contract. It is source you hold but do not write, and a gate check keeps the tier liftable: nothing under `spine/` may name a block or the app root. No spine package is published on any registry; that is the repository owner's call, and future work. What both halves buy is the same thing — you spend your effort on *tools, not plumbing*. The tree is that structure made visible: `spine/` is the trunk, `blocks/<feature>/` are the leaves, and `app/` is the one root allowed to name every block. A feature is a folder plus its registration at that root, and no block may reach into a sibling — so features stack like lego and the cost of a new verb stays inside its own folder. It is prescriptive and batteries-included, with a single, contract-bounded door for the heavy cases that genuinely need more. Drop the contract onto any language, framework, or platform — the spine does not move.

---

## Repository structure

```
.
├── wiki/                     ← the HTML "pages": the book + the worked example
│   ├── index.html            ← the book (the reference)
│   └── example/              ← the worked example
│       ├── index.html        ← overview: the rings, the law, a Clean-Architecture mapping, the typical scenario
│       ├── 01-state-and-fold.html … 07-replay-and-advanced.html
│       ├── agentd.css        ← shared design system
│       └── agentd.js         ← shared rendering (highlight + diagrams + scrollspy)
├── examples/                 ← functional reference implementations (runnable code)
│   ├── typescript/           ← on the Vercel AI SDK (v6):  npm install && npm test
│   └── kotlin/               ← on aisdk-kotlin (Maven Central):  ./gradlew check
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
├── blocks/                   ← THE LEAVES — one folder per feature; `register` is the one public symbol
│   ├── triage/               ← contract · slice · tools · fold · project · register
│   ├── escalation/           ← … + port · adapter   (the block's frozen contract, and its one client)
│   ├── console/              ← … + view-state       (presentation: folds AND signs, like any block)
│   ├── artifact/             ← … + port · adapter   (the work product, as a folded slice)
│   ├── analysis/             ← … + port · adapter   (the second tier: publish deep, recall fast)
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
