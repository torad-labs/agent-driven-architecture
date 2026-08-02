package dev.example.weather

import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/**
 * Mutable configuration assembled inside [WeatherClient.create]'s `configure`
 * block, then frozen into the client.
 *
 * This builder is the library's **designated growth point**. New options are
 * added here as new properties / methods — an additive (minor) change — instead
 * of as new parameters on [WeatherClient.create], whose descriptor must stay
 * frozen. The builder pattern is what lets the entry-point signature never move.
 *
 * Marked with a [@DslMarker][WeatherDsl] supertype so a nested configuration
 * block (if any are added later) can't silently configure this outer scope.
 *
 * Instances are not thread-safe and are meant to be touched only inside the
 * single-threaded `configure {}` lambda.
 *
 * @since 1.0.0
 */
@WeatherDsl
public class WeatherClientConfig internal constructor(
    /** The provider credential. Required; set from [WeatherClient.create]. */
    internal val apiKey: String,
) {
    /**
     * Base URL of the weather provider. Defaults to the production endpoint;
     * override for a regional endpoint or a test double.
     * @since 1.0.0
     */
    public var baseUrl: String = "https://api.example-weather.dev"

    /**
     * Preferred temperature unit for returned forecasts.
     * @since 1.0.0
     */
    public var preferredUnit: TemperatureUnit = TemperatureUnit.CELSIUS

    /**
     * Per-request timeout. Distinct from any overall retry deadline.
     * @since 1.0.0
     */
    public var requestTimeout: Duration = 30.seconds

    /**
     * Maximum number of retry attempts for retryable failures. `0` disables
     * retries. The client uses capped exponential backoff with full jitter and
     * honours `Retry-After` as a floor.
     * @since 1.0.0
     */
    public var maxRetries: Int = 3

    /**
     * Diagnostics sink. Defaults to [Logger.None] — a library must never pick a
     * platform log sink (Logcat / `os_log` / stdout) for the host. The host
     * opts in by supplying its own [Logger]. The client redacts credentials and
     * never logs raw request/response bodies regardless of the sink.
     * @since 1.0.0
     */
    public var logger: Logger = Logger.None
}

/**
 * `@DslMarker` for the configuration DSL, applied to the single builder
 * supertype rather than to individual builders, so scope-leak protection is
 * enforced uniformly if the DSL grows nested blocks.
 * @since 1.0.0
 */
@DslMarker
public annotation class WeatherDsl

/**
 * Diagnostics seam for the library.
 *
 * An injected interface with a no-op default ([None]) instead of any hard-coded
 * `println` / `NSLog` / `Log.d`. The host decides where (and whether) the
 * library logs.
 *
 * @since 1.0.0
 */
public interface Logger {
    /**
     * Logs a diagnostic message. Implementations must treat [message] as
     * already-redacted metadata; the library never passes secrets or raw bodies
     * here.
     * @since 1.0.0
     */
    public fun log(level: Level, message: String, cause: Throwable? = null)

    /** Severity of a log line. @since 1.0.0 */
    public enum class Level { DEBUG, INFO, WARN, ERROR }

    public companion object {
        /** A [Logger] that discards everything. The default. @since 1.0.0 */
        public val None: Logger = NoOpLogger
    }
}

private object NoOpLogger : Logger {
    override fun log(level: Logger.Level, message: String, cause: Throwable?) {
        // intentionally empty
    }
}
