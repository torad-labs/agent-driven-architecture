/*
 * Public surface for a small Kotlin Multiplatform weather library (JVM + iOS),
 * published to Maven Central and consumed from Android and Swift.
 *
 * Everything here lives in `commonMain`. The module is assumed to enable
 * `explicitApi()` in strict mode and to gate this surface on a committed ABI
 * dump, so every public declaration carries an explicit visibility modifier and
 * an explicit return / property type — inferred types pin the *compiled*
 * signature to whatever inference produced and turn a harmless body edit into a
 * silent binary break.
 */
package dev.example.weather

import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.Serializable

/**
 * Entry point for the weather library.
 *
 * Obtain an instance with [WeatherClient.create] and reuse it for the lifetime
 * of the feature — it owns a connection pool and caches serializer descriptors,
 * so per-call construction is wasteful.
 *
 * The client is an [AutoCloseable]. JVM/Android callers should wrap it in
 * `use { }`; Swift/iOS callers must call [close] when the owning screen or
 * scope goes away. [close] is idempotent.
 *
 * This is an `interface` rather than a `class` on purpose: it keeps the public
 * implementation type out of the ABI (the real implementation can be replaced
 * without a binary break), lets tests substitute a fake without a network, and
 * — combined with the [create] factory below — avoids `expect class`, which is
 * still Beta on KMP.
 *
 * @since 1.0.0
 */
public interface WeatherClient : AutoCloseable {

    /**
     * Fetches the current forecast for a location.
     *
     * A one-shot read, so it is a `suspend fun`. It is main-safe: callers may
     * invoke it from `Dispatchers.Main` / a Swift `Task` without freezing the
     * UI, because the implementation confines its blocking I/O to an injected
     * I/O dispatcher.
     *
     * On iOS (via SKIE) this surfaces as a Swift `async` function that throws;
     * the failure is one of the [WeatherError] variants.
     *
     * @throws WeatherError on any failure. Inspect [WeatherError.isRetryable]
     *   to decide whether a retry is worthwhile; the library does not silently
     *   substitute a default forecast on failure.
     * @since 1.0.0
     */
    public suspend fun currentForecast(location: Location): Forecast

    /**
     * Observes the forecast for a location, re-emitting whenever the upstream
     * provider publishes an update.
     *
     * Streaming, so it is a **non-suspend** function returning a **cold**
     * [Flow]: nothing happens until the caller collects, and collection is
     * lazily cancellable. The implementation sets its dispatcher with
     * `.flowOn(...)` internally; callers just collect.
     *
     * On iOS (via SKIE) this surfaces as a Swift `AsyncSequence`.
     *
     * Errors are delivered through the flow (a terminal failure of the
     * collector) as [WeatherError], so `try`/`catch` around `collect` — or
     * Swift's `for try await` — observes them.
     *
     * @since 1.0.0
     */
    public fun forecastUpdates(location: Location): Flow<Forecast>

    public companion object {
        /**
         * Creates a [WeatherClient].
         *
         * Required configuration is a single [apiKey]. Everything else is
         * optional and supplied through the [WeatherClientConfig] builder, which
         * is the designated growth point: new knobs are added as new builder
         * methods, never as new parameters on this factory. That keeps this
         * factory's JVM descriptor frozen — appending a parameter here (even a
         * defaulted one) would move the descriptor and throw `NoSuchMethodError`
         * in already-compiled callers.
         *
         * @param apiKey credential for the upstream weather provider. Never
         *   logged; the implementation routes diagnostics through an injected
         *   logger seam and redacts auth before any egress.
         * @param configure optional configuration block.
         * @since 1.0.0
         */
        public fun create(
            apiKey: String,
            configure: WeatherClientConfig.() -> Unit = {},
        ): WeatherClient = DefaultWeatherClient(WeatherClientConfig(apiKey).apply(configure))
    }
}

/**
 * A geographic location to query.
 *
 * A regular class with a private constructor and a named factory function rather
 * than a `data class`: a public `data class` cannot gain a field without
 * changing its synthesized constructor / `copy(...)` descriptors (a binary
 * break), and reordering its fields remaps `componentN()`. Modelling it this way
 * lets the type grow (e.g. add an altitude or a named-place lookup) additively.
 *
 * `@Serializable` so consumers can persist or cache a queried location. The
 * coordinate-range invariant lives in an `init` block, not only in the factory,
 * so it is enforced on the deserialization path too — kotlinx.serialization
 * constructs through the primary constructor and runs `init`, so a malformed
 * stored payload fails fast instead of producing an invalid value.
 *
 * @since 1.0.0
 */
@Serializable
public class Location private constructor(
    public val latitude: Double,
    public val longitude: Double,
) {
    init {
        require(latitude in -90.0..90.0) { "latitude out of range: $latitude" }
        require(longitude in -180.0..180.0) { "longitude out of range: $longitude" }
    }

    public companion object {
        /**
         * Builds a [Location] from WGS-84 coordinates.
         *
         * @throws IllegalArgumentException if [latitude] is outside -90..90 or
         *   [longitude] is outside -180..180 — a programming error, surfaced
         *   eagerly rather than carried as a recoverable [WeatherError].
         * @since 1.0.0
         */
        public fun ofCoordinates(latitude: Double, longitude: Double): Location =
            Location(latitude, longitude)
    }
}
