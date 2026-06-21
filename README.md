# The Agent-Driven Architecture

**An opinionated, platform-agnostic architecture for software where the agent — not the human — is the primary operator.**

When an autonomous agent drives an application instead of a person, the usual assumptions invert: the UI becomes a passive surface, and *every* action — whether a human tap or an agent tool-call — must be indistinguishable downstream. This repository is a short book about how to make that safe, testable, and replayable, plus a complete worked example that builds the whole thing one seam at a time.

It is delivered the way Robert C. Martin's *Clean Architecture* teaches boundaries: a defined set of layers, a fixed nomenclature, a small set of invariants, and a single running example traced across every seam — *what each seam is, what crosses it, why it exists, and what breaks the moment you violate it.*

---

## The one idea

A human action and an agent action are the **same signed `Command`** on **one append-only, replayable stream**, differing only by an `Actor` label. Everything else follows from keeping that true:

- **Everything is a tool — even the UI.** The agent reaches the world *only* through tool calls; presentation actions are tools on equal footing with business actions.
- **State is a pure fold** over the command stream. Nothing happens off the record, so any session reconstructs from its commands alone.
- **One impure seam.** A single *boundary adapter* mints identity, reads the clock, stamps the actor, and performs effects. Everything else — tools, the reducer, the view projection — is pure.
- **You build two kinds of tools** (UI tools and domain tools); a generic agent-loop runtime and this architecture's *spine* provide the rest.

The payoff: the whole session **replays deterministically**, a human override is free (it is the same command with a different actor), and a single bad inference cannot fire an irreversible effect.

---

## What's in this repository

| | |
|---|---|
| **The book** — [`wiki/index.html`](wiki/index.html) | The complete reference: the inversion, the signed command bus, the stateless-reducer agent, ports and adapters, the provided-but-swappable spine, tiered cognition, concurrency and barge-in, replay and recovery, and the enforced invariants (G1–G14), with a fixed nomenclature. |
| **The worked example** — [`wiki/example/`](wiki/example/index.html) | One running application — a support-ticket triage console — traced through every seam, Clean-Architecture style. An overview plus seven seam chapters, each running the same eight-slot template and ending in a "what breaks" anti-example. |
| **The reference implementations** — [`examples/`](examples/) | Two *functional, compiling* ports of that same example: [`examples/typescript`](examples/typescript) on the Vercel AI SDK (v6) and [`examples/kotlin`](examples/kotlin) on the `aisdk-kotlin` runtime. Each compiles and its tests pass — the pure core, the replay-determinism check, and the irreversible-action gate, proven in real code. |

The book and the example share one program: the `Command` built in the boundary chapter is the one folded in the state chapter and replayed in the last — the same identifiers throughout.

---

## How to read it

These are self-contained HTML documents (dark theme, diagrams, syntax-highlighted pseudocode). The easiest way to read them rendered:

- **GitHub Pages**: <https://torad-labs.github.io/agent-driven-architecture/> — the root redirects to the book; the worked example is at `…/wiki/example/`.
- **Locally**: clone the repo and open `wiki/index.html` in any browser. No build step, no dependencies — the only external resources are a web font, a syntax highlighter, and a diagram renderer loaded from a CDN, and each degrades gracefully offline.

Suggested path: read the book's first chapters for the mental model and the build-vs-depend boundary, then walk the worked example `01 → 07` to see every seam made concrete, then return to the book's advanced sections as the problems they name come up.

---

## The shape, in one paragraph

The architecture sits as a **library on top of a generic agent-loop runtime** (the shape popularised by the Vercel AI SDK): the runtime gives you the loop and tool-calling; this gives you the **spine** — the signed bus, the pure fold, replay, the barge-in mailbox, and the enforcement gate — and the structure, so you spend your effort on *tools, not plumbing*. It is prescriptive and batteries-included, with a single, contract-bounded door for the heavy cases that genuinely need more. Drop the contract onto any language, framework, or platform — the spine does not move.

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
│   └── kotlin/               ← on aisdk-kotlin (Maven Central):  ./gradlew test
├── index.html                ← redirect → wiki/index.html (so the GitHub Pages root works)
├── README.md
├── LICENSE                   ← CC BY 4.0 (the writing)
└── LICENSE-CODE              ← MIT (the code)
```

---

## License

This is a book with code, so it carries two licenses — both permissive, both free to use, **both requiring attribution**:

- **The writing** — the book, the prose, the diagrams, every word of explanation — is © 2026 **Marcos Paulo Souza Damasceno**, licensed under [**Creative Commons Attribution 4.0 International (CC BY 4.0)**](LICENSE). Use it, share it, adapt it, teach from it — just credit the author.
- **The code** — the worked example's HTML/CSS/JavaScript, the reference implementations (TypeScript + Kotlin), and the pseudocode snippets — is licensed under the [**MIT License**](LICENSE-CODE). Use it in anything, including commercially; keep the copyright notice.

You do not need permission and you do not owe anything. The only ask is the one both licenses make: **name the source.**

### How to credit

> The Agent-Driven Architecture, by Marcos Paulo Souza Damasceno — https://github.com/torad-labs/agent-driven-architecture (CC BY 4.0)
