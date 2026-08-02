# Kotlin price-watch feature — transcript

## Task

Stream newline-delimited `price:<number>` lines from a long-lived plain-HTTP GET
(`https://gw.acme.trading/v1/stream/{symbol}`) that never closes. NOT SSE — read the
response body channel directly and frame the lines. Expose ticks to the UI as they
arrive, retry on transient network errors, shut down cleanly on screen-exit, using
Ktor, unit-testable.

## Approach

1. **Studied the existing codebase first** (it's a real Ktor KMP library: `aisdk-kotlin`).
   The project already has a battle-tested incremental channel-read pattern in
   `HttpTransport.kt::streamSse`: `client.prepareRequest{}.execute{}` keeps the body a
   live channel; `response.bodyAsChannel().readLine()` yields each frame as it lands;
   the whole thing is wrapped in `channelFlow` (not plain `flow`) for a documented
   Kotlin/Native reason — on some engines `execute{}` runs its body in a different
   coroutine/context than the collector, and `flow { emit() }` throws "Flow invariant
   is violated" there while `channelFlow { send() }` is safe. I matched that idiom.
   The repo also already has `RetryPolicy` + `retryWithExponentialBackoff` in `Util.kt`
   that correctly re-throws `CancellationException` — I followed the same discipline.
   Tests use `MockEngine` + `runTest` + Turbine, with a streaming `ByteChannel(autoFlush)`
   helper for never-closing-connection simulation. I matched those too.

2. **Verified the Ktor 3.5.0 API surface against the resolved jars** (`javap` on the
   cached jars) before writing: `readUTF8Line(ByteReadChannel, max, …)` with a default
   overload, `prepareGet(client, url, block)`, `encodeURLPathPart`, and the MockEngine
   `respond(scope, ByteReadChannel, status, headers)` / `respondError(...)` overloads
   all exist. No guessing.

## Design

`PriceWatch.kt`:

- `PriceTick(symbol, price)` — the value exposed to the UI.
- `parsePriceLine(symbol, line): PriceTick?` — **pure**, side-effect-free framing of one
  wire line. Returns null for blanks / keep-alives / malformed numbers (a stray line must
  never tear down a long-lived subscription). Unit-testable with zero infrastructure.
- `isTransient(Throwable): Boolean` — retry classifier. `CancellationException` →
  not transient (screen-exit, shut down now). `PriceStreamHttpException` → terminal (a
  4xx won't self-heal). Everything else → transient (classified by *exclusion* so it's
  multiplatform-safe, not matching a JVM-only `IOException`).
- `PriceWatchClient(httpClient, baseUrl, reconnect)` — `httpClient` is **injected** (test
  passes a `MockEngine`-backed client; caller owns the lifecycle). `stream(symbol)` returns
  a **cold** `Flow<PriceTick>` via `channelFlow`:
  - **As-they-arrive:** `prepareGet{}.execute{}` + `bodyAsChannel().readUTF8Line()`.
  - **Retry:** capped exponential backoff, bounded by `maxRetries` *consecutive* failures;
    a session that delivered data resets the budget.
  - **Clean shutdown:** cancelling the collector throws `CancellationException` out of the
    suspended read, unwinds through `execute{}`, aborts the request. Never retried.

`PriceWatchTest.kt` — 11 tests: pure parsing (6) + client behavior (5: incremental emit
from a finite body, incremental emit + cancel from a live never-closing `ByteChannel`,
retry-then-resume across a drop, give-up after max failures, terminal 4xx not retried).

## Verification — and a real bug it caught

I refused to ship on "it compiles." I built an **isolated** harness (`/tmp/pw_isolated`)
with `kotlinc` 2.3.21 + the project's resolved Ktor/coroutines/Turbine jars, because a
**concurrent agent run was mutating the same `com/acme/pricewatch` package in the shared
Gradle tree** (I saw its `PWGateway.kt`/`PWViewModel.kt` appear where I'd staged mine).
Isolation removed that interference and Kover's instrumentation OOM noise.

Running the tests surfaced a genuine **OutOfMemoryError** in exactly one test:
`gives_up_after_max_consecutive_transient_failures`. Root cause (read, not guessed): when
the gateway *accepts* a connection but closes it immediately with **no data**, that path
threw nothing — `connectAndStream` returned normally with `produced=false` — so my
failure-accounting never ran and the loop reconnected forever. Under `runTest` virtual
time the backoff `delay()` is free, so it was an unbounded tight reconnect loop → OOM.
This is a real production hazard (a reconnect storm against a flapping endpoint), not just
a bad test.

**Fix (in production code, not the test):** treat "connection ended having produced
nothing" as a transient failure — `throw EmptyStreamException` — routed through the same
budget/backoff accounting as any transient error, and moved the backoff `delay()` into the
failure path so successful reconnects are immediate. Updated the test to assert the correct
contract: an always-empty endpoint exhausts the budget (1 + maxRetries attempts) and then
surfaces `EmptyStreamException` instead of looping.

## Final results

- `kotlinc` isolated compile: clean.
- Tests: **11/11 pass**, 0 OOM, ~0.15s (parsing 6/6, client 5/5).
- Real-project compile under the project's strict `explicitApi()`
  (`./gradlew compileKotlinJvm`): clean (verified via a uniquely-named package to avoid the
  concurrent run, then removed).
- Cleaned up all my staged copies from the shared tree; left the concurrent run's files
  and all tracked repo files untouched.

## Deliverables

- `outputs/PriceWatch.kt` — implementation.
- `outputs/PriceWatchTest.kt` — 11 unit tests (MockEngine + runTest + Turbine idioms).
