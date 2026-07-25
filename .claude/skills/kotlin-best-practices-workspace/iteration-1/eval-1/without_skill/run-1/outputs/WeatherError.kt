package dev.example.weather

/**
 * The expected ways a forecast request can fail.
 *
 * This is the single most important type for "ageing well," so the design
 * choices here are deliberate:
 *
 *  - It is a `sealed class` of distinct subtypes, each carrying exactly the data
 *    relevant to that failure. Callers can `when`/`switch` and react
 *    specifically (e.g. show a retry button only for [Network]).
 *
 *  - It extends [Throwable] (rather than being a plain sealed hierarchy) so a
 *    [WeatherResult.Failure] can be turned into a throw at the call site when a
 *    caller would rather propagate than branch, and so it carries a [cause] and
 *    a stack trace for logging. It is still returned-as-data by default.
 *
 *  - There is an open-ended [Unexpected] case. New, more specific failure kinds
 *    can be introduced over time, but anything this version cannot classify
 *    lands in [Unexpected] instead of leaking an arbitrary exception type
 *    through the public surface. This is what keeps the `when` in old consumer
 *    code from silently missing a case the server starts returning — they
 *    already handle [Unexpected].
 *
 * `message` and `cause` are constructor params funneled into [Throwable] so
 * every subtype has a useful description and preserves the underlying error.
 */
public sealed class WeatherError(
    message: String,
    cause: Throwable? = null,
) : Throwable(message, cause) {

    /**
     * The request could not reach the server, timed out, or the connection
     * dropped. Typically transient and worth retrying.
     */
    public class Network(
        message: String = "Network error",
        cause: Throwable? = null,
    ) : WeatherError(message, cause)

    /** No forecast exists for the requested [Location]. */
    public class LocationNotFound(
        public val location: Location,
    ) : WeatherError("No forecast available for $location")

    /** The API key was missing, invalid, or expired. */
    public class Unauthorized(
        message: String = "Invalid or missing API key",
    ) : WeatherError(message)

    /**
     * The caller has exceeded the upstream rate limit.
     *
     * @property retryAfterSeconds server-suggested cool-off before retrying, or
     *   `null` if the server gave no hint.
     */
    public class RateLimited(
        public val retryAfterSeconds: Long? = null,
    ) : WeatherError(
        if (retryAfterSeconds != null) "Rate limited; retry after ${retryAfterSeconds}s"
        else "Rate limited",
    )

    /**
     * The server returned an error response (5xx) or a payload this version of
     * the library could not parse.
     *
     * @property statusCode the HTTP status, or `null` if the failure was a
     *   parse/protocol error rather than an HTTP status.
     */
    public class Server(
        public val statusCode: Int? = null,
        message: String = "Server error",
        cause: Throwable? = null,
    ) : WeatherError(message, cause)

    /**
     * A failure this version of the library cannot classify into a more
     * specific case above. Catch-all that keeps the surface forward-compatible.
     */
    public class Unexpected(
        message: String = "Unexpected error",
        cause: Throwable? = null,
    ) : WeatherError(message, cause)
}
