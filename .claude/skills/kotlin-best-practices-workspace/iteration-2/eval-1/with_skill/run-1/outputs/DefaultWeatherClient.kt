package dev.example.weather

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlin.concurrent.atomics.AtomicBoolean
import kotlin.concurrent.atomics.ExperimentalAtomicApi

/**
 * Internal implementation of [WeatherClient].
 *
 * Kept `internal` so it never enters the public ABI: consumers depend only on
 * the [WeatherClient] interface, and this class can be rewritten, renamed, or
 * replaced without a binary break. It is a skeleton here — the public surface is
 * the deliverable — but it is shaped to the rules the real implementation must
 * follow, so the contract is honest:
 *
 *  - `currentForecast` is `suspend` and main-safe (real impl wraps its I/O in
 *    `withContext(ioDispatcher)` with an injected dispatcher).
 *  - `forecastUpdates` returns a **cold** [Flow] built with `flow { }`; the real
 *    impl sets its dispatcher with `.flowOn(...)` as the last operator (never a
 *    `withContext`/`launch` around `emit`).
 *  - failures are mapped to typed [WeatherError]s; cancellation is rethrown
 *    first in any broad catch, and no default forecast is fabricated on error.
 *  - [close] is idempotent (guarded by an atomic flag) so callers can `use { }`
 *    it safely and double-close is a no-op.
 */
@OptIn(ExperimentalAtomicApi::class)
internal class DefaultWeatherClient(
    private val config: WeatherClientConfig,
) : WeatherClient {

    private val closed = AtomicBoolean(false)

    override suspend fun currentForecast(location: Location): Forecast {
        check(!closed.load()) { "WeatherClient has been closed" }
        // Real implementation: main-safe HTTP GET inside withContext(ioDispatcher),
        // decode through one reused Json, classify failures into WeatherError,
        // rethrow CancellationException first in any broad catch, retry retryable
        // statuses with jittered capped backoff honouring Retry-After.
        throw NotImplementedError("transport not wired in this surface sketch")
    }

    override fun forecastUpdates(location: Location): Flow<Forecast> = flow {
        check(!closed.load()) { "WeatherClient has been closed" }
        // Real implementation: poll/subscribe and emit() each update here, then
        // `.flowOn(ioDispatcher)` as the terminal operator below. Cold: nothing
        // runs until the caller collects.
        throw NotImplementedError("transport not wired in this surface sketch")
    } // real impl: .flowOn(config /* injected ioDispatcher */)

    override fun close() {
        // Idempotent: only the first close releases resources.
        if (closed.compareAndSet(expectedValue = false, newValue = true)) {
            // Real implementation: close the owned HTTP engine / connection pool.
            config.logger.log(Logger.Level.DEBUG, "WeatherClient closed")
        }
    }
}
