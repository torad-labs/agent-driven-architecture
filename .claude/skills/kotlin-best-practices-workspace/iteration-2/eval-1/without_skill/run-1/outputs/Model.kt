package dev.example.weather

/**
 * A geographic point. Latitude in [-90, 90], longitude in [-180, 180].
 *
 * Constructed via [Location.of] so the values can be validated and so the
 * concrete representation can change later. Construction with out-of-range
 * values throws [IllegalArgumentException]: this is a caller programming error,
 * not a runtime weather failure, so it is not part of [WeatherResult].
 */
public class Location private constructor(
    public val latitude: Double,
    public val longitude: Double,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Location) return false
        return latitude == other.latitude && longitude == other.longitude
    }

    override fun hashCode(): Int = 31 * latitude.hashCode() + longitude.hashCode()

    override fun toString(): String = "Location(latitude=$latitude, longitude=$longitude)"

    public companion object {
        /**
         * Creates a validated [Location].
         *
         * @throws IllegalArgumentException if either coordinate is out of range.
         */
        public fun of(latitude: Double, longitude: Double): Location {
            require(latitude in -90.0..90.0) { "latitude out of range: $latitude" }
            require(longitude in -180.0..180.0) { "longitude out of range: $longitude" }
            return Location(latitude, longitude)
        }
    }
}

/**
 * Temperature, stored canonically in Celsius so call sites are never ambiguous
 * about units and so equality is well defined regardless of how a value was
 * created.
 *
 * Modeled as a regular class with named factories ([Temperature.celsius] /
 * [Temperature.fahrenheit]) rather than a raw `Double` parameter. That removes
 * the classic "is this number C or F?" bug at the API boundary. It is a plain
 * class rather than a `value class` because inline value classes do not bridge
 * cleanly to Swift/Objective-C.
 */
public class Temperature private constructor(
    /** The temperature in degrees Celsius. */
    public val celsius: Double,
) {
    /** The temperature in degrees Fahrenheit. */
    public val fahrenheit: Double
        get() = celsius * 9.0 / 5.0 + 32.0

    override fun equals(other: Any?): Boolean =
        this === other || (other is Temperature && celsius == other.celsius)

    override fun hashCode(): Int = celsius.hashCode()

    override fun toString(): String = "Temperature(celsius=$celsius)"

    public companion object {
        public fun celsius(value: Double): Temperature = Temperature(value)
        public fun fahrenheit(value: Double): Temperature = Temperature((value - 32.0) * 5.0 / 9.0)
    }
}

/**
 * General sky condition.
 *
 * An `enum` is the right tool for a closed, server-defined vocabulary. Note the
 * compatibility tradeoff that comes with it: adding a constant is binary-safe,
 * but an exhaustive `when`/`switch` in *consumer* code will need updating. The
 * [UNKNOWN] member is deliberate — it gives the deserializer a safe landing spot
 * for any future condition the server adds before this library knows about it,
 * so old apps degrade gracefully instead of crashing.
 */
public enum class SkyCondition {
    CLEAR,
    PARTLY_CLOUDY,
    CLOUDY,
    RAIN,
    SNOW,
    STORM,

    /** A condition this version of the library does not recognize. */
    UNKNOWN,
}

/**
 * A successfully retrieved forecast.
 *
 * This is intentionally **not** a `data class`. In a published library a data
 * class is a binary-compatibility trap: its generated `copy(...)` and
 * `componentN()` methods bake the current property list into the ABI, so adding
 * a field later breaks already-compiled callers. A normal class with read-only
 * `val`s lets new optional properties be appended over time without breaking
 * anyone. Construction is private and goes through [Builder] so new fields can
 * be added with defaults and the constructor signature never has to change.
 */
public class Forecast private constructor(
    /** The location this forecast describes. */
    public val location: Location,
    /** Current temperature. */
    public val temperature: Temperature,
    /** General sky condition. */
    public val condition: SkyCondition,
    /** Relative humidity as a fraction in [0.0, 1.0]. */
    public val humidity: Double,
    /** Time the observation was produced, as epoch milliseconds (UTC). */
    public val observedAtEpochMillis: Long,
) {

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Forecast) return false
        return location == other.location &&
            temperature == other.temperature &&
            condition == other.condition &&
            humidity == other.humidity &&
            observedAtEpochMillis == other.observedAtEpochMillis
    }

    override fun hashCode(): Int {
        var result = location.hashCode()
        result = 31 * result + temperature.hashCode()
        result = 31 * result + condition.hashCode()
        result = 31 * result + humidity.hashCode()
        result = 31 * result + observedAtEpochMillis.hashCode()
        return result
    }

    override fun toString(): String =
        "Forecast(location=$location, temperature=$temperature, condition=$condition, " +
            "humidity=$humidity, observedAtEpochMillis=$observedAtEpochMillis)"

    /**
     * Builds a [Forecast]. Primarily for the library's own use and for tests;
     * exposed so consumers can construct fixtures without reflection. New
     * optional fields are added here as new setters with defaults, which keeps
     * both source and binary compatibility intact.
     */
    public class Builder(
        private val location: Location,
        private val temperature: Temperature,
    ) {
        private var condition: SkyCondition = SkyCondition.UNKNOWN
        private var humidity: Double = 0.0
        private var observedAtEpochMillis: Long = 0L

        public fun condition(value: SkyCondition): Builder = apply { condition = value }

        public fun humidity(value: Double): Builder = apply {
            require(value in 0.0..1.0) { "humidity out of range: $value" }
            humidity = value
        }

        public fun observedAtEpochMillis(value: Long): Builder = apply { observedAtEpochMillis = value }

        public fun build(): Forecast =
            Forecast(location, temperature, condition, humidity, observedAtEpochMillis)
    }
}
