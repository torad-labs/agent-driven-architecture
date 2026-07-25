package dev.example.weather

/**
 * Default [WeatherClient] implementation.
 *
 * Deliberately `internal`: it is not part of the published surface, so it can be
 * rewritten, renamed, or replaced entirely without affecting callers, who only
 * ever see the [WeatherClient] interface. The body here is a stub — real wiring
 * (HTTP, serialization, retry) would live behind this same signature.
 */
internal class DefaultWeatherClient(
    private val apiKey: String,
    private val configuration: Configuration,
) : WeatherClient {

    override suspend fun forecast(location: Location): WeatherResult {
        if (apiKey.isBlank()) {
            return WeatherResult.Failure(WeatherError.Unauthorized())
        }
        // Real implementation would perform the network call here, mapping
        // transport/HTTP outcomes onto WeatherResult / WeatherError, retrying up
        // to configuration.maxRetries on WeatherError.Network.
        val placeholder = Forecast.Builder(
            location = location,
            temperature = Temperature.celsius(0.0),
        ).condition(SkyCondition.UNKNOWN)
            .build()
        return WeatherResult.Success(placeholder)
    }
}
