package dev.example.weather

/**
 * Optional client tuning passed to [WeatherClient.create].
 *
 * Like [Forecast], this is intentionally a plain class and not a `data class`,
 * so options can be appended over time without an ABI break. A single
 * constructor with defaulted parameters keeps Kotlin call sites terse; the
 * [Builder] gives Swift (where defaults do not bridge) and Java a fluent path
 * to the same thing. New options are added as new defaulted params here plus a
 * new setter on [Builder] — both source- and binary-compatible.
 */
public class Configuration(
    /** Per-request timeout. Defaults to 10 seconds. */
    public val requestTimeoutMillis: Long = 10_000L,
    /** How many times a transient ([WeatherError.Network]) failure is retried. */
    public val maxRetries: Int = 2,
    /** Base URL of the upstream service; override for staging or a proxy. */
    public val baseUrl: String = "https://api.example.dev/weather/v1",
) {
    init {
        require(requestTimeoutMillis > 0) { "requestTimeoutMillis must be > 0" }
        require(maxRetries >= 0) { "maxRetries must be >= 0" }
    }

    public class Builder {
        private var requestTimeoutMillis: Long = 10_000L
        private var maxRetries: Int = 2
        private var baseUrl: String = "https://api.example.dev/weather/v1"

        public fun requestTimeoutMillis(value: Long): Builder = apply { requestTimeoutMillis = value }
        public fun maxRetries(value: Int): Builder = apply { maxRetries = value }
        public fun baseUrl(value: String): Builder = apply { baseUrl = value }

        public fun build(): Configuration = Configuration(requestTimeoutMillis, maxRetries, baseUrl)
    }
}
