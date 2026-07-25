# Transcript — Review of `PriceStreamRepository.kt` (without skill)

## Constraint
This review was performed using only my own Kotlin/coroutines knowledge. No external skill
(in particular no `kotlin-best-practices` skill) was consulted, read, or invoked.

## Approach

1. **Read the file end-to-end first** (per "read before theorizing"). 61 lines, one class with
   four members: `cache`, `latest()`, `stream()`, `prefetch()`.

2. **Anchored on the reported symptoms.** The user gave two concrete signals from a teammate:
   - "streaming felt off"
   - "prices sometimes freeze on the watchlist"
   I treated these as evidence pointing at `stream()` rather than starting from a generic checklist,
   then traced `stream()` line by line to find mechanisms that would actually produce those symptoms.

3. **Traced `stream()` execution by hand:**
   - `accumulated += chunk` never resets → buffer grows unbounded.
   - The `for (line in accumulated.split("\n"))` re-walks the *entire* buffer each loop and
     `emit`s every `price:` line seen so far → duplicate/stale emissions. This is "felt off."
   - `catch (Exception)` catches `CancellationException` (it is an `Exception`), so the
     `while(true)` loop can't be cancelled → zombie loops, UI latches onto a dead stream → "freeze."
   - No `delay` anywhere → hot spin / request storm, and fewer suspension points for cancellation.

4. **Traced `latest()`:** noticed `runCatching` only wraps fetch+parse; the `as JsonObject` cast and
   `obj["price"]!!...toDouble()` run unguarded after the failure check, so a 200 with an unexpected
   body crashes despite the "don't flicker" fallback. Also flagged the `0.0` sentinel as dangerous
   specifically because this is a trading domain (0.0 is a real, harmful price).

5. **Traced `prefetch()`:** `GlobalScope.launch` → lifecycle leak, swallowed failures, sequential fetch.

6. **Swept for concurrency / hygiene issues:** shared mutable `cache` read/written from concurrent
   coroutines (watchlist + alerts + prefetch); per-call `Json` allocation; needless `suspend` on a
   cold-flow builder; missing `flowOn` on `stream()`.

7. **Wrote findings highest-severity first**, mapping the two CRITICALs back to the two reported
   symptoms so the author can see cause→symptom directly, and grouping the rest as HIGH/MEDIUM with
   concrete fixes.

## Severity calls
- CRITICAL: #1 history re-emission, #2 swallowed cancellation, #3 hot-spin loop — these are the
  functional/streaming defects and directly explain the bug report.
- HIGH: #4 unguarded crashes in `latest()`, #5 `0.0` price sentinel, #6 `GlobalScope` leak.
- MEDIUM: #7 cache data race, #8 per-call `Json`, #9 needless `suspend`, #10 missing `flowOn`.
