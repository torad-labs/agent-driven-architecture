package dev.example.weather

/**
 * The outcome of a forecast request: either a [Success] carrying a [Forecast],
 * or a [Failure] carrying a [WeatherError].
 *
 * Modeled as a `sealed interface` so the set of outcomes is closed and known at
 * compile time, which lets Kotlin callers `when` over it exhaustively and lets
 * Swift callers `switch` over it. We return this for *expected* outcomes —
 * network down, location not found, rate limited — rather than throwing, because
 * those are normal operating conditions a caller should handle, not bugs.
 *
 * Cancellation and genuine programming errors are NOT represented here; they
 * propagate as exceptions (a [Failure] for cancellation would let callers
 * silently swallow it and break structured concurrency).
 *
 * A sealed *interface* (not a sealed class) is used because it is the more
 * forgiving choice for a published ABI and permits richer future modeling.
 */
public sealed interface WeatherResult {

    /** The request succeeded. */
    public class Success(
        public val forecast: Forecast,
    ) : WeatherResult {
        override fun equals(other: Any?): Boolean =
            this === other || (other is Success && forecast == other.forecast)

        override fun hashCode(): Int = forecast.hashCode()

        override fun toString(): String = "Success(forecast=$forecast)"
    }

    /** The request failed in an expected, recoverable way. */
    public class Failure(
        public val error: WeatherError,
    ) : WeatherResult {
        override fun equals(other: Any?): Boolean =
            this === other || (other is Failure && error == other.error)

        override fun hashCode(): Int = error.hashCode()

        override fun toString(): String = "Failure(error=$error)"
    }
}

/** Returns the [Forecast] if this is a [WeatherResult.Success], or `null` otherwise. */
public fun WeatherResult.forecastOrNull(): Forecast? =
    (this as? WeatherResult.Success)?.forecast
