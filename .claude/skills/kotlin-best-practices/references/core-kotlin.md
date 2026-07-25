# Core Kotlin (Tier 0 — applies to all Kotlin)

These rules apply to *every* Kotlin file — apps, scripts, libraries, any target.
Each rule is imperative, has a one-line *why*, and a *how to detect* (with an
honest note when no static check exists). Library/multiplatform/publishing
concerns live in the other reference blocks.

## Contents
- [Coroutines & Flow](#coroutines--flow)
- [Serialization (kotlinx.serialization)](#serialization)
- [Error Handling & Resilience](#error-handling--resilience)
- [Runtime Performance](#runtime-performance)
- [Ergonomics & Type Safety](#ergonomics--type-safety)
- [Testing](#testing)
- [Security & Logging Hygiene](#security--logging-hygiene)

---

## Coroutines & Flow

Cancellation correctness and main-safety are load-bearing, not polish — a single
swallowed cancellation leaks work across an entire app.

1. **Rethrow `CancellationException` first in every broad catch.** It is the
   structured-concurrency cancellation signal; swallowing it leaves coroutines
   running after their scope is gone, defeats `withTimeout`, and leaks work. Make
   `coroutineContext.ensureActive()` (or `if (e is CancellationException) throw e`)
   the first statement of any `catch (e: Throwable/Exception)`. *Detect:* detekt
   `SwallowedException` configured so `CancellationException` is **not** in
   `ignoredExceptionTypes`; review every broad catch.

2. **Never wrap a `suspend` call in stdlib `runCatching`.** It catches `Throwable`
   and never rethrows, so it captures `CancellationException` into
   `Result.failure` — faking a recoverable error and breaking cancellation. Use a
   cancellation-aware helper (`runSuspendCatching` that rethrows
   `CancellationException`) or explicit try/catch with `ensureActive()` first.
   *Detect:* detekt `SuspendFunSwallowedCancellation` — but note it needs **type
   resolution**; a classpath-less detekt run silently matches nothing, so back it
   with review + `runTest` cancellation tests.

3. **One-shot = `suspend fun`; streaming = a non-suspend function returning a cold
   `Flow`.** A `Flow`-returning function must never itself be `suspend` — that
   does hidden eager work at call time and breaks lazy cancellation. *Detect:*
   detekt `SuspendFunWithFlowReturnType`; grep `suspend fun .*: *Flow<`.

4. **Set a Flow's dispatcher with `.flowOn(...)` as the last operator — never
   `withContext`/`launch`/`async` around `emit()`.** Emitting from a different
   coroutine/context than the collector violates Flow's context-preservation
   invariant and throws `IllegalStateException("Flow invariant is violated")`.
   This can pass on JVM and fail only on Kotlin/Native, where the producer may run
   in a different coroutine. When you genuinely must produce from a callback or a
   different coroutine (e.g. reading a streaming HTTP body inside a transport's
   `execute {}` block), use `channelFlow { ... send(x) }` instead of
   `flow { ... emit(x) }` — `channelFlow` decouples producer from collector via a
   channel and is concurrency-safe across that boundary. *Detect:* no reliable
   static check (a grep for `emit(` noises on every legal top-level emit); review
   `emit(` appearing inside a `withContext`/`launch`/`async` lambda within a
   `flow {}`, and exercise the flow with a `runTest` collection test.

5. **Make every `suspend` function main-safe.** Wrap blocking I/O in
   `withContext(ioDispatcher)` and heavy CPU in `withContext(defaultDispatcher)`,
   so callers can invoke from `Dispatchers.Main` without freezing. The class doing
   the work owns the dispatcher choice. *Detect:* detekt `SleepInsteadOfDelay`;
   grep `Thread.sleep`/`runBlocking` in non-test source.

6. **Inject dispatchers; never hardcode `Dispatchers.X` in reusable code.**
   Constructor params with production defaults (`ioDispatcher: CoroutineDispatcher
   = Dispatchers.IO`) let tests substitute a single-scheduler `TestDispatcher`.
   *Detect:* grep `Dispatchers.(IO|Default|Main)` inside class bodies that aren't
   the injected default.

7. **Bound shared I/O concurrency with one reused
   `Dispatchers.IO.limitedParallelism(n)` view; never `newFixedThreadPoolContext`.**
   `Dispatchers.IO` is elastic; `limitedParallelism(n)` returns a *view* capping
   parallelism while sharing the pool. Create it **once** into a stable `val` and
   reuse it — each call makes an independent view that doesn't share the cap. It's
   a parallelism limit, not a mutex. *Detect:* grep `newFixedThreadPoolContext`;
   `limitedParallelism(` called per-request rather than once.

8. **Use `Mutex.withLock` for a suspend-friendly critical section; never
   `synchronized`/`ReentrantLock` in common/multiplatform code.** A coroutine
   holding a JVM monitor across a suspension point blocks a pooled thread, and
   `synchronized`/`ReentrantLock` have no Native/JS implementation. For lock-free
   shared state prefer an atomic CAS loop. *Detect:* grep
   `synchronized(`/`ReentrantLock` in `commonMain`.

9. **Make CPU-bound loops cooperatively cancellable.** Call `ensureActive()` or
   `yield()` per iteration in any loop that doesn't already call a cancellable
   suspend function. The `flow { }` builder adds this per emission; raw `while`/
   `for` loops do not.

10. **Bridge callbacks with `callbackFlow`/`channelFlow` and `awaitClose` as the
    final statement.** Emit via `trySend`; unregister in `awaitClose { ... }`.
    Omitting `awaitClose` throws or leaks the callback. Single-shot callbacks →
    `suspendCancellableCoroutine` + `invokeOnCancellation`. *Detect:* every
    `callbackFlow {`/`channelFlow {` must contain `awaitClose(`.

11. **Call `shareIn`/`stateIn` exactly once into a stable `val`.** Each call spins
    a new upstream coroutine and connection; calling from a getter or per-request
    function multiplies and leaks. Prefer `SharingStarted.WhileSubscribed(5000)`;
    apply `catch`/`retry`/`onStart` *before* `shareIn`.

12. **Expose immutable `Flow`/`StateFlow`/`SharedFlow`, backed by a private
    `Mutable*`.** Centralizes mutation in the owning class; never leak `Mutable*`.

13. **Never use `GlobalScope`; inject a `SupervisorJob`-backed scope for work that
    outlives a call,** and expose a `close()` that cancels it. `GlobalScope` has no
    parent, no cancellation, no test seam. Use `coroutineScope`/`supervisorScope`
    for call-scoped fan-out. *Detect:* detekt `GlobalCoroutineUsage`; grep
    `GlobalScope.`.

14. **Choose `supervisorScope` vs `coroutineScope` deliberately for fan-out.**
    `supervisorScope` = one child fails, siblings survive (partial results);
    `coroutineScope` = one child fails, all cancel (transaction). The wrong one
    silently orphans or kills work.

15. **Never detach from the parent with `withContext(Job())` / `launch(Job())`.**
    It severs cancellation; the child outlives the caller. New scopes use
    `SupervisorJob() + dispatcher`, owned and closed explicitly.

---

## Serialization

Wire stability is a contract too: a renamed class or a dropped null is a breaking
change to consumers' stored data and to any service you exchange JSON with.

1. **Build each `Json` once into a top-level / `object` `val`; reuse it.** Formats
   cache per-class descriptor analysis; a per-call `Json { }` discards that cache
   on every chunk. Inject the shared instance rather than constructing inline in a
   response handler. *Detect:* ast-grep `Json { $$$ }` not assigned to a top-level
   property.

2. **Pin every polymorphic subtype's wire value with `@SerialName`.** The default
   discriminator is the fully-qualified class name, so a rename/move silently
   breaks the wire. *Detect:* review every `@Serializable` sealed subtype for an
   explicit `@SerialName`.

3. **Set the discriminator once on the base via `@JsonClassDiscriminator`.** It is
   `@InheritableSerialInfo`; you cannot vary it per branch — choose it at the root.

4. **Encode/decode polymorphic values through the static base type.**
   `encodeToString<Base>(value)` — the discriminator is only written when the
   compile-time type is the base. Serializing through a concrete subtype omits the
   `type` field and produces un-decodable payloads.

5. **Use `@JsonIgnoreUnknownKeys` per inbound class for forward-compat — not the
   global `ignoreUnknownKeys` flag.** New server fields then don't crash older
   builds, while request/strict models still reject typos. The annotation does
   **not** propagate into nested classes — annotate each. It is
   `@ExperimentalSerializationApi` (kotlinx.serialization 1.8.0+), so it needs an
   opt-in; that's an acceptable trade for scoped forward-compat. *Detect:* grep
   `ignoreUnknownKeys = true` at the builder level (a smell); confirm per-class
   annotations instead.

6. **Register a polymorphic `defaultDeserializer` fallback that captures the raw
   discriminator** for evolving hierarchies. An unknown subtype otherwise throws
   `Serializer for subclass not found`; degrade gracefully where new variants are
   expected.

7. **Keep `explicitNulls = true` unless you've proven no nullable field has a
   non-null default.** With it off, a nullable+defaulted field decodes back to the
   default, not `null` — so encode-then-decode is no longer idempotent. If you need
   inbound leniency, make the `explicitNulls = false` instance **decode-only** and
   route all encoding through a separate `explicitNulls = true` codec. *Detect:*
   grep `explicitNulls = false` to find the codec, then grep its identifier for any
   `encodeToString(`/`encodeToJsonElement(` call site — a round-trip through it is
   a finding.

8. **Give every custom `KSerializer` a unique, package-qualified descriptor name
   matching its encode/decode calls.** A mismatched descriptor is documented
   unspecified behavior. Prefer the surrogate pattern (a private `@Serializable`
   surrogate + delegated serializer) over hand-rolled `encodeStructure`/
   `decodeStructure`.

9. **Pin the serialization runtime to the Kotlin version.** The compiler plugin and
   runtime ship in tandem; a mismatch breaks codegen.

---

## Error Handling & Resilience

Most non-trivial Kotlin talks to something flaky — a network, a DB, a paid API.
The error and retry model is product-critical.

1. **Rethrow `CancellationException` as the first statement of any broad catch**
   (see Coroutines §1). A retry loop or error-mapper that swallows it breaks
   cancellation.

2. **Carry machine-readable fields on transport/domain errors** — status code,
   headers, body, url, `cause`, and an `isRetryable` flag — so the retry layer
   branches on fields, never substring-matches a message. Funnel all calls through
   one request pipeline that constructs these errors consistently.

3. **Classify retryable vs terminal by status, not by retrying everything.**
   Retryable: 408, 409, 425, 429, 5xx, and transport errors. Terminal: 400/401/
   403/404/422 — fail fast. (A blanket `>= 500` also retries the terminal-in-
   practice 501/505; either accept that with a max-attempt cap as the backstop, or
   exclude them explicitly — just be deliberate.)

4. **Honor `Retry-After` as a floor before exponential backoff.** Parse
   delta-seconds, HTTP-date, and `retry-after-ms`; fall back to computed backoff
   only when absent; clamp to a ceiling. The server knows its window.

5. **Use capped exponential backoff *with full jitter*, plus a max-attempt cap and
   an overall deadline:** `random(0, min(maxDelay, base * 2^n))`. Jitter-free
   backoff synchronizes failed clients into retry spikes (thundering herd).
   *Detect:* the backoff function must contain a random term, a `min(..., cap)`, a
   `maxRetries`, and a `withTimeout`.

6. **Let the caller own the idempotency key; reuse it across retries.** A retried
   non-idempotent POST that succeeded server-side but failed in transit
   double-executes without a stable `Idempotency-Key`. Never mint a fresh key per
   attempt.

7. **Set a per-attempt timeout distinct from the overall deadline.** N retries can
   take (N+1)×timeout + backoff; bound the whole operation with a separate
   `withTimeout`.

8. **Preserve the cause chain; surface all collected failures on exhaustion.**
   Always pass `cause = original` when wrapping; expose the full `errors` list, not
   only the last. *Detect:* detekt `ThrowingExceptionsWithoutMessageOrCause`;
   review SDK-error constructor calls for a dropped `cause`.

9. **Never return a mock/default on failure.** A canned fallback converts an outage
   into fake success — monitoring stays green, users get wrong output. Propagate a
   typed error unless the fallback is an explicit, documented product decision.
   *Detect:* review catch blocks wrapping network/model calls that `return` a
   non-error value.

10. **Don't rely on a global `CoroutineExceptionHandler` as the error path.** It
    only fires for uncaught root failures, can't recover, and is ignored by
    `async`. Handle expected failures at the call site; always `await()` an `async`.

11. **Pick the error channel by failure kind, consistently:** nullable for absent
    data; a typed sealed exception for genuine failure; a `…Catching`
    (Result-returning) twin at I/O boundaries. Consistency lets callers predict the
    channel without reading each signature. Don't throw
    `IllegalStateException`/`RuntimeException` for *expected* failures, and don't
    use exceptions as control flow. *Detect:* grep `throw IllegalStateException(`/
    `throw RuntimeException(` for expected-failure paths.

---

## Runtime Performance

Allocation discipline matters most on hot/streaming paths and on
memory-constrained devices. Don't micro-optimize cold paths.

1. **Wrap single-field domain identifiers in `@JvmInline value class` with `init`
   validation.** Zero heap cost, type safety, centralized invariants — beats a bare
   `String`/`Long` or a `data class Id(val v: String)`. *Detect:* grep
   `data class \w+\((val|public val) \w+: (String|Int|Long)\)$`.

2. **Keep value classes unboxed on hot paths.** Used as a generic element
   (`List<Id>`), an interface type, or nullable (`Id?`), a value class **boxes** —
   silently undoing the win. Extract `.value` at the boundary before crossing into
   generic/nullable/supertype code in a loop. *No static lint exists* (boxing is a
   codegen decision, not a source pattern) — this is manual review of the boxing
   rules against hot files, optionally backed by a `kotlinx-benchmark` allocation
   test on the hot path.

3. **Reserve `inline` for functions with a lambda or `reified` param; keep bodies
   small.** Otherwise it just duplicates bytecode (the `NOTHING_TO_INLINE`
   warning). Pair a `reified` inline helper with an explicit non-reified overload
   when the type must also be reachable from erased/Native callers.

4. **Construct each codec/regex once; reuse for the object's lifetime.** Never build
   a `Regex`/`Json`/formatter inside a per-chunk or per-iteration function.

5. **Decode streams incrementally over one retained buffer; never re-materialize
   the whole stream.** Frame on byte boundaries (`indexOf(0x0A)` / `\n\n`), consume
   complete frames, leave the partial tail in the buffer. `decodeToString()` /
   `bodyAsText()` / `accumulated.split("\n")` per chunk is O(n²). *Detect:* grep
   `decodeToString(`/`bodyAsText(`/`.split("\n")` in streaming/transport code.

6. **Accumulate streamed text in a reused `StringBuilder`, not `acc += delta`.**
   String is immutable; `+=` allocates a fresh full-length string per delta (O(n²)
   over a stream). Materialize once at the end. *Detect:* grep `\w+ += ` on a
   `String` accumulator inside a `collect {}`/loop.

7. **Default to `List`; reach for `asSequence()` only on large or early-terminating
   multi-step chains.** `asSequence()` trades per-element iterator overhead for
   laziness — worth it only when the collection is large or a step short-circuits
   (`first`/`take`/`find`). Don't add `.asSequence()` reflexively to a few elements.

8. **Use `lazy(LazyThreadSafetyMode.NONE)` only for thread-confined state.** Default
   `SYNCHRONIZED` pays a lock per access; `NONE` skips it but is a data race the
   moment the value is touched from more than one thread. Never apply `NONE` to
   state a public getter can hand to arbitrary caller threads.

9. **Mutate shared state with atomic `update { }` CAS loops; keep the closure cheap
   and side-effect-free** (it re-runs on retry). Copy-on-write an
   `AtomicReference<List<…>>` for a small shared collection — correct on Native, not
   just JVM.

10. **Keep `kotlin-reflect` off the dependency graph.** Resolve serializers via the
    plugin + `reified` helpers. Reflection defeats R8 tree-shaking, forces consumer
    keep-rules, and is unsupported on Native. *Detect:* grep build files for
    `kotlin-reflect`; source for `::class.members`/`Class.forName`.

---

## Ergonomics & Type Safety

1. **Annotate one shared builder supertype with `@DslMarker`, not individual
   builders.** It stops an inner block (`tool {}` inside `agent {}`) from silently
   configuring an outer scope. *Detect:* every `Builder.() -> Unit` entry point
   should trace to a `@DslMarker`-annotated supertype.

2. **Resolve unset settings with a nullable type + `?:`, never sentinels.** A
   nullable type is the first-class "absent" signal; `-1`/`""`/`"AUTO"` are
   indistinguishable from real values and defeat null-checking. *Detect:* grep
   `= -1`/`Int.MIN_VALUE`/`"AUTO"`/`"NONE"`; review "pass X to mean unset".

3. **Replace behavior-switching `Boolean` params with named functions or enums.**
   `generate(prompt, true, false)` is unreadable and can't grow a third mode
   without a break. Prefer `streamText` vs `generateText`, or an `enum` mode; if a
   `Boolean` is unavoidable, require named-argument calls. *Detect:* detekt
   `BooleanPropertyNaming`; public funcs with ≥2 `: Boolean` params.

4. **Model finite outcome spaces as `sealed`; write `when` without `else` in your
   own handling.** Adding a variant then becomes a compile error at every consumer
   you own. (For *client-extensible* contracts you intend to grow, see the
   library block's `@SubclassOptInRequired`.)

5. **Make collection-typed config immutable; evolve with `copy`/`merge`, not
   mutation.** Safe to share across coroutines; per-call overrides stay composable
   without aliasing. Back internal mutation with a private `_xs` exposed as a
   read-only `List`.

6. **Follow Kotlin naming idioms and KDoc the public surface.** `sort` (mutating)
   vs `sorted` (returning); `…OrNull`/`…Catching` suffixes; cheap-stable
   computations as `val` properties, work as functions.

7. **Put runnable examples in compiled `@sample` functions, not fenced code blocks
   in KDoc.** A ` ```kotlin ` block in a doc comment is never compiled, so it rots
   the first time a signature changes. `@sample fully.qualified.fn` inlines the body
   of a *real* function from a compiled source set, so an API change breaks the
   sample's compile. *Detect:* grep ` ``` ` inside doc comments to convert.

---

## Testing

Most of the rules above exist to make code testable; these make the tests
themselves reliable. (The same seams — injected dispatcher, `Clock`, `Random`,
HTTP engine — are what writing-mode should provide so this section is even
possible.)

1. **Wrap coroutine/Flow tests in `runTest`; never `runBlocking`.** `runTest`
   skips virtual `delay`, so retry/backoff tests run instantly instead of
   sleeping for real, and it surfaces coroutines that never complete.
   `runBlocking` makes delays real (slow, flaky) and hides leaks. *Detect:* grep
   `runBlocking` in test sources.

2. **Collect hot/infinite flows in `backgroundScope` (or Turbine
   `testIn(backgroundScope)`); never `toList()` a `StateFlow`/infinite flow under
   `runTest`.** An unbounded collect never completes, so `runTest` hangs to its
   timeout. `backgroundScope` auto-cancels the collector at test end. *Detect:*
   grep `.toList()`/`.collect {` inside `runTest` on a non-finite flow.

3. **Test the HTTP layer with a fake engine (e.g. Ktor `MockEngine`) sharing the
   production client config.** No real network in unit tests — it's slow, flaky,
   and doesn't exercise error/retry paths deterministically. The fake handler
   asserts request shape and returns canned responses, including the 4xx/5xx and
   malformed-body cases your retry logic must handle.

4. **Substitute the injected `Clock`/`Random`/dispatcher in tests** so time-based
   logic (token expiry, backoff, request signing) is deterministic. This is the
   payoff for injecting them in the first place (Coroutines §6) — a single
   `TestDispatcher` scheduler makes ordering reproducible.

5. **Guard the serialized wire contract with golden/approval tests through the
   real `encodeToString()` path.** Hand-asserting individual fields misses drift
   in defaults, nullability, discriminators, and enum encoding; round-trip and
   compare against a committed golden string using the SDK's actual codec, not a
   different JSON library's defaults.

---

## Security & Logging Hygiene

Applies to any code that handles secrets, tokens, or user/PII data — which is most
networked code.

1. **Never `println`/`NSLog`/`Log.d`/`print` in reusable/library code.** A
   component must not hard-code a platform log sink — the host chooses Logcat,
   `os_log`, a structured server sink, or nothing. Route diagnostics through an
   injected logger interface with a no-op default. *Detect:* grep
   `println(`/`NSLog(`/`Log.[dewiv](`/`System.out` in non-test main source — should
   be empty.

2. **Never log or surface a raw request/response body, headers, or an
   `Authorization`/api-key value without redaction.** Error payloads routinely echo
   the request — including prompts and, on a misconfigured gateway, the key — back
   in the body. Carrying that data on a typed error for retry classification is
   fine; the moment it's logged, attached to a crash report, or shown to a user it
   must pass a redaction step that strips auth/`api-key`/`x-api-key` headers and
   masks token-shaped substrings. *No static check proves redaction* — review every
   egress site (grep for the body/header fields being logged or rethrown).

3. **Keep prompt/PII content out of telemetry by default; opt-in only.** Counts,
   durations, ids, and status are safe dimensions; message bodies are not. A logging
   or tracing seam defaults to metadata-only and requires an explicit, documented
   opt-in before any content enters a span or log line.

4. **Own resource lifecycle explicitly:** types whose lifetime the caller manages
   implement `AutoCloseable` with an **idempotent** `close()` (so callers get
   `use { }`); document which injected resources (e.g. a caller-supplied
   `HttpClient`) the component does *not* own and must not close. Never rely on
   finalizers.
