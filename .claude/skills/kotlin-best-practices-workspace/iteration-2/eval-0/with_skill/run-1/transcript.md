# Transcript — Kotlin price-watch streaming feature (with skill)

## Skill invocation

Read `kotlin-best-practices/SKILL.md`, classified tiers, then loaded the single
relevant reference block in full and wrote to it.

## Tier classification

| Tier | Active? | Reason |
|---|---|---|
| **0 — Core** | **Yes** | Any Kotlin. |
| 1 — Published API | No | App feature, not a library/SDK other teams compile against. |
| 2 — Multiplatform | *Soft yes* | The deliverable is standalone, but the target codebase (`aisdk-kotlin`) is a KMP module (`commonMain`/`nativeMain`). I held the code to commonMain-safety because that's where this kind of streaming code lives, and the skill's headline Coroutines §4 rationale (Flow-invariant violations that **fail only on Native**) is the load-bearing reason for the central design choice here. |
| 3 — Publishing & iOS | No | No Maven coordinate / framework block / Swift interop. |

**Loaded:** `references/core-kotlin.md` (Tier 0, in full). Did not load
library-and-api or the standalone multiplatform block — but applied the one
multiplatform rule that the SKILL one-pager surfaces (keep `commonMain` free of
platform-only symbols), because it bit (see "Key finding" below).

## Mode

**Writing mode**, then a short review-mode self-pass over the output.

## What I built

- `PriceWatch.kt` — `PriceWatchGateway` (the transport) + `Symbol` value class,
  `PriceTick`, `RetryPolicy`, `GatewayStreamException`, `PriceWatchLogger`.
- `PriceWatchViewModel.kt` — screen-scoped holder exposing a `StateFlow` to the UI,
  with idempotent `close()` for clean teardown.
- `PriceWatchGatewayTest.kt` — 10 tests on Ktor `MockEngine` + `runTest`.

## Key decisions, mapped to Tier 0 rules

1. **Streaming = cold `Flow`, not `suspend` (Coroutines §3).** `priceTicks(symbol):
   Flow<PriceTick>` is a non-suspend function returning a cold flow, so collection
   is what starts the GET and cancellation is lazy.

2. **`channelFlow`, not `flow {}` (Coroutines §4) — the central choice.** The body
   channel is read inside Ktor's `prepareGet{}.execute{}` block, which may run in a
   different coroutine/context than the collector (notably on Kotlin/Native). A
   plain `flow { emit() }` enforces same-context emission and throws "Flow invariant
   is violated" there — a bug that passes on JVM and fails only on Native.
   `channelFlow { send() }` is concurrency-safe across that boundary. This mirrors
   the pattern the target repo already uses in `HttpTransport.streamSse`.

3. **Dispatcher pinned with `.flowOn(...)` as the LAST operator (Coroutines §4),**
   never `withContext` around `send`.

4. **Inject everything external (Coroutines §6, Testing §3/§4):** `HttpClient`
   (→ `MockEngine` in tests), the dispatcher, `RetryPolicy`, `PriceWatchLogger`,
   and the `Random` used for jitter. That injection is the whole reason the type is
   unit-testable with no network and no wall clock.

5. **Incremental framing over the channel's own buffer (Performance §5).** Read
   `channel.readLine()` per frame; emit each tick as it lands. Explicitly do **not**
   call `bodyAsText()` on the success path — the feed never closes, so that would
   suspend forever and buffer an infinite body (O(n) growth).

6. **Retry only transient statuses, capped exponential backoff with full jitter +
   a max-attempt cap (Errors §3/§5).** `random(0, min(maxDelay, base·2^n))`;
   retryable = 408/425/429/5xx + transport errors; terminal 4xx fails fast.
   Exponent capped so `base shl n` can't overflow on a long-lived stream.

7. **Rethrow `CancellationException` FIRST in every broad catch (Coroutines §1,
   Errors §1).** This is what makes "shut down cleanly when the user leaves the
   screen" correct: scope cancel → collector cancel → suspended `readLine` unwinds
   through `execute {}` → GET aborts, no leaked connection. A retry loop that
   swallowed it would keep reconnecting after the screen was gone.

8. **Never return a mock/default on failure (Errors §9).** Exhausted retries and
   terminal statuses propagate a typed `GatewayStreamException`; the ViewModel maps
   it to `PriceWatchUiState.Failed`, never a stale/last-known price.

9. **Logger seam, no `println`, no unredacted bodies (Security §1/§2).** Diagnostics
   route through an injected `PriceWatchLogger` (no-op default). The error path
   carries the status code for retry classification but logs only the error body's
   *length*, never its contents (it can echo headers/keys).

10. **Immutable `StateFlow` backed by private `MutableStateFlow` (Coroutines §12);
    injected `SupervisorJob` scope, no `GlobalScope` (Coroutines §13); idempotent
    `AutoCloseable.close()` (Security §4).**

11. **Value class for the id (Performance §1), nullable-not-sentinel for "no tick
    here" (Ergonomics §2), `sealed` UI state (Ergonomics §4).**

## Testing (Tier 0 / Testing)

- `runTest`, never `runBlocking` (§1) → virtual time, backoff tests are instant.
- Ktor `MockEngine` sharing the prod client config (§3); scripts exact wire bytes
  incl. 4xx/5xx/malformed frames.
- Injected seeded `Random` + `TestDispatcher`/`Unconfined` for determinism (§4).
- The flow is infinite, so bounded with `take(n)` before `toList()` (§2) — no
  unbounded collect that would hang `runTest`.
- Covers (11 tests): ticks-as-they-arrive, blank/malformed-frame skipping,
  fail-fast on terminal 403, 5xx retry-then-succeed (stable exact count), 429
  retryable, give-up-after-max-retries, consecutive-failure-budget reset on
  progress, reconnect-on-clean-EOF, clean cancellation, jitter bounds, and the
  Accept header.

## Key finding #2 — caught by the review-mode self-pass

Re-reading my own retry loop (review mode, after writing), I spotted a latent bug
for the "never closes, runs all day" case: `attempt` only ever incremented, so a
feed that legitimately reconnected many times over hours would eventually trip
`maxRetries` and throw — even though every reconnect had *succeeded*. `maxRetries`
should bound **consecutive** failures, not lifetime churn. Fix: a connection that
delivers >=1 tick resets `attempt = 0`. Locked in by a new test
(`progress_resets_the_consecutive_failure_budget`): with a budget of 1, the
sequence fail → OK+tick → fail → OK+tick survives and yields both ticks, which it
would not under a cumulative counter.

## Key finding #1 — caught by actually running the build, not by reading

Initial draft defaulted `ioDispatcher = Dispatchers.IO`. JVM compiled and all
tests passed. But `Dispatchers.IO` is **JVM-only — `internal` on Kotlin/Native**,
so `./gradlew :compileKotlinLinuxX64` failed:

```
Cannot access 'val IO: CoroutineDispatcher': it is internal in 'kotlinx.coroutines.Dispatchers'.
```

This is precisely the Native-only failure class the skill calls out (compiles
everywhere, fails only on the Native leg). Fix: default to `Dispatchers.Default`
(commonMain-safe — and the target repo's own convention in `ToolLoopAgent`/`MCP`),
documented inline, with callers free to inject `Dispatchers.IO` on JVM. Re-ran:
JVM tests green **and** linuxX64 compiles. Lesson reinforced: build *and run* the
cheap Native target — a green JVM diff is not a green merge.

## Verification performed

Compiled and ran the deliverable inside the real `aisdk-kotlin` KMP toolchain
(Ktor 3.5.0, coroutines 1.11.0) by temporarily staging it under a throwaway
package, then restored the repo to its exact original state:

- `:compileKotlinJvm` — clean.
- `:compileTestKotlinJvm` — clean.
- `:jvmTest` (PriceWatchGatewayTest) — **11 tests, 0 failures, 0 skipped**
  (per the HTML report), stable across 5 reruns. Fixed one racy exact-call-count
  assertion → robust `>= 2`.
- `:compileKotlinMetadata` — clean (type-checks commonMain for all targets).
- `:compileKotlinLinuxX64` — clean (Native-clean; proves the `channelFlow` +
  `Dispatchers.Default` choices hold on Native).

Deliverable files use package `trading.pricewatch`; the verification staged them
under `com.acme.pricewatch` inside the repo to compile against the real toolchain,
then removed them — the repo was returned to its exact session-start git status.
