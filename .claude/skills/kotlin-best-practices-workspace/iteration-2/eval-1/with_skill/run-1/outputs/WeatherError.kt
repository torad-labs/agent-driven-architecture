package dev.example.weather

/**
 * The single error type the library raises.
 *
 * Modelled as a **`sealed class` extending `Exception`**, which threads three
 * needs together:
 *
 *  - **Exception, so it works with `suspend`.** A thrown sealed exception maps
 *    cleanly through SKIE to a Swift `throws`/`async throws` function and to
 *    Kotlin's natural `try`/`catch`. (A `Result`-style return would surface on
 *    iOS as an opaque sealed object the Swift compiler cannot exhaustively
 *    switch, and would not integrate with `async throws`.)
 *  - **Sealed, so handling is exhaustive.** Consumers — including Swift via
 *    SKIE — get a `when`/`switch` with no `else`, and a new variant becomes a
 *    reviewed, deliberate change rather than a silent fall-through. The base is
 *    `sealed`, not `open`, precisely so external code cannot inject its own
 *    error subtypes into the contract.
 *  - **Machine-readable, so retry logic branches on fields, not message text.**
 *    [isRetryable] and [WeatherError.Http.status] let a caller decide on data,
 *    never by substring-matching a human-facing string.
 *
 * The hierarchy is closed and frozen for 1.x. New failure shapes that don't fit
 * an existing variant are reported as [Unexpected] rather than by adding a
 * subtype mid-major-version (which would break exhaustive `when`s consumers
 * wrote — a source break). A genuinely new variant waits for the next major.
 *
 * Every variant carries [cause] where one exists, so the original failure chain
 * is never dropped.
 *
 * @since 1.0.0
 */
public sealed class WeatherError(
    message: String,
    cause: Throwable?,
) : Exception(message, cause) {

    /**
     * Whether retrying the same request may succeed. Computed from the failure
     * kind so callers branch on a flag, not on parsing [message].
     * @since 1.0.0
     */
    public abstract val isRetryable: Boolean

    /**
     * A transport-level failure before a complete HTTP response was received —
     * connection refused, DNS failure, socket timeout. Retryable.
     * @since 1.0.0
     */
    public class Network internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = true
    }

    /**
     * The request exceeded its deadline. Retryable (with backoff).
     * @since 1.0.0
     */
    public class Timeout internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = true
    }

    /**
     * The provider returned a non-success HTTP status.
     *
     * [isRetryable] is derived from [status]: 408/425/429 and 5xx are
     * retryable; 4xx client errors (400/401/403/404/422) are terminal and fail
     * fast. [retryAfterSeconds] echoes the provider's `Retry-After` when present
     * so the caller can honour it as a floor before exponential backoff.
     * @since 1.0.0
     */
    public class Http internal constructor(
        /** The HTTP status code returned by the provider. @since 1.0.0 */
        public val status: Int,
        /**
         * Seconds the provider asked the caller to wait before retrying
         * (`Retry-After`), or `null` if it sent none. Absence is `null`, never
         * a sentinel.
         * @since 1.0.0
         */
        public val retryAfterSeconds: Long?,
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean =
            status == 408 || status == 425 || status == 429 || status in 500..599
    }

    /**
     * The credential supplied to [WeatherClient.create] was rejected by the
     * provider (401/403 surfaced as a distinct, clearly-actionable variant).
     * Terminal — retrying with the same key cannot succeed.
     * @since 1.0.0
     */
    public class Authentication internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = false
    }

    /**
     * A successful HTTP response whose body could not be decoded into the
     * library's model — a malformed or contract-violating payload. Terminal;
     * retrying yields the same bytes.
     * @since 1.0.0
     */
    public class Decoding internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = false
    }

    /**
     * A failure that does not fit any other variant. The escape hatch that lets
     * the closed hierarchy stay closed across 1.x: rather than add a subtype
     * (and break consumers' exhaustive `when`s), an unforeseen failure arrives
     * here with its [cause] preserved. Not retryable by default.
     * @since 1.0.0
     */
    public class Unexpected internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = false
    }
}
