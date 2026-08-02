# Review: `PriceStreamRepository.kt`

**Verdict: BLOCK — do not merge.** The file has multiple Tier-0 (Core Kotlin) defects, and three of them directly explain your teammate's report ("streaming felt off, prices sometimes freeze on the watchlist"). The freeze is not a flake; it is baked into `stream()`.

**Tier classification:** Internal app data-layer class (`com.acme.trading.data`), consumed by the watchlist screen and the alerts service inside the same app. No published API surface, no `commonMain`/`expect`/`actual`, no publishing block. → **Tier 0 (Core) only.** I am deliberately *not* raising ABI / `explicitApi` / multiplatform / publishing concerns; they don't apply here and would bury the real feedback.

Findings are highest-severity first. Format per finding: **smell → why rejected → fix → how detected.**

---

## BLOCKING

### 1. `stream()` busy-loops with no `delay`, hammering the endpoint and starving the dispatcher — this is the freeze

**Smell** (lines 38–53): `while (true) { http.get(...).bodyAsText(); ... }` with no `delay()` and no backoff. Each iteration does a *fresh* blocking-style `GET` of the whole response and immediately loops again.

**Why rejected.** This is a tight, unthrottled loop issuing network calls as fast as they complete. It pegs the HTTP client's connection pool and the collecting coroutine's dispatcher. When the watchlist subscribes to several symbols, you get N of these loops competing — the symptom your teammate saw ("prices freeze") is the UI starved of progress while these loops monopolize I/O. It also DoS-pressures your own pricing gateway. The skill's resilience guidance is explicit: a polling loop needs a paced `delay()` and, on error, jittered capped backoff — never a free-running `while(true)`.

**Fix.** If the endpoint is a true stream, consume it as one streamed response (read the channel/`bodyAsChannel()` line-by-line and emit as lines arrive) instead of re-`GET`-ing in a loop. If it really is a poll endpoint, add a paced `delay(pollInterval)` each iteration (inject the interval), and on failure back off with full jitter up to a cap rather than retrying instantly.

**How detected.** Manual review of the `while (true)` body, backed by Core → Error Handling & Resilience ("Fixed-delay / jitter-free backoff, no caps → thundering herd"). No single grep catches "loop with no delay"; the signal is `while (true)` + a network call + no `delay(`.

---

### 2. `stream()` re-parses the entire accumulated buffer every iteration and re-emits every past price — the "streaming felt off"

**Smell** (lines 39–48): `accumulated += chunk` then `for (line in accumulated.split("\n")) { if (line.startsWith("price:")) emit(...) }`. `accumulated` is never trimmed, and every loop re-splits and re-emits **all** prices seen since the stream opened.

**Why rejected.** Three compounding defects in one block:
- **Re-emission of stale ticks.** Iteration 1 emits price[0]. Iteration 2 appends a new chunk, re-splits the whole buffer, and emits price[0] *again* plus price[1]. Collectors see duplicated and out-of-order-feeling values — exactly "the streaming felt off." A watchlist that takes the latest emission will appear to jump backward to old prices.
- **O(n²) re-scan + unbounded memory.** `accumulated` grows forever; `split("\n")` re-allocates and re-scans the entire history on every chunk. The skill flags re-decoding the whole stream per chunk as O(n²) garbage (Core → Runtime Performance) and `acc += delta` string concat in a loop as O(n²) allocation. Both smells are present in the same four lines.
- **`+=` on a `String` accumulator** inside the loop is the GC-pressure anti-pattern called out directly.

**Fix.** Frame incrementally over a *retained* buffer: keep an index/`StringBuilder` of the unprocessed tail, split out only *complete* lines, emit each new line exactly once, and discard the consumed prefix. Better, read the response as a channel and `readUTF8Line()` in a loop so framing is handled for you and nothing is re-scanned.

**How detected.** grep `.split("\n")` and `+= ` on a String accumulator inside a loop (Core → Runtime Performance rows), confirmed by manual trace of the emit logic.

---

### 3. `catch (e: Exception)` swallows `CancellationException` — the watchlist Flow cannot be cancelled

**Smell** (lines 49–51): `catch (e: Exception) { // swallow and keep polling }`. Combined with the `while (true)`, this catch sits inside the cancellable `flow {}`.

**Why rejected.** `CancellationException` is an `Exception`, so this catch eats it and the loop keeps going. When the watchlist screen leaves and cancels its collection scope, the cooperative-cancellation signal is swallowed and **the loop never stops** — a leaked coroutine still polling the gateway. That leak is itself a strong candidate for "prices freeze": a dead screen's stream keeps contending for the I/O pool behind a screen that's supposed to be gone. This is the single most-cited Core coroutine smell.

**Fix.** Rethrow cancellation first: `catch (e: CancellationException) { throw e } catch (e: Exception) { ... }`, or call `currentCoroutineContext().ensureActive()` at the top of the catch before handling. Combined with finding #1, the error path should also back off rather than instantly retry.

**How detected.** detekt `SwallowedException` / `TooGenericExceptionCaught`; grep `catch (e: Exception)` with no `CancellationException` rethrow.

---

### 4. `GlobalScope.launch` in `prefetch()` — orphaned, uncancellable, untestable work

**Smell** (lines 55–60): `GlobalScope.launch(Dispatchers.IO) { symbols.forEach { latest(it) } }`.

**Why rejected.** `GlobalScope` work has no parent, is never cancelled, and outlives any caller. If the screen that called `prefetch` is gone, these `latest()` calls still run; if `prefetch` is called repeatedly, the orphans pile up — more uncancellable load on the same gateway and dispatcher feeding the freeze. It's also untestable (nothing to join in `runTest`). This is an explicit Core blocking smell.

**Fix.** Give the repository an injected `CoroutineScope` (backed by `SupervisorJob() + injected dispatcher`) tied to a `close()`/lifecycle, and `launch` into that. The repo then becomes `AutoCloseable` so its scope is cancelled deterministically.

**How detected.** detekt `GlobalCoroutineUsage`; grep `GlobalScope.`.

---

### 5. `runCatching { ... }` wraps a suspend call — captures cancellation into `Result.failure`

**Smell** (lines 22–30): inside the `suspend fun latest`, `runCatching { http.get(...).bodyAsText(); ... }` wraps suspending I/O. On failure it `return`s `cache[symbol] ?: 0.0`.

**Why rejected.** Two stacked Core defects:
- **`runCatching` around a suspend call** captures `CancellationException` into `Result.failure` — so a cancelled `latest()` looks like a failed network call instead of propagating. The skill names this exactly ("Never wrap a suspend call in stdlib `runCatching`").
- **Returning a default on failure masks outages.** On a real network error this returns the stale cached price, or **`0.0`** if the symbol was never cached. A `0.0` price silently flowing into a trading watchlist / alerts service is a correctness-and-money bug, not just a smell — the alerts service could fire on a fake zero. The skill is blunt: "never return a mock/default on failure (it fakes success)."

**Fix.** Use try/catch with `ensureActive()` first (or a `runSuspendCatching` helper), and on failure propagate a typed error / rethrow rather than returning `0.0`. If a "last known good" fallback is genuinely a product requirement, model it explicitly (e.g. return a type that distinguishes `Live(price)` from `Stale(price, since)`), never an indistinguishable bare `Double`, and never `0.0`.

**How detected.** detekt `SuspendFunSwallowedCancellation` (needs type resolution — honestly, may not fire in CI without it; back it with manual review); plus Core → Error Handling row "Returning a mock/default on network failure" reviewed manually.

---

## SUGGESTIONS (non-blocking, but fix while you're in here)

### 6. `Json { ignoreUnknownKeys = true }` constructed inline per call

**Smell** (line 25): a fresh `Json { ... }` builder is allocated on every `latest()` invocation.

**Why rejected.** Each `Json {}` discards the per-class serializer/descriptor cache, so you pay re-computation on every call (Core → Serialization). Separately, `ignoreUnknownKeys` is set *globally* on this instance — the skill prefers per-class `@JsonIgnoreUnknownKeys` so typos/drift aren't silently dropped everywhere.

**Fix.** Hoist one reused `Json` to a top-level/`object val` (or inject it). Prefer per-class `@JsonIgnoreUnknownKeys` over the global flag if you model the payload as a `@Serializable` class.

**How detected.** ast-grep / review for `Json { ... }` not assigned to a top-level property; grep `ignoreUnknownKeys = true`.

---

### 7. Unguarded mutable `cache` shared across coroutines

**Smell** (line 20, 33): `private var cache: Map<String, Double>` reassigned via `cache = cache + (...)` from `latest()`, which runs on `Dispatchers.IO` and is called concurrently (e.g. from `prefetch`'s `forEach` and from the watchlist).

**Why rejected.** Concurrent `latest()` calls read-modify-write `cache` with no synchronization; on the JVM this is a lost-update / visibility hazard (two symbols racing can drop one's write). It's a `var` reference swap, so it won't corrupt, but updates can be silently lost.

**Fix.** Use a thread-safe structure (e.g. a `Mutex.withLock` around the update, or an atomic/concurrent map). Keep the dispatcher injected (see #8) so the test can drive concurrency deterministically.

**How detected.** Manual review of shared mutable state mutated from concurrent suspend paths (Core → Coroutines / Security lifecycle review).

---

### 8. Hardcoded `Dispatchers.IO` inside the class

**Smell** (lines 22, 57): `withContext(Dispatchers.IO)` and `GlobalScope.launch(Dispatchers.IO)` hardcode the dispatcher.

**Why rejected.** Nondeterministic and untestable — `runTest`'s virtual time can't drive it, and you can't substitute a test dispatcher. The skill requires injecting the dispatcher with a prod default. (Note: once `stream()` is rewritten as a cold `flow`, its dispatcher should be set with `.flowOn(ioDispatcher)` as the last operator, not `withContext` — but `latest()` legitimately uses `withContext` and just needs the injected dispatcher.)

**Fix.** Constructor-inject `private val io: CoroutineDispatcher = Dispatchers.IO` and use it in `withContext(io)` / the scope.

**How detected.** grep `Dispatchers.(IO|Default|Main)` in class bodies (Build/Tooling/Testing row).

---

### 9. `obj["price"]!!.jsonPrimitive.content.toDouble()` — three unguarded failure points

**Smell** (lines 31–32): `result.getOrNull() as JsonObject` then `obj["price"]!!...toDouble()`.

**Why rejected.** The `as JsonObject` cast throws `ClassCastException` if the body isn't an object; `!!` NPEs if `price` is absent; `toDouble()` throws `NumberFormatException` on a non-numeric value. None of these are `CancellationException`, but they bypass the `runCatching` (they're after the `isFailure` check) and surface as raw, untyped exceptions to callers. For a pricing path this should be a modeled `@Serializable` response decoded through the reused `Json`, with a typed error on malformed payloads.

**Fix.** Define `@Serializable data class PriceResponse(val price: Double)` and `json.decodeFromString(...)`; map decode failures to a typed error rather than letting `!!`/cast/`toDouble` throw.

**How detected.** Manual review of the parse path (Core → Serialization + Error Handling).

---

## Why this answers the bug report

The "prices freeze on the watchlist" symptom is overdetermined by findings **#1 + #2 + #3** together: a free-running poll loop (#1) starves the I/O pool, the re-scan/re-emit (#2) makes ticks look stale or jumpy, and the swallowed `CancellationException` (#3) means a navigated-away screen's stream never dies and keeps contending. Fix all three. The `0.0`-on-failure fallback (#5) is the scariest *latent* one — it can feed a fake zero price into alerts — so treat #5 as blocking too even though no one has reported it yet.

## Minimum to unblock merge
Findings **#1, #2, #3, #4, #5** are blocking. #6–#9 are strongly recommended in the same PR since you're already in the file. Add a `runTest` collection test for `stream()` (collect in `backgroundScope`, assert each price is emitted once and that cancelling the scope stops the loop) and a `MockEngine`-based test for `latest()`'s error path so the no-fake-`0.0` behavior is locked in.
