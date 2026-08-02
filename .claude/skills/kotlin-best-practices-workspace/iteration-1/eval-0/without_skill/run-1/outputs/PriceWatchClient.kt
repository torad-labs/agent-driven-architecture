package com.acme.trading.pricewatch

import io.ktor.client.HttpClient
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.plugins.ServerResponseException
import io.ktor.client.plugins.sse.SSEClientException
import io.ktor.client.plugins.sse.ServerSentEvent
import io.ktor.client.plugins.sse.sse
import io.ktor.client.request.url
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.retryWhen
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/**
 * A single price tick decoded from the SSE stream.
 *
 * @property symbol the instrument this tick belongs to, e.g. "BTC-USD".
 * @property price the last traded price.
 * @property timestampMillis server-supplied event time, epoch millis.
 */
@Serializable
public data class PriceTick(
    val symbol: String,
    val price: Double,
    val timestampMillis: Long,
)

/**
 * Connection lifecycle, surfaced so the UI can render "connecting…" / "reconnecting…"
 * states distinctly from the ticks themselves.
 */
public sealed interface PriceStreamState {
    public data object Connecting : PriceStreamState
    public data object Connected : PriceStreamState

    /** A transient failure occurred; the client is backing off before retrying. */
    public data class Reconnecting(val attempt: Int, val cause: Throwable) : PriceStreamState
}

/**
 * Decodes one SSE `data:` payload into a [PriceTick].
 *
 * Pulled out behind an interface so the JSON wire format can be unit-tested in
 * isolation, and swapped without touching the streaming/retry machinery.
 */
public fun interface PriceTickDecoder {
    /**
     * @return the decoded tick, or `null` if this event should be ignored
     *   (e.g. a server keep-alive / comment with no usable payload).
     * @throws SerializationException if [data] is present but malformed.
     */
    public fun decode(data: String): PriceTick?
}

/**
 * Backoff policy for transient reconnects. Injected so tests can supply a
 * deterministic, no-sleep implementation.
 */
public fun interface BackoffStrategy {
    /** Delay to wait before retry [attempt] (1-based). */
    public fun delayFor(attempt: Int): Duration
}

/**
 * Exponential backoff with full jitter, capped at [maxDelay].
 *
 * delay(attempt) = random(0, min(maxDelay, base * 2^(attempt-1)))
 *
 * Full jitter avoids the thundering-herd reconnect storm you get when many
 * clients drop off the same gateway at once.
 */
public class ExponentialBackoff(
    private val base: Duration = 500.milliseconds,
    private val maxDelay: Duration = 30.seconds,
    private val random: Random = Random.Default,
) : BackoffStrategy {
    override fun delayFor(attempt: Int): Duration {
        val exp = base.inWholeMilliseconds.toDouble() * 2.0.pow((attempt - 1).coerceAtLeast(0))
        val cappedMillis = min(exp, maxDelay.inWholeMilliseconds.toDouble())
        return (random.nextDouble() * cappedMillis).milliseconds
    }
}

/**
 * Streams live price ticks for a symbol from the ACME gateway over SSE.
 *
 * Design notes:
 * - [stream] returns a **cold** [Flow]: nothing connects until a collector starts,
 *   and the connection is bound to the collector's coroutine scope. Collect it in
 *   `viewModelScope` (or any lifecycle-scoped scope) and the SSE connection is torn
 *   down automatically and promptly when that scope is cancelled — i.e. when the
 *   user leaves the screen. There is no manual `close()` to forget.
 * - Transient failures (network drops, timeouts, 5xx) are retried with backoff.
 *   Permanent failures (4xx, bad payloads, cancellation) are *not* retried and
 *   surface to the collector.
 * - The [HttpClient] (with the SSE plugin installed), the decoder, the backoff
 *   strategy and the clock-free `delay` are all injectable, so the whole class is
 *   unit-testable against Ktor's `MockEngine` with virtual time.
 *
 * The caller owns the [HttpClient] lifecycle; this class never closes it.
 */
public class PriceWatchClient(
    private val httpClient: HttpClient,
    private val baseUrl: String = DEFAULT_BASE_URL,
    private val decoder: PriceTickDecoder = JsonPriceTickDecoder(),
    private val backoff: BackoffStrategy = ExponentialBackoff(),
    private val maxRetries: Int = Int.MAX_VALUE,
) {
    /**
     * Cold flow of ticks for [symbol]. Re-collecting starts a fresh connection.
     *
     * Connection lifecycle is reported through [onState] (optional) so the UI can
     * distinguish "connecting" from "reconnecting" without parsing the tick flow.
     */
    public fun stream(
        symbol: String,
        onState: (PriceStreamState) -> Unit = {},
    ): Flow<PriceTick> {
        require(symbol.isNotBlank()) { "symbol must not be blank" }
        val url = "${baseUrl.trimEnd('/')}/$symbol"

        return ticks(url, onState)
            .retryWhen { cause, attemptIndex ->
                // attemptIndex is 0-based count of *prior* failures.
                val attempt = (attemptIndex + 1).toInt()
                if (!cause.isTransient() || attempt > maxRetries) {
                    false // give up: rethrow to the collector
                } else {
                    onState(PriceStreamState.Reconnecting(attempt, cause))
                    delay(backoff.delayFor(attempt))
                    true
                }
            }
    }

    /** One connection attempt. Emits ticks until the server closes or it fails. */
    private fun ticks(
        url: String,
        onState: (PriceStreamState) -> Unit,
    ): Flow<PriceTick> = flow {
        onState(PriceStreamState.Connecting)
        httpClient.sse(request = { url(url) }) {
            onState(PriceStreamState.Connected)
            incoming.collect { event: ServerSentEvent ->
                val payload = event.data ?: return@collect
                decoder.decode(payload)?.let { emit(it) }
            }
        }
    }

    public companion object {
        public const val DEFAULT_BASE_URL: String = "https://gw.acme.trading/v1/stream"
    }
}

/**
 * Default [PriceTickDecoder] backed by kotlinx.serialization.
 *
 * Wire shape (one JSON object per SSE event):
 * `{"symbol":"BTC-USD","price":64250.5,"timestampMillis":1717603200000}`
 */
public class JsonPriceTickDecoder(
    private val json: Json = Json { ignoreUnknownKeys = true },
) : PriceTickDecoder {
    override fun decode(data: String): PriceTick? {
        if (data.isBlank()) return null
        return json.decodeFromString(PriceTick.serializer(), data)
    }
}

/**
 * Classifies a failure as *transient* (worth retrying) vs *permanent* (give up).
 *
 * - Cancellation is never transient — it must propagate to honour structured
 *   concurrency (otherwise leaving the screen wouldn't actually stop the stream).
 * - Network I/O and timeouts are transient.
 * - HTTP 5xx is transient; 4xx is a permanent client error (bad symbol, auth).
 * - Malformed payloads are permanent — retrying re-reads the same bad bytes.
 */
internal fun Throwable.isTransient(): Boolean = when (this) {
    // Cancellation drives structured concurrency — must never be retried.
    is CancellationException -> false
    // A malformed payload won't fix itself on re-read.
    is SerializationException -> false

    // Ktor surfaces a failed SSE handshake as SSEClientException carrying the
    // HttpResponse. Classify by status: 5xx is transient, everything else
    // (4xx, unknown) is permanent. If there is no response, the cause is a raw
    // transport failure (connection reset, etc.) → transient.
    is SSEClientException -> response?.status?.isTransientStatus()
        ?: ((cause ?: this).let { it is IOException || it is HttpRequestTimeoutException })

    // Present when expectSuccess validation is enabled on the client.
    is ServerResponseException -> true              // 5xx
    is ClientRequestException -> false              // 4xx

    is HttpRequestTimeoutException -> true
    is IOException -> true                          // connection reset, EOF, DNS, etc.
    is PriceStreamHttpException -> status.isTransientStatus()
    else -> false
}

private fun HttpStatusCode.isTransientStatus(): Boolean = value in 500..599

/**
 * Raised when application code (not Ktor) needs to signal a non-success status.
 * Carries the status so [isTransient] can decide whether a retry makes sense.
 * Ktor's own SSE failures arrive as [SSEClientException]; this type exists for
 * callers who post-validate inside the SSE session.
 */
public class PriceStreamHttpException(
    public val status: HttpStatusCode,
    message: String = "Price stream returned HTTP ${status.value}",
) : IOException(message)
