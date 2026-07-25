# Transcript — review of `PriceStreamRepository.kt` (with skill)

## Mode
**Review mode** (auditing an existing file before merge), per SKILL.md "Two modes".

## Tier classification (SKILL.md "First, pick the tiers that apply")
Walked the tier selector against the file:

- Package `com.acme.trading.data`; a plain `class PriceStreamRepository(private val http: HttpClient)`.
- Consumers are the **watchlist screen and the alerts service** — internal, same app. No caller "I don't control" compiles against this surface.
- No `data class`, no `explicitApi()`, no committed `api/*.api` dump implied.
- No `commonMain` / `expect` / `actual` / multiple `kotlin {}` targets.
- No `framework {}` / XCFramework / `publishing {}` / Maven coordinate.

**Decision: Tier 0 (Core) only.** Tiers 1 (Published API), 2 (Multiplatform), 3 (Publishing & iOS) deliberately NOT applied — raising ABI/`explicitApi`/KMP/publishing rules here would be noise per the skill's own guidance ("Don't raise ABI… they don't apply and they bury the real feedback").

## Reference blocks loaded
- `references/review-framework.md` — the Rejection Framework smell tables + PR checklist (review mode's primary tool).
- Cross-referenced `references/core-kotlin.md` themes via the one-screen principles in SKILL.md.

## Smell tables walked (review-framework.md, Tier 0 only)
| Table | Rows that fired |
|---|---|
| **Core — Coroutines & Flow** | `GlobalScope.launch/async` (#4); `catch(Exception)` w/o rethrow (#3); `runCatching { suspend }` (#5); hardcoded `Dispatchers.X` (#8); busy-loop / blocking-in-loop pacing (#1, via resilience) |
| **Core — Serialization** | `Json { }` inline at call site (#6); global `ignoreUnknownKeys` (#6) |
| **Core — Error Handling & Resilience** | returning a default/mock on failure → `0.0` (#5); jitter-free/no-cap retry, here a free-running `while(true)` (#1); swallowing cancellation (#3) |
| **Core — Runtime Performance** | re-decode whole stream per chunk via `.split("\n")` (#2); `acc += delta` string concat in a loop (#2) |
| **Core — Ergonomics & Type Safety** | reviewed — sentinel-value angle of the `0.0` fallback noted under #5 |
| **Core — Security & Logging Hygiene** | reviewed — no `println`/secret-logging present; lifecycle/`close()` gap noted under #4 (no `AutoCloseable` for the scope) |
| **Build / Tooling / Testing** | hardcoded `Dispatchers.IO` untestable (#8); recommended `runTest`+`backgroundScope` and `MockEngine` tests (closing note) |

Tables NOT walked: Library — API Design & Compatibility (Tier 1), Multiplatform (Tier 2), Publishing & iOS Interop (Tier 3). Out of tier.

## PR checklist applied
Ran the **Core (Tier 0)** group of the PR Review Checklist only. Tier 1/2/3 groups skipped per classification.

## Findings summary
9 findings. Blocking: #1 busy-loop no delay, #2 re-scan/re-emit O(n²), #3 swallowed CancellationException, #4 GlobalScope, #5 runCatching-around-suspend + `0.0`-on-failure. Suggestions (same-PR): #6 inline `Json`, #7 unguarded shared `cache`, #8 hardcoded dispatcher, #9 unsafe parse (`as`/`!!`/`toDouble`).

The reported symptom ("streaming felt off / prices freeze") is attributed to the #1+#2+#3 cluster in `stream()`, with #5's `0.0` fallback flagged as the most dangerous latent bug (fake zero price into the alerts service).

## Honesty notes on detectors (per SKILL.md honesty rule)
- #1 "busy-loop no delay" and #2 re-emit logic: **no reliable single grep**; manual review backed by the resilience/performance rows.
- #5 `SuspendFunSwallowedCancellation`: detekt rule **needs type resolution**, may not fire in CI without it — flagged as manual-review-backed.
- #3 / #4: genuinely detekt-/grep-catchable (`SwallowedException`, `GlobalCoroutineUsage`, `grep GlobalScope.`).
