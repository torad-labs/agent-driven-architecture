package com.acme.trading.pricewatch

import io.ktor.client.plugins.ResponseException
import io.ktor.client.plugins.sse.SSEClientException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonIgnoreUnknownKeys
import kotlin.math.min
import kotlin.random.Random
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/**
 * A trading instrument symbol, e.g. `AAPL`, `BTC-USD`.
 *
 * A `@JvmInline value class` over `String`: type-safe (you can't pass a raw
 * username where a symbol is expected) and zero heap cost on the JVM, with the
 * non-empty/whitespace invariant enforced once in `init`.
 */
@JvmInline
public value class Symbol(public val value: String) {
    init {
        require(value.isNotBlank()) { "Symbol must not be blank" }
    }
}

/**
 * One price observation, as surfaced to the UI.
 *
 * `price`/`change` are exposed as `String` deliberately — money is never a
 * `Double`. A real app would use a decimal type; the wire carries the canonical
 * decimal string and the UI/formatter consumes it without lossy parsing.
 *
 * @property symbol the instrument this tick belongs to.
 * @property price last traded price as a canonical decimal string.
 * @property change absolute change since previous close, decimal string.
 * @property timestampEpochMs server-assigned event time in epoch milliseconds.
 */
public data class PriceTick(
    val symbol: Symbol,
    val price: String,
    val change: String,
    val timestampEpochMs: Long,
)

/** Wire DTO for a single SSE `data:` payload. Kept separate from [PriceTick] so the
 * transport schema can evolve without changing the UI-facing model. */
@Serializable
@JsonIgnoreUnknownKeys // forward-compat: new server fields don't crash older builds
internal data class PriceTickWire(
    @SerialName("p") val price: String,
    @SerialName("c") val change: String,
    @SerialName("t") val timestamp: Long,
) {
    fun toDomain(symbol: Symbol): PriceTick =
        PriceTick(symbol = symbol, price = price, change = change, timestampEpochMs = timestamp)
}

/** Coarse classification of why a stream attempt ended. */
public enum class PriceStreamErrorKind {
    /** Connection dropped / reset / timed out before a clean end. */
    Transport,

    /** Server returned an HTTP error status. See [PriceStreamError.status]. */
    Http,

    /** Anything else (e.g. unexpected client-side failure). */
    Unknown,
}

/**
 * Typed failure for the price stream, carrying machine-readable fields so the
 * retry layer branches on [isRetryable] / [status] — never on a substring of the
 * message.
 *
 * @property attempts every failure collected across retries (not just the last),
 *   so a caller can log the full history on exhaustion.
 */
public class PriceStreamError(
    public val symbol: Symbol,
    public val kind: PriceStreamErrorKind,
    public val status: Int?,
    public val isRetryable: Boolean,
    message: String,
    cause: Throwable? = null,
    public val attempts: List<PriceStreamError> = emptyList(),
) : Exception(message, cause)

/**
 * Backoff + retry configuration for transient stream failures.
 *
 * @property maxRetries cap on reconnection attempts after the first connect.
 * @property baseDelay first backoff step; doubles each attempt up to [maxDelay].
 * @property maxDelay ceiling for a single backoff step.
 * @property overallDeadline upper bound on the *whole* watch including backoff;
 *   [Duration.INFINITE] for a screen meant to stay live indefinitely.
 */
public data class RetryPolicy(
    val maxRetries: Int = 8,
    val baseDelay: Duration = 500.milliseconds,
    val maxDelay: Duration = 30.seconds,
    val overallDeadline: Duration = Duration.INFINITE,
) {
    /**
     * Full-jitter exponential backoff: `random(0, min(maxDelay, base * 2^attempt))`.
     * The random term is essential — jitter-free backoff resynchronizes every
     * client that dropped at the same moment into a retry spike (thundering herd).
     */
    public fun backoffFor(attempt: Int, random: Random): Duration {
        val exp = baseDelay.inWholeMilliseconds.toDouble() * (1L shl attempt.coerceAtMost(30))
        val capped = min(exp, maxDelay.inWholeMilliseconds.toDouble())
        return random.nextDouble(0.0, capped).milliseconds
    }
}

/**
 * Map a raw transport/HTTP throwable onto a typed [PriceStreamError] with a
 * retryability verdict. Retryable: transport errors and 408/425/429/5xx.
 * Terminal: 4xx auth/validation (400/401/403/404/422) — failing fast avoids
 * hammering the gateway with a request it will keep rejecting.
 */
internal fun Throwable.toPriceStreamError(symbol: Symbol): PriceStreamError {
    // The SSE plugin throws SSEClientException for a non-2xx / wrong-content-type
    // response (it is an IllegalStateException, NOT a ResponseException); the
    // generic HTTP path throws ResponseException. Check both to recover the status.
    val status: Int? = (this as? SSEClientException)?.response?.status?.value
        ?: (this as? ResponseException)?.response?.status?.value
    val (kind, retryable) = when {
        status == null -> PriceStreamErrorKind.Transport to true
        status in RETRYABLE_STATUSES || status in 500..599 -> PriceStreamErrorKind.Http to true
        else -> PriceStreamErrorKind.Http to false
    }
    return PriceStreamError(
        symbol = symbol,
        kind = kind,
        status = status,
        isRetryable = retryable,
        message = message ?: "${kind.name} failure for ${symbol.value}" +
            (status?.let { " (HTTP $it)" } ?: ""),
        cause = this,
    )
}

private val RETRYABLE_STATUSES = setOf(408, 425, 429)
