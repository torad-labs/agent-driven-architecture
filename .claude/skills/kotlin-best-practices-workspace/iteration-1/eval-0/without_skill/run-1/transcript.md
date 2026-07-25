# Price-watch SSE client — transcript (no skill)

Task: Kotlin price-watch feature. Connect to SSE price stream at
`https://gw.acme.trading/v1/stream/{symbol}`, expose ticks to the UI as they
arrive, retry on transient network errors, shut down cleanly when the user leaves
the screen, use Ktor, be unit-testable.

Built using only my own Kotlin knowledge (no external skill consulted).

## Approach / design decisions

**Requirements → mechanisms**

1. **Connect to SSE / Ktor** → Ktor `HttpClient` with the `SSE` plugin installed;
   `httpClient.sse { incoming.collect { ... } }`.
2. **Expose ticks as they arrive** → a **cold** `Flow<PriceTick>`. Cold matters: the
   connection opens only when a collector starts and is bound to that collector's
   scope. The UI layer (a ViewModel) folds it into `StateFlow`s for the view.
3. **Retry transient errors** → `Flow.retryWhen { cause, attempt }` with an injected
   `BackoffStrategy` (default = exponential backoff with full jitter, capped).
   Crucially the predicate classifies the failure first and only retries
   *transient* ones.
4. **Clean shutdown on leaving the screen** → structured concurrency. Because the
   flow is cold and collected in a lifecycle scope (`viewModelScope` /
   `launchIn(scope)`), cancelling that scope cancels the collection, which
   propagates into `httpClient.sse {}` and tears the connection down. No manual
   `close()` to forget. `CancellationException` is explicitly classified as
   non-transient so the retry loop never swallows it.
5. **Unit-testable** → everything injectable: the `HttpClient` (tests use Ktor's
   `MockEngine`), the `PriceTickDecoder`, the `BackoffStrategy`, and `maxRetries`.
   `delay` runs under `runTest` virtual time so the suite never really sleeps. The
   decoder and backoff math are pure and tested in isolation.

**Correctness points I deliberately got right**

- **Transient vs permanent classification.** Ktor's SSE plugin throws
  `SSEClientException` (an `IllegalStateException`, *not* an `IOException`) carrying
  the `HttpResponse` when the handshake fails. I verified this against the Ktor docs
  rather than assuming. So `isTransient()` classifies `SSEClientException` by
  `response.status` (5xx → retry, 4xx/unknown → give up), and falls back to the
  wrapped cause for transport-level failures with no response. I also handle
  `ServerResponseException`/`ClientRequestException` (for clients with
  `expectSuccess = true`), `HttpRequestTimeoutException`, and raw `IOException`.
- **Cancellation cooperation.** `CancellationException -> false` is the first arm of
  the `when`, so structured-concurrency cancellation is never retried.
- **Malformed payloads are permanent.** `SerializationException -> false` — retrying
  re-reads the same bad bytes.
- **Full jitter backoff.** Avoids a thundering-herd reconnect storm when many
  clients drop off the same gateway at once.
- **Flow `emit` context.** `emit` is called inside the `sse {}` lambda, which is a
  suspend call in the *same* coroutine as the `flow {}` builder — no illegal
  cross-coroutine emission.
- **Caller owns the `HttpClient`** — the class never closes a client it didn't create.

## Mid-build corrections

- Initially classified failures via a custom `PriceStreamHttpException` that the real
  Ktor path would never throw. Searched the Ktor docs, confirmed the real type is
  `SSEClientException`, and rewrote `isTransient()` + the tests accordingly.
- Removed a clumsy `collect()` shadow helper in the ViewModel in favour of
  `launchIn(scope)`.

## Files produced

- `outputs/PriceWatchClient.kt` — core: `PriceTick`, `PriceStreamState`,
  `PriceTickDecoder` + `JsonPriceTickDecoder`, `BackoffStrategy` +
  `ExponentialBackoff`, `PriceWatchClient`, `isTransient()`.
- `outputs/PriceWatchViewModel.kt` — example UI binding showing lifecycle-scoped
  collection and clean teardown.
- `outputs/PriceWatchClientTest.kt` — `MockEngine` + `runTest` tests: tick parsing,
  URL construction, retry-on-5xx, no-retry-on-4xx, give-up-after-maxRetries, plus
  isolated decoder and backoff tests.

## Dependencies assumed (Gradle)

```kotlin
plugins {
    kotlin("jvm")                       // or kotlin("multiplatform")
    kotlin("plugin.serialization")
}
dependencies {
    implementation("io.ktor:ktor-client-core:3.x")
    implementation("io.ktor:ktor-client-cio:3.x")          // any engine
    implementation("io.ktor:ktor-client-content-negotiation:3.x")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.x")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.x")
    testImplementation("io.ktor:ktor-client-mock:3.x")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.x")
    testImplementation(kotlin("test"))
}
```

`public`/`explicitApi` modifiers are present so this drops cleanly into a library
module with `explicitApi()` enabled; harmless in an app module.

## Final code

### PriceWatchClient.kt

```kotlin
// see outputs/PriceWatchClient.kt
```

### PriceWatchViewModel.kt

```kotlin
// see outputs/PriceWatchViewModel.kt
```

### PriceWatchClientTest.kt

```kotlin
// see outputs/PriceWatchClientTest.kt
```
