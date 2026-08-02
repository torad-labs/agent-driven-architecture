# Review: `PriceStreamRepository.kt`

Reviewed before merge. The teammate's report — "streaming felt off" and "prices sometimes freeze on the watchlist" — is not a flake. Both symptoms trace to real bugs in `stream()`. There are also two crash bugs in `latest()` and a structured-concurrency leak in `prefetch()`. I would not merge this as-is.

Findings are ordered highest severity first.

---

## CRITICAL

### 1. `stream()` re-emits the entire history on every poll → duplicate/garbled ticks ("streaming felt off")

```kotlin
var accumulated = ""
while (true) {
    val chunk = http.get(...).bodyAsText()
    accumulated += chunk                      // grows forever, never reset
    for (line in accumulated.split("\n")) {   // re-walks ALL lines every loop
        if (line.startsWith("price:")) {
            emit(...)                          // re-emits every price seen so far
        }
    }
}
```

Two compounding problems:

- **`accumulated` is never cleared.** It grows without bound (a memory leak), and every iteration re-splits the *whole* buffer.
- **Every `price:` line ever received is re-emitted on every iteration.** Poll 1 emits prices `[a]`. Poll 2 appends and re-emits `[a, b]`. Poll 3 re-emits `[a, b, c]`. The consumer sees the same old values over and over, interleaved with new ones. This is exactly "the streaming felt off" — stale prices keep reappearing.

You also have no parsing of partial lines: `bodyAsText()` can split mid-line across reads, and a half-line like `price:123` (no newline yet) gets `toDouble()`'d and either throws or emits a truncated number.

**Fix:** track a consumed offset / only process newly received bytes, and buffer an incomplete trailing line until its newline arrives. Cleaner still, consume the stream as a channel/byte flow instead of repeatedly `GET`-ing and string-concatenating. Sketch:

```kotlin
fun stream(symbol: String): Flow<Double> = flow {
    val channel = http.get("https://gw.acme.trading/v1/stream/$symbol").bodyAsChannel()
    while (!channel.isClosedForRead) {
        val line = channel.readUTF8Line() ?: break
        if (line.startsWith("price:")) {
            line.removePrefix("price:").trim().toDoubleOrNull()?.let { emit(it) }
        }
    }
}.flowOn(Dispatchers.IO)
```

---

### 2. `catch (Exception)` swallows `CancellationException` → the flow can't be cancelled ("prices freeze")

```kotlin
} catch (e: Exception) {
    // swallow and keep polling
}
```

`CancellationException` **is** an `Exception`. When the watchlist screen scrolls a symbol off, navigates away, or the collecting coroutine is cancelled, the cancellation is delivered by throwing `CancellationException` at the next suspension point (the `http.get`). This `catch` eats it and the `while (true)` loop keeps running — the flow refuses to die.

The visible effect:
- The old collector never stops. When the UI re-subscribes, you now have **two** loops hammering the endpoint, and depending on how the UI binds them, the screen can latch onto a dead/duplicated stream and stop updating → **"prices freeze on the watchlist."**
- It also defeats structured concurrency and leaks coroutines/connections.

**Fix:** never catch `CancellationException`. Either catch the specific network exceptions, or rethrow cancellation:

```kotlin
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    delay(retryBackoff)   // see finding #3
}
```

(Best handled with `currentCoroutineContext().ensureActive()` or by using `kotlinx.coroutines.flow` operators that respect cancellation.)

---

### 3. `while (true)` with no `delay` → busy-loop hot spin (CPU burn, connection storm)

The poll loop has **no `delay` anywhere**. When `bodyAsText()` returns quickly (or the endpoint errors fast), this loop spins as fast as the CPU allows, firing back-to-back HTTP requests. On error it's even worse: the `catch` swallows and immediately re-loops with zero backoff — a tight retry storm against the gateway.

This also makes cancellation *less* responsive: if a loop iteration ever completes without suspending, there is no suspension point for cancellation to land on.

**Fix:** add `delay(...)` between polls and a backoff on failure. If the endpoint is a true long-lived stream, don't poll at all — read it as a stream (see #1) so the loop naturally suspends on `readUTF8Line()`.

---

## HIGH

### 4. `latest()` will crash on a malformed/empty/error response — two unsafe operators

```kotlin
val obj = result.getOrNull() as JsonObject      // (a) ClassCastException
val price = obj["price"]!!.jsonPrimitive.content.toDouble()  // (b) NPE / NumberFormatException
```

`runCatching` only guards the *fetch + parse*. Everything after `if (result.isFailure)` runs unguarded:

- **(a) `as JsonObject`** — if the gateway returns a JSON array, a bare string, `null`, or an error envelope (`{"error": "..."}` is still a JsonObject, but a `204`/empty body parses to something else or fails the cast), this throws `ClassCastException`. Use `as?` + fallback.
- **(b) `obj["price"]!!`** — if the field is absent or named differently, `!!` throws NPE. `.toDouble()` throws `NumberFormatException` on a non-numeric value.

The whole point of the `cache[symbol] ?: 0.0` fallback was "don't let the UI flicker on a network blip" — but a *successful HTTP 200 with an unexpected body* sails right past the `isFailure` guard and crashes. That's a worse failure than the network blip you were defending against, and it can take down the alerts service too (this class is shared).

**Fix:** put the extraction inside the `runCatching`, or use safe accessors:

```kotlin
val price = (result.getOrNull() as? JsonObject)
    ?.get("price")?.jsonPrimitive?.contentOrNull
    ?.toDoubleOrNull()
    ?: return@withContext cache[symbol] ?: 0.0
```

---

### 5. `0.0` as a "no data" sentinel is dangerous for prices

`return@withContext cache[symbol] ?: 0.0` returns `0.0` when there's no cached value and the network fails. In a *trading* app, `0.0` is a real, catastrophic price — it can trip alerts, show a free instrument, or feed a P&L calc as a 100% loss. A sentinel that collides with a legitimate value is a latent incident.

**Fix:** return `Double?` (null = unknown) or a sealed result type, and let the UI render "—" for unknown. Never paper over "no data" with a number that looks like data.

---

### 6. `GlobalScope.launch` in `prefetch()` — leaked, uncancellable work

```kotlin
fun prefetch(symbols: List<String>) {
    GlobalScope.launch(Dispatchers.IO) {
        symbols.forEach { latest(it) }
    }
}
```

`GlobalScope` is unbounded and not tied to any lifecycle. This fire-and-forget job:
- can't be cancelled when the screen/repo is torn down (keeps fetching after the user leaves),
- swallows failures silently (no one is awaiting it; an exception in `latest()` — see #4 — becomes an unhandled coroutine exception),
- runs fetches **sequentially** (`forEach` awaits each `latest`), so "warm the cache" is slow for a long watchlist.

**Fix:** inject a `CoroutineScope` (e.g. tied to the screen/repo lifecycle) instead of `GlobalScope`, and parallelize with `map { async { latest(it) } }.awaitAll()` if order doesn't matter. `GlobalScope` should essentially never appear in app/library code.

---

## MEDIUM

### 7. Data race on `cache` — read/written from concurrent coroutines

`cache` is a plain `var Map` mutated via `cache = cache + (...)` from `latest()`, which is called concurrently from the watchlist, the alerts service, **and** `prefetch()`'s background job. Concurrent `latest()` calls can lose updates (read-modify-write on `cache` is not atomic) and there's no happens-before guarantee for readers.

The copy-on-write assignment avoids `ConcurrentModificationException`, but updates can still clobber each other (last-writer-wins drops other symbols' writes that landed between the read and the assignment).

**Fix:** use a thread-safe structure — `ConcurrentHashMap`, or guard with a `Mutex`, or model the cache as a `StateFlow<Map<...>>` updated via `update { }`.

### 8. `Json { ignoreUnknownKeys = true }` is allocated on every `latest()` call

A new `Json` instance is constructed per call inside the hot path. `Json` is designed to be created once and reused. Hoist it to a top-level/companion `private val json = Json { ignoreUnknownKeys = true }`.

### 9. `stream()` is marked `suspend` but doesn't need to be

`fun stream(...): Flow<Double>` returning a cold `flow { }` should not be `suspend` — building the flow does no suspending work; only collecting it does. Marking it `suspend` is misleading and prevents callers from holding the `Flow` without being in a coroutine. Drop `suspend`.

### 10. No `flowOn` / dispatcher confinement on `stream()`

`latest()` correctly wraps its IO in `withContext(Dispatchers.IO)`, but `stream()` does its `http.get` on whatever dispatcher the collector runs on (often `Main` on Android). Add `.flowOn(Dispatchers.IO)` (as in the #1 sketch) to keep network work off the main thread.

---

## Summary of what to fix before merge

The two symptoms your teammate hit are the two CRITICALs:
- **"Streaming felt off"** → finding #1 (re-emitting the whole accumulated history every poll).
- **"Prices freeze"** → finding #2 (swallowed `CancellationException` keeps a zombie loop alive) plus #3 (no delay / hot spin).

Beyond those, `latest()` has two unguarded crash paths (#4), the `0.0` price sentinel is unsafe for a trading app (#5), and `GlobalScope` (#6) leaks work. I'd treat #1–#6 as merge blockers and #7–#10 as same-PR cleanups.
