# Transcript — Write streaming price-watch client (with skill)

## Task

> Kotlin price-watch feature for a trading app: a class that connects to an SSE
> price stream at `https://gw.acme.trading/v1/stream/{symbol}`, exposes incoming
> price ticks to the UI as they arrive, retries on transient network errors,
> shuts down cleanly when the user leaves the screen, uses Ktor for HTTP, and is
> unit-testable.

## Tier classification

Followed `kotlin-best-practices/SKILL.md` → "First, pick the tiers that apply."

- This is an **app feature** — a class consumed by the app's own UI layer, not a
  library other teams compile against, not multiplatform `commonMain` with
  `expect`/`actual`, not published to Maven Central.
- Decision question from the skill: *"can a caller you don't control compile
  against this?"* → No.
- **Tier 0 (Core) only.** I deliberately did **not** raise Tier 1 (ABI dumps,
  `explicitApi()` strict, overload-don't-append) or Tier 2/3 concerns — the
  skill explicitly says imposing those on an app class is noise that buries the
  real feedback. (I did still write `public`/explicit return types out of habit;
  that's harmless and makes the surface clear, but I did not gate on an ABI dump
  or treat data-class evolution as a binary-compat hazard.)

**Block loaded:** `references/core-kotlin.md` (Tier 0). Sections applied:
Coroutines & Flow, Serialization, Error Handling & Resilience, Runtime
Performance, Ergonomics & Type Safety, Testing, Security & Logging Hygiene.

## Reconnaissance (Read Before Theorizing)

- Read the repo's `gradle/libs.versions.toml`: **Kotlin 2.4.0, Ktor 3.5.0,
  coroutines 1.11.0, serialization 1.11.0**. Wrote to those exact versions.
- Read the repo's existing SSE idiom (`Util.kt` `parseJsonEventStream`,
  `TestServer.kt` `MockEngine` usage) to match conventions: `MockEngine` +
  `respond(content = ByteReadChannel(...), ContentType text/event-stream)`,
  stdlib `kotlin.time.Clock` injection (already used across the codebase).
- The repo does **not** depend on `ktor-client-sse`; it hand-parses SSE frames.
  For a self-contained price-watch deliverable I chose Ktor 3.x's first-class
  `SSE` client plugin (idiomatic for the version, frees me from re-implementing
  frame buffering). This adds the `ktor-client-sse` artifact.
- **Verified the exact Ktor 3.5.0 SSE API via live Exa search** rather than
  trusting training: `install(SSE)`, `client.sseSession { url(...) }`,
  `incoming: Flow<ServerSentEvent>`, `event.data`, and crucially that failures
  throw **`SSEClientException`** (an `IllegalStateException`, *not* a
  `ResponseException`) carrying `response: HttpResponse?`. This last fact changed
  my error-mapping code (see Decision 4).

## Key decisions and the WHY

### 1. `ticks(symbol): Flow<PriceTick>` — non-suspend, returns a cold Flow
Core/Coroutines §3: streaming = a non-suspend function returning a cold `Flow`.
Nothing connects until the UI subscribes; cancelling the collector tears the
connection down. This is also the clean-shutdown answer: **the screen leaving =
its scope cancelling = the flow's collector cancelling = SSE session + HTTP call
cancelled.** No `stop()`/`close()` lifecycle to forget. (The class holds no
scope of its own, so Coroutines §13's "expose close()" doesn't apply — there's
nothing that outlives a call.)

### 2. `channelFlow { ... send() }`, not `flow { ... emit() }`
Core/Coroutines §4. The SSE session collects `incoming` in its **own**
coroutine; emitting straight to a `flow {}` from there violates Flow's
context-preservation invariant → `IllegalStateException("Flow invariant is
violated")`, which **can pass on JVM and fail only on Kotlin/Native**.
`channelFlow` + `send` is concurrency-safe across that producer/collector
boundary. `.flowOn(dispatcher)` is applied as the **last** operator to set the
dispatcher — never `withContext` around `send`.

### 3. Cancellation correctness
Core/Coroutines §1 and Errors §1. The retry loop's `catch (e: Throwable)` has
`catch (e: CancellationException) { throw e }` **first**, and the broad catch
calls `coroutineContext.ensureActive()` as its first statement. Without this, a
collector that left the screen (or the overall-deadline `withTimeout` firing)
would be swallowed and the SSE coroutine would leak. I used explicit try/catch,
**not `runCatching`** (Core/Coroutines §2 — stdlib `runCatching` captures
`CancellationException` into `Result.failure`).

### 4. Machine-readable, status-classified retry with full-jitter backoff
Core/Errors §2–§9.
- `PriceStreamError` carries `kind`, `status: Int?`, `isRetryable`, `cause`, and
  the full `attempts` history — the retry layer branches on **fields**, never a
  message substring.
- `toPriceStreamError` classifies: transport drops + 408/425/429/5xx →
  retryable; 400/401/403/404/422 → terminal (fail fast). Status is recovered
  from **both** `SSEClientException.response` and `ResponseException.response`
  (the live-searched fact — SSE throws the former, generic HTTP the latter).
- Backoff is `random(0, min(maxDelay, base·2^n))` — **full jitter** to avoid a
  thundering-herd reconnect spike, plus a `maxRetries` cap and an
  `overallDeadline` `withTimeout`. The deadline is enforced both at each failure
  and downstream (`withOverallTimeout`) to also catch a connection that hangs
  mid-stream rather than erroring.
- **Never returns a mock/last-known tick on failure** (Errors §9) — on a trading
  screen a canned fallback is silent stale data. It surfaces a typed error.
- A successful tick resets `attempt`/`collected` so a long-lived stream that
  blips hours apart doesn't accumulate toward the cap.

### 5. Serialization
Core/Serialization §1, §5. One `Json` instance built once per client (private
val — the wire format is this transport's concern, not a UI knob, so it's *not*
a constructor parameter). `PriceTickWire` is a separate DTO from the UI-facing
`PriceTick` and is annotated **per-class** with `@JsonIgnoreUnknownKeys`
(forward-compat: new server fields don't crash older app builds) rather than the
global `ignoreUnknownKeys` flag. A single malformed frame is skipped (returns
`null`), not fatal to the whole session.

### 6. Injected seams for testability
Core/Coroutines §6 + Testing §3–§4. Constructor injects `HttpClient`,
`CoroutineDispatcher`, `kotlin.time.Clock`, and `Random`, each with a production
default. Tests substitute a `StandardTestDispatcher`, a Ktor `MockEngine`, and a
seeded `Random(0)` — deterministic backoff, no real network, no real time. The
class explicitly does **not** own the `HttpClient` (documented) — the host
installs the engine + plugin and closes it (Security §4 — resource ownership).

### 7. Ergonomics & type safety
Core/Ergonomics. `Symbol` is a `@JvmInline value class` with `init` validation
(Performance §1 — zero-cost typed id). Outcome space modeled as the `sealed`-ish
`enum PriceStreamErrorKind`. No behavior-switching `Boolean` params. KDoc on the
public surface, and the `@sample` points at a **real compiled** function
(`samples/collectPriceTicks`) rather than a fenced code block that would rot
(Ergonomics §7).

### 8. Security / logging hygiene
Core/Security §1–§2. **No `println`/`Log.d`** anywhere — diagnostics would route
through an injected logger if needed; I added none rather than hard-code a sink.
Raw frame bodies are never logged; the typed error carries data for
classification but nothing is emitted to a log sink.

## Review-mode pass over my own output

Walked the relevant smells after writing:
- Broad catch rethrows `CancellationException` first ✓
- No `runCatching` around suspend ✓
- `Flow`-returning fn is not `suspend` ✓; producer uses `channelFlow`/`send` ✓
- `.flowOn` is the last operator ✓
- Backoff has random term + `min(.., cap)` + `maxRetries` + `withTimeout` ✓
- No mock/default returned on failure ✓
- `Json` built once ✓; `@JsonIgnoreUnknownKeys` per-class, not global ✓
- Tests use `runTest` (not `runBlocking`), `backgroundScope` for the infinite
  stream, `MockEngine`, injected dispatcher/clock/random ✓
- Fixed during review: removed an `internal` `DefaultJson` that was used as a
  default value of a `public` constructor param (visibility error) by making the
  codec a private val; removed a stray `awaitClose` after a completing
  `withTimeout`; corrected error mapping to read `SSEClientException.response`.

## Files produced

- `outputs/PriceStreamClient.kt` — the client (cold-Flow `ticks()`, reconnect
  loop, deadline).
- `outputs/PriceModels.kt` — `Symbol`, `PriceTick`, `PriceTickWire`,
  `PriceStreamError(Kind)`, `RetryPolicy` + jittered backoff, error mapper.
- `outputs/PriceStreamSamples.kt` — the `@sample` target showing UI-side
  collection + scope-cancellation teardown.
- `outputs/PriceStreamClientTest.kt` — unit tests (`runTest` + `MockEngine`):
  parse-in-order, skip-malformed, retry-then-succeed, terminal-no-retry,
  exhaust-retries-with-history, collector-cancellation-teardown, overall-deadline.

## Gradle (for context — not part of the deliverable)

Beyond what the repo already has, this adds:
`implementation("io.ktor:ktor-client-sse:3.5.0")` and (test)
`io.ktor:ktor-client-mock`, `org.jetbrains.kotlinx:kotlinx-coroutines-test`.
