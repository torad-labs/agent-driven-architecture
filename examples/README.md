# Agent-Driven Architecture — reference implementations

Two runnable, 1:1-equivalent ports of the worked example from the book: a
**support-ticket triage console** where a human and an LLM agent issue the *same*
kind of action onto *one* append-only bus, and an **irreversible-action gate**
decides — purely — when the only irreversible effect (paging on-call) is allowed
to fire.

| Impl | Runtime it sits on | Language |
| --- | --- | --- |
| [`typescript/`](./typescript) | [Vercel AI SDK v6](https://www.npmjs.com/package/ai) (`generateText` + `onStepFinish`) | TypeScript |
| [`kotlin/`](./kotlin) | [aisdk-kotlin](https://github.com/torad-labs/aisdk-kotlin) (`ToolLoopAgent` + `onStepFinish`) | Kotlin |

Both implementations are structured around the same seams and mirror each other
file-for-file:

| File | Ring / seam | What it is |
| --- | --- | --- |
| `domain` | entities (01) | `State` as a discriminated union + pure copy-on-write transitions |
| `command` | signed action (02) | a human tap and an agent tool-call become the *same* `Command`, differing only by `by: Actor` |
| `effect` | descriptors (01) | plain data the fold *returns*; only the boundary *performs* them |
| `tool-result` | payloads (03) | what a tool returns and what crosses back to be folded |
| `fold` | use-case interactor (01) | the pure reducer `(state, results, now) -> (state, effects)` — **with the gate** |
| `tools` | tools (03) | pure `run(input, ctx) -> ToolResult`; UI tools and domain tools share one shape |
| `boundary` | the one impure seam (02) | clock → fold → sign+mint id → **commit** → adopt state → perform — in that order |
| `projection` | presenter (04) | pure `State -> ConsoleView`; every presentational flag pre-decided |
| `replay` | tests are the outer ring (07) | fold a recorded timeline **twice**, assert bit-identical |
| `agent` / `App` | runtime binding (06/07) | the *only* file that touches the agent-loop runtime; hooks the boundary onto `onStepFinish` |
| `demo` | — | a scripted, offline end-to-end run with no API keys |

## Run them

### TypeScript

```sh
cd typescript
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest — 8 tests
npm run demo        # offline scripted end-to-end run
```

### Kotlin

The Kotlin port depends on `aisdk-kotlin`, resolved from your local Maven
repository. Publish it once with `./gradlew publishToMavenLocal` from the
[aisdk-kotlin](https://github.com/torad-labs/aisdk-kotlin) checkout, then:

```sh
cd kotlin
./gradlew test      # 8 tests
./gradlew run       # offline scripted end-to-end run
```

## What they prove

Both suites assert the same three claims:

1. **It compiles against the real runtime.** The `agent` / `App` binding is the
   only file that imports the agent-loop SDK. It wraps the pure tools as SDK
   tools and hooks the boundary onto the runtime's `onStepFinish` — that callback
   *is* the boundary seam. `AgentTest` drives the real `ToolLoopAgent` /
   `generateText` loop **offline** (a mock/scripted model, no network) and shows
   the agent's `setPriority` tool-call getting folded through the boundary into
   domain state, committed to the bus as a signed `SetPriority:Agent` command,
   and its `Log` effect performed.

2. **Replay is deterministic.** Because the bus is append-only and the fold is
   pure, a recorded timeline re-folds to a value-identical `State` and an
   identical effect list every time — with no model, network, or clock.
   `ReplayTest` folds a recorded session **twice** and asserts the two results
   are identical before asserting the golden state/effects.

3. **The gate holds — both ways.** The fold's `EscalationConfirmed` arm fires the
   irreversible `PageOncall` effect **only** when `by == Actor.Human`. The
   boundary stamps the literal `Actor.Agent` onto every agent step, so an
   agent-issued confirm carries `Agent` and can never reach the page — it folds
   to a `Diag("denied: agent self-confirm")` instead, and the ticket's status is
   left untouched. `GateTest` asserts both directions: a host (`Human`) confirm
   pages; an agent self-confirm is denied with no page. The `confirmEscalation`
   tool is *also* deliberately never exposed to the agent — but even a forged
   agent confirm would be denied by the gate.

The demo (`npm run demo` / `./gradlew run`) shows the whole thing in one script:
the agent sets priority through the real loop, a host requests escalation, an
agent self-confirm is denied, and finally a host confirm fires the page.
