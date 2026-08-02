package trading.pricewatch

import io.ktor.client.HttpClient
import io.ktor.client.request.headers
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsChannel
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.utils.io.readLine
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flowOn
import kotlin.coroutines.cancellation.CancellationException
import kotlin.coroutines.coroutineContext
import kotlin.jvm.JvmInline
import kotlin.math.min
import kotlin.random.Random

/**
 * A single price quote for [symbol]. [JvmInline] value class so the id never
 * costs a heap allocation on the streaming hot path (Tier 0 / Performance §1)
 * — yet still carries a validating `init`. We extract `.value` at any boundary
 * that would box it (Performance §2).
 */
@JvmInline
public value class Symbol(public val value: String) {
    init {
        require(value.isNotBlank()) { "Symbol must not be blank" }
    }
}

/** One decoded tick. Kept tiny; this is allocated once per wire line. */
public data class PriceTick(
    val symbol: Symbol,
    val price: Double,
)

/**
 * Log sink seam (Tier 0 / Security §1). The gateway transport must never
 * `println` — the host app routes diagnostics to Logcat / os_log / a server
 * sink, or drops them. Default is a no-op so nothing breaks if unwired.
 */
public interface PriceWatchLogger {
    public fun debug(message: String)
    public fun warn(message: String, throwable: Throwable? = null)
}

/** Drop-everything default. */
public object NoopPriceWatchLogger : PriceWatchLogger {
    override fun debug(message: String): Unit = Unit
    override fun warn(message: String, throwable: Throwable?): Unit = Unit
}

/**
 * Retry/backoff policy for transient gateway disconnects. All knobs are data
 * so a test can shrink delays to zero and make backoff deterministic
 * (Tier 0 / Errors §5, Testing §4). Full-jitter exponential backoff with a
 * hard cap and a max-attempt ceiling — jitter-free backoff would synchronise
 * every reconnecting client into a thundering herd.
 */
public data class RetryPolicy(
    val maxRetries: Int = 5,
    val baseDelayMs: Long = 500L,
    val maxDelayMs: Long = 30_000L,
) {
    init {
        require(maxRetries >= 0) { "maxRetries must be >= 0" }
        require(baseDelayMs > 0) { "baseDelayMs must be > 0" }
        require(maxDelayMs >= baseDelayMs) { "maxDelayMs must be >= baseDelayMs" }
    }

    /** `random(0, min(maxDelay, base * 2^attempt))` — full jitter. */
    internal fun delayForAttempt(attempt: Int, random: Random): Long {
        // Cap the exponent so `2^attempt` can't overflow Long on a long-lived stream.
        val exp = min(attempt, 32)
        val ceiling = min(maxDelayMs, baseDelayMs shl exp)
        return random.nextLong(ceiling + 1)
    }
}

/**
 * Raised when the gateway answers the stream GET with a terminal (non-2xx)
 * status. Carries the machine-readable [statusCode] so the retry layer branches
 * on a field, never a substring (Tier 0 / Errors §2).
 */
public class GatewayStreamException(
    public val statusCode: Int,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

/**
 * Streams live price ticks from the ACME pricing gateway.
 *
 * The gateway exposes a long-lived plain-HTTP GET that writes newline-delimited
 * `price:<number>` lines and never closes the socket. This is **not** SSE, so we
 * read the response body channel ourselves and frame on `\n`.
 *
 * Everything external is injected (Tier 0 / Coroutines §6, Testing §3): the
 * [HttpClient] (so tests swap in Ktor `MockEngine`), the dispatcher, the
 * [PriceWatchLogger], the [RetryPolicy], and the [Random] used for jitter — that
 * is the whole reason the type is unit-testable without a network or a wall clock.
 *
 * The caller owns the [HttpClient] lifetime; this class never closes it.
 *
 * @param baseUrl gateway origin, e.g. `https://gw.acme.trading`.
 * @param streamDispatcher context the framing loop runs on, pinned via `.flowOn`.
 *   Defaults to [Dispatchers.Default] — NOT `Dispatchers.IO`, which is JVM-only
 *   (it is `internal` on Kotlin/Native and would fail the Native build). Ktor's
 *   engine already does the blocking socket I/O off our thread, so the framing
 *   loop here is light; on JVM a host may still inject `Dispatchers.IO` if it
 *   prefers. (Native-clean dispatcher choice — verified by the linuxX64 leg.)
 */
public class PriceWatchGateway(
    private val client: HttpClient,
    private val baseUrl: String = "https://gw.acme.trading",
    private val retryPolicy: RetryPolicy = RetryPolicy(),
    private val streamDispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val logger: PriceWatchLogger = NoopPriceWatchLogger,
    private val random: Random = Random.Default,
) {
    /**
     * Cold [Flow] of ticks for [symbol] — collection is what starts the stream,
     * so it stays lazy and fully cancellable (Tier 0 / Coroutines §3: a streaming
     * source is a non-suspend fun returning a cold Flow, never a `suspend fun`).
     *
     * Transient disconnects (transport errors, 5xx, 408/429) reconnect with
     * jittered backoff up to [RetryPolicy.maxRetries]; terminal statuses
     * (4xx other than those) fail fast and propagate a [GatewayStreamException].
     *
     * When the collector is cancelled — the user navigates away — the suspended
     * channel read unwinds through `execute {}`, aborting the in-flight GET with
     * no leaked connection (structured concurrency). We never swallow that
     * `CancellationException`.
     *
     * Dispatcher is pinned with `.flowOn(streamDispatcher)` as the LAST operator
     * (Coroutines §4), not a `withContext` wrapped around emission.
     */
    public fun priceTicks(symbol: Symbol): Flow<PriceTick> =
        channelFlow {
            // channelFlow (not flow{}): Ktor's `execute {}` may run its body — the
            // channel read and our `send` — in a different coroutine/context than
            // the collector, notably on Kotlin/Native engines. A plain
            // `flow { emit() }` enforces same-context emission and throws
            // "Flow invariant is violated" there; `channelFlow { send() }` is
            // concurrency-safe across that boundary (Tier 0 / Coroutines §4).
            // `attempt` counts CONSECUTIVE failures. A connection that made real
            // progress (delivered >=1 tick) resets it, so a feed that legitimately
            // reconnects all day doesn't slowly exhaust the budget and throw —
            // maxRetries bounds a run of back-to-back failures, not lifetime churn.
            var attempt = 0
            while (true) {
                try {
                    var progressed = false
                    streamOnce(symbol) { tick ->
                        progressed = true
                        send(tick)
                    }
                    // A clean end-of-stream (channel closed) is itself transient
                    // for a feed that "never closes" — fall through to reconnect.
                    if (progressed) attempt = 0
                    logger.debug("price stream ended for ${symbol.value}; reconnecting")
                } catch (e: CancellationException) {
                    // FIRST in the catch chain (Tier 0 / Coroutines §1, Errors §1):
                    // the user left the screen / scope was cancelled. Let it unwind.
                    throw e
                } catch (e: GatewayStreamException) {
                    if (!isRetryable(e.statusCode)) {
                        // Terminal: do NOT return a fake tick (Errors §9) — propagate.
                        throw e
                    }
                    logger.warn("retryable gateway status ${e.statusCode} for ${symbol.value}", e)
                } catch (e: Exception) {
                    // Re-check cancellation defensively before treating as transient
                    // (a child failure could have masked a cancel).
                    coroutineContext.ensureActive()
                    logger.warn("transient transport error for ${symbol.value}", e)
                }

                if (attempt >= retryPolicy.maxRetries) {
                    throw GatewayStreamException(
                        statusCode = -1,
                        message = "price stream for ${symbol.value} failed after ${retryPolicy.maxRetries} retries",
                    )
                }
                val backoff = retryPolicy.delayForAttempt(attempt, random)
                attempt++
                delay(backoff) // virtual under runTest — backoff tests run instantly
            }
        }.flowOn(streamDispatcher)

    /**
     * One connection attempt. Opens the GET as a live channel via
     * `prepareGet{}.execute{}`, frames `price:<n>` lines off the wire as they
     * arrive, and hands each decoded tick to [onTick]. Returns normally when the
     * server closes the channel; throws [GatewayStreamException] on a non-2xx
     * head; lets transport exceptions and `CancellationException` propagate.
     *
     * We read line-by-line with `readLine()` — the channel yields a complete
     * frame as soon as a `\n` lands, long before any full body (which never
     * arrives). We never call `bodyAsText()` on the success path: it suspends
     * until the body ends, which for this feed is never, and would buffer the
     * whole stream in memory — O(n) growth on an infinite source
     * (Tier 0 / Performance §5).
     */
    private suspend fun streamOnce(symbol: Symbol, onTick: suspend (PriceTick) -> Unit) {
        val url = "$baseUrl/v1/stream/${symbol.value}"
        client.prepareGet(url) {
            headers { append("Accept", "text/plain") }
        }.execute { response ->
            if (response.status != HttpStatusCode.OK) {
                // Read the (finite) error body only on the failure path. Don't log
                // the raw body — it can echo headers/keys (Tier 0 / Security §2).
                val errorBody = runCatching { response.bodyAsText() }.getOrNull().orEmpty()
                throw GatewayStreamException(
                    statusCode = response.status.value,
                    message = "gateway returned ${response.status.value} for stream " +
                        "(${errorBody.length} bytes of error body)",
                )
            }
            val channel = response.bodyAsChannel()
            // Frame incrementally over the channel's own buffer — one allocation
            // per complete line, never a re-materialised accumulator.
            while (true) {
                val line = channel.readLine() ?: break // null = channel closed
                val tick = parseLine(symbol, line) ?: continue
                onTick(tick)
            }
        }
    }

    /**
     * Parses one `price:<number>` frame. Tolerates surrounding whitespace,
     * keep-alive blank lines, and malformed lines (skipped, counted via the
     * logger) so a single bad frame never kills a long-lived stream. Returns
     * null for "no tick here" rather than a sentinel (Tier 0 / Ergonomics §2).
     */
    private fun parseLine(symbol: Symbol, rawLine: String): PriceTick? {
        val line = rawLine.trim()
        if (line.isEmpty()) return null // keep-alive newline
        val value = line.removePrefix(PRICE_PREFIX)
        if (value.length == line.length) {
            logger.debug("ignoring non-price frame")
            return null
        }
        val price = value.trim().toDoubleOrNull()
        if (price == null) {
            logger.warn("unparseable price frame for ${symbol.value}")
            return null
        }
        return PriceTick(symbol, price)
    }

    private companion object {
        private const val PRICE_PREFIX = "price:"

        /**
         * Retryable: 408 (timeout), 425 (too early), 429 (rate limit), and any
         * 5xx; plus the synthetic -1 used for transport errors. Terminal:
         * 400/401/403/404/422 — fail fast (Tier 0 / Errors §3).
         */
        private fun isRetryable(statusCode: Int): Boolean =
            statusCode == 408 || statusCode == 425 || statusCode == 429 || statusCode in 500..599
    }
}
