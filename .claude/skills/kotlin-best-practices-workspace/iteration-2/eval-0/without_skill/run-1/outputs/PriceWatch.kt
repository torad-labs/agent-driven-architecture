package com.acme.pricewatch

import io.ktor.client.HttpClient
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsChannel
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.http.encodeURLPathPart
import io.ktor.utils.io.readUTF8Line
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow

/**
 * A single price update read off the wire.
 *
 * @property symbol the instrument the quote is for (e.g. `"BTCUSD"`).
 * @property price the parsed numeric price.
 */
public data class PriceTick(
    val symbol: String,
    val price: Double,
)

/**
 * Thrown when the gateway answers a stream request with a non-2xx status.
 *
 * This is a *terminal* failure — it is NOT retried, because a 401/404/422 will
 * not fix itself by reconnecting. The [status] and [body] are carried through so
 * the caller (or a log) can see exactly what the gateway said.
 */
public class PriceStreamHttpException(
    public val status: Int,
    public val body: String,
) : Exception("price stream request failed with HTTP $status: $body")

/**
 * Internal sentinel: the gateway accepted a connection but closed it without
 * sending any data. Treated as a transient failure so it counts against the
 * reconnect budget (preventing an unbounded reconnect storm against an endpoint
 * that instantly closes). Never escapes [PriceWatchClient.stream] unless the
 * budget is exhausted.
 */
internal object EmptyStreamException : Exception("price stream closed before any data arrived")

/**
 * Tunables for the reconnect loop. Defaults are deliberately conservative for a
 * long-lived UI stream: a fast first reconnect, capped exponential backoff, and
 * a bounded number of *consecutive* transient failures before the flow gives up
 * and surfaces the error to the collector.
 *
 * @property maxRetries maximum number of *consecutive* transient reconnects
 *   before the last error is re-thrown to the collector. A successful connection
 *   that then drops resets this counter (see [PriceWatchClient.stream]).
 * @property baseDelayMs delay before the first reconnect.
 * @property maxDelayMs ceiling for the exponentially-growing delay.
 */
public data class ReconnectPolicy(
    val maxRetries: Int = 5,
    val baseDelayMs: Long = 500L,
    val maxDelayMs: Long = 10_000L,
)

/**
 * Parses one raw wire line into a [PriceTick], or `null` if the line is not a
 * tick we care about (blank line, keep-alive, comment, or malformed number).
 *
 * The gateway framing is newline-delimited `price:<number>` — e.g. `price:42.5`.
 * Anything that does not match that shape is skipped rather than throwing: a
 * stray keep-alive or a half-corrupted line must not tear down a long-lived
 * subscription.
 *
 * Pure and side-effect free, so it is unit-testable on its own without a client,
 * an engine, or a coroutine.
 */
internal fun parsePriceLine(symbol: String, line: String): PriceTick? {
    val trimmed = line.trim()
    if (trimmed.isEmpty()) return null
    val prefix = "price:"
    if (!trimmed.startsWith(prefix)) return null
    val price = trimmed.removePrefix(prefix).trim().toDoubleOrNull() ?: return null
    return PriceTick(symbol = symbol, price = price)
}

/**
 * Decides whether a thrown error is a *transient* network problem worth
 * reconnecting for, versus a terminal failure that should propagate.
 *
 * - [CancellationException] is never transient — it means the collector left the
 *   screen and we must shut down immediately (handled at the call site, but
 *   guarded here too for safety).
 * - [PriceStreamHttpException] is terminal — a bad status will not self-heal.
 * - Everything else (connection reset, read timeout, DNS blip, EOF mid-stream)
 *   is treated as transient.
 *
 * Note: Ktor surfaces network failures as `java.io.IOException` on JVM and as
 * other platform exceptions on Native/JS, so we classify by *exclusion* (not by
 * matching a JVM-only type) to stay multiplatform-safe.
 */
internal fun isTransient(error: Throwable): Boolean =
    when (error) {
        is CancellationException -> false
        is PriceStreamHttpException -> false
        else -> true
    }

/**
 * Streams newline-delimited `price:<number>` ticks from the Acme pricing
 * gateway and exposes them as a cold [Flow] of [PriceTick].
 *
 * The gateway endpoint (`GET /v1/stream/{symbol}`) is a long-lived plain-HTTP
 * connection that never closes — this is **not** SSE, so we read the response
 * body channel ourselves and frame lines.
 *
 * @param httpClient the Ktor client. Injected (not constructed internally) so a
 *   test can supply a `MockEngine`-backed client and so the caller owns the
 *   client lifecycle.
 * @param baseUrl gateway base, no trailing slash.
 * @param reconnect backoff policy for transient drops.
 */
public class PriceWatchClient(
    private val httpClient: HttpClient,
    private val baseUrl: String = "https://gw.acme.trading",
    private val reconnect: ReconnectPolicy = ReconnectPolicy(),
) {
    /**
     * Returns a **cold** flow of ticks for [symbol]. Each collector opens its
     * own connection on collection and closes it on cancellation:
     *
     * - **As-they-arrive:** the body stays a live channel via
     *   `prepareGet{}.execute{}`; `readUTF8Line()` yields each frame the instant
     *   it lands, long before the (never-arriving) end of the body.
     * - **Retry on transient errors:** a dropped/reset connection waits with
     *   capped exponential backoff and reconnects, up to
     *   [ReconnectPolicy.maxRetries] *consecutive* failures. A connection that
     *   produced at least one line resets the failure counter, so a stream that
     *   stays up for hours and then blips still gets the full retry budget.
     * - **Clean shutdown:** when the collector is cancelled (user leaves the
     *   screen), the suspended `readUTF8Line()` throws [CancellationException],
     *   which unwinds through `execute {}` and aborts the in-flight request —
     *   structured concurrency, no leaked socket. We never retry a cancellation.
     *
     * `channelFlow` (not plain `flow`) is required: on some Ktor engines
     * `execute {}` runs its body — and therefore our `send()` — in a different
     * coroutine/context than the collector. A plain `flow { emit() }` enforces
     * same-context emission and throws "Flow invariant is violated" there;
     * `channelFlow { send() }` is safe across that boundary.
     */
    public fun stream(symbol: String): Flow<PriceTick> = channelFlow {
        val url = "$baseUrl/v1/stream/${symbol.encodeURLPathPart()}"
        var consecutiveFailures = 0
        var nextDelay = reconnect.baseDelayMs

        while (true) {
            try {
                val producedAtLeastOne = connectAndStream(url, symbol) { tick -> send(tick) }
                if (producedAtLeastOne) {
                    // A connection that delivered data and then ended (server
                    // rotation/deploy) is a *successful* session: reset the
                    // budget and reconnect with a fresh backoff schedule.
                    consecutiveFailures = 0
                    nextDelay = reconnect.baseDelayMs
                } else {
                    // The gateway accepted the connection but closed it with no
                    // data. That is itself a transient failure — and crucially it
                    // MUST count against the retry budget, otherwise an endpoint
                    // that instantly closes turns this loop into an unbounded
                    // reconnect storm. Route it through the same accounting as a
                    // thrown transient error.
                    throw EmptyStreamException
                }
            } catch (ce: CancellationException) {
                throw ce // collector left the screen — propagate, do not retry.
            } catch (t: Throwable) {
                if (!isTransient(t) || consecutiveFailures >= reconnect.maxRetries) throw t
                consecutiveFailures += 1
                // Backoff before reconnecting. delay() is cancellation-
                // cooperative, so a screen-exit during backoff also shuts the
                // flow down promptly. Only failed attempts wait — a successful
                // session reconnects immediately above.
                if (nextDelay > 0) delay(nextDelay)
                nextDelay = (nextDelay * 2).coerceAtMost(reconnect.maxDelayMs)
            }
        }
    }

    /**
     * Opens one connection and pumps frames to [onTick] until the channel ends
     * or an error is thrown. Returns `true` if at least one tick was emitted on
     * this connection (used to reset the reconnect budget).
     *
     * A non-2xx response is mapped to a terminal [PriceStreamHttpException].
     */
    private suspend fun connectAndStream(
        url: String,
        symbol: String,
        onTick: suspend (PriceTick) -> Unit,
    ): Boolean {
        var produced = false
        httpClient.prepareGet(url).execute { response ->
            if (response.status != HttpStatusCode.OK) {
                throw PriceStreamHttpException(
                    status = response.status.value,
                    body = response.bodyAsText(),
                )
            }
            val channel = response.bodyAsChannel()
            while (true) {
                val line = channel.readUTF8Line() ?: break
                val tick = parsePriceLine(symbol, line) ?: continue
                onTick(tick)
                produced = true
            }
        }
        return produced
    }
}
