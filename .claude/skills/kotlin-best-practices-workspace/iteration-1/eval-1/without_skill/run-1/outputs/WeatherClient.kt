package dev.example.weather

/**
 * Entry point for the weather API.
 *
 * Obtain an instance via [WeatherClient.create]. Implementations are safe to
 * share and call concurrently. Hold a single instance for the lifetime of your
 * application rather than creating one per request.
 *
 * This is an `interface` rather than a concrete class on purpose: it lets the
 * implementation evolve (caching, retries, request coalescing) without changing
 * the type callers compile against, and it lets tests substitute a fake without
 * a mocking framework. New capabilities are added as new methods with default
 * implementations so existing binaries keep linking.
 */
public interface WeatherClient {

    /**
     * Fetches the current forecast for the given coordinates.
     *
     * This is a `suspend` function so it bridges to Swift `async`/`await` and to
     * Kotlin coroutines without exposing a callback or a platform-specific
     * future type. It is main-safe: callers may invoke it from any dispatcher.
     *
     * The returned [WeatherResult] models success and the expected failure modes
     * as data. Programming errors (e.g. a malformed [location]) and coroutine
     * cancellation are surfaced as exceptions, not as a result variant.
     *
     * @param location the point to forecast for.
     * @return a [WeatherResult] describing the forecast or why it was unavailable.
     */
    public suspend fun forecast(location: Location): WeatherResult

    public companion object {
        /**
         * Creates a [WeatherClient].
         *
         * Factory functions are used instead of a public constructor so the
         * concrete type stays internal and can change freely. Required inputs
         * are explicit parameters; everything optional lives on [Configuration]
         * with sensible defaults, which keeps the call site readable from Swift
         * (where Kotlin default arguments do not bridge) and lets new options be
         * added without changing this signature.
         *
         * @param apiKey credential for the upstream weather service.
         * @param configuration optional tuning; see [Configuration].
         */
        public fun create(
            apiKey: String,
            configuration: Configuration = Configuration(),
        ): WeatherClient = DefaultWeatherClient(apiKey, configuration)
    }
}
