package com.acme.trading.pricewatch

import io.ktor.client.HttpClient
import io.ktor.client.plugins.sse.SSE
import io.ktor.client.plugins.sse.sseSession
import io.ktor.client.request.url
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.SerializationException
import kotlin.coroutines.coroutineContext
import kotlin.random.Random
import kotlin.time.Clock
import kotlin.time.Duration

/**
 * Live price-watch client for a single instrument.
 *
 * Connects to the Acme price gateway's Server-Sent Events stream and exposes
 * each incoming tick as a cold [Flow]. The UI collects the flow inside its own
 * lifecycle scope (e.g. `viewModelScope` / `lifecycleScope`); when that scope is
 * cancelled — the user navigates away — the SSE session and the underlying HTTP
 * call are torn down automatically. No `close()` / manual lifecycle is required
 * because the stream owns no work that outlives a collector.
 *
 * Transient network failures (dropped connection, 5xx, 429) are retried with
 * full-jitter exponential backoff under an overall deadline; terminal failures
 * (4xx auth/validation, malformed config) propagate so the caller can react.
 *
 * The constructor exposes every nondeterministic seam — [client], [dispatcher],
 * [clock], [random] — so the whole class is unit-testable with a Ktor
 * `MockEngine`, a `TestDispatcher`, and a fixed clock/seed. The class does NOT
 * own [client]; the host installs the engine + [SSE] plugin and is responsible
 * for closing it.
 *
 * @sample com.acme.trading.pricewatch.samples.collectPriceTicks
 */
public class PriceStreamClient(
    private val client: HttpClient,
    private val baseUrl: String = "https://gw.acme.trading/v1/stream",
    private val retry: RetryPolicy = RetryPolicy(),
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val clock: Clock = Clock.System,
    private val random: Random = Random.Default,
) {

    // Single shared codec, built once. Formats cache per-class descriptor
    // analysis, so a per-frame `Json { }` would discard that cache on every
    // tick. The wire format is this transport's private concern — not a
    // constructor knob the UI needs to override — so it stays internal.
    private val json: Json = Json { isLenient = false }

    /**
     * A cold flow of price ticks for [symbol].
     *
     * Returning a non-suspend function over a cold `Flow` (rather than a
     * `suspend fun`) keeps connection setup lazy: nothing happens until a
     * collector subscribes, and the connection is torn down the instant the
     * collector is cancelled. Each subscription opens its own SSE session, so
     * the same client can drive several symbols on different screens.
     *
     * The flow retries transient drops internally; it terminates normally only
     * if the server closes the stream cleanly, and terminates exceptionally
     * with a [PriceStreamError] once the retry deadline or attempt cap is hit,
     * or immediately on a terminal (non-retryable) error.
     */
    public fun ticks(symbol: Symbol): Flow<PriceTick> = channelFlow {
        // Reconnect loop with full-jitter backoff. The overall deadline is
        // enforced both here (at each failure) and by `withOverallTimeout`
        // downstream (which also catches a connection that hangs mid-stream).
        // The collector's own cancellation is always the primary stop signal.
        val started = clock.now()
        var attempt = 0
        val collected = mutableListOf<PriceStreamError>()

        suspend fun runOnce() {
            // `sseSession` opens the connection; its scope is cancelled when the
            // block returns or the connection closes. We collect `incoming`
            // here and hand each parsed tick to the channelFlow's channel via
            // `send`. We deliberately use channelFlow (not flow {}) because the
            // session may produce from a different coroutine than the collector;
            // emitting straight from here would trip "Flow invariant is
            // violated" (and can pass on JVM yet fail on Native). `send` is
            // concurrency-safe across that boundary.
            //
            // maxReconnectionAttempts stays at the Ktor default (0): we own
            // reconnection at the application layer so we get jitter, a
            // deadline, and retryable-vs-terminal status classification that
            // the transport's blind reconnect can't provide.
            val session = client.sseSession {
                url("$baseUrl/${symbol.value}")
            }
            session.incoming.collect { event ->
                val data = event.data ?: return@collect // keep-alive / comment
                val tick = parseTick(symbol, data) ?: return@collect
                attempt = 0 // a clean tick proves the connection healthy again
                collected.clear()
                send(tick)
            }
        }

        while (true) {
            try {
                runOnce()
                // Clean server-side end of stream: complete normally.
                return@channelFlow
            } catch (e: CancellationException) {
                // Structured-concurrency stop signal (collector left the screen,
                // or the deadline below fired). Must be the first catch and must
                // rethrow — swallowing it leaks the SSE coroutine.
                throw e
            } catch (e: Throwable) {
                coroutineContext.ensureActive()
                val error = e.toPriceStreamError(symbol)
                collected += error

                val deadlineExceeded = clock.now() - started >= retry.overallDeadline
                if (!error.isRetryable || attempt >= retry.maxRetries || deadlineExceeded) {
                    // Never substitute a fake/last-known tick here — that would
                    // turn an outage into silent stale data on a trading screen.
                    // Surface a typed error carrying every collected failure.
                    throw PriceStreamError(
                        symbol = symbol,
                        kind = error.kind,
                        status = error.status,
                        isRetryable = false,
                        message = "Price stream for ${symbol.value} failed after " +
                            "${attempt + 1} attempt(s): ${error.message}",
                        cause = e,
                        attempts = collected.toList(),
                    )
                }

                val backoff = retry.backoffFor(attempt, random)
                attempt++
                // Cooperative, virtual-time-friendly sleep: `delay` is skipped
                // by `runTest`, so backoff tests run instantly.
                delay(backoff)
            }
        }
    }.let { upstream ->
        // Bound the whole operation, then move all of it off the collector's
        // (typically Main) thread. `.flowOn` as the *last* upstream operator is
        // the correct way to set a Flow's dispatcher — never withContext around
        // a send/emit.
        upstream.withOverallTimeout(retry.overallDeadline).flowOn(dispatcher)
    }

    private fun parseTick(symbol: Symbol, data: String): PriceTick? =
        try {
            json.decodeFromString(PriceTickWire.serializer(), data).toDomain(symbol)
        } catch (e: SerializationException) {
            // A single malformed frame is not fatal to the stream: skip it and
            // keep reading. (Throwing here would tear the whole session down for
            // one bad line.)
            null
        } catch (e: IllegalArgumentException) {
            null
        }

    private fun <T> Flow<T>.withOverallTimeout(deadline: Duration): Flow<T> =
        if (deadline == Duration.INFINITE) this
        else channelFlow {
            // `withTimeout` cancels the inner collect (and thus the SSE call)
            // once the deadline elapses, then rethrows TimeoutCancellationException
            // which surfaces to the collector as the stream's terminal failure.
            withTimeout(deadline) {
                collect { send(it) }
            }
        }
}
