package dev.example.weather

import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The result of a forecast request.
 *
 * Deliberately a regular class with a **private constructor**, not a public
 * `data class`. A `data class` is convenient but a poor *published* value type:
 * adding a field changes its synthesized constructor and `copy(...)` descriptors
 * (a binary break for already-compiled callers), and reordering fields silently
 * remaps `componentN()` destructuring. A forecast is exactly the kind of value
 * that accretes fields over time (humidity, UV index, precipitation…), so it is
 * modelled to grow additively: future fields arrive as new `val`s with the
 * constructor staying internal.
 *
 * Consumers read the named properties; they do not destructure or `copy`, so
 * nothing about the public surface depends on positional component functions.
 *
 * @since 1.0.0
 */
@Serializable
public class Forecast internal constructor(
    /** The location this forecast describes. @since 1.0.0 */
    public val location: Location,
    /** Instant the upstream provider produced this forecast (UTC). @since 1.0.0 */
    public val observedAt: Instant,
    /** Air temperature. @since 1.0.0 */
    public val temperature: Temperature,
    /** Current sky condition. @since 1.0.0 */
    public val condition: Condition,
    /**
     * Relative humidity as a fraction in 0.0..1.0, or `null` when the provider
     * did not report it. Absence is modelled with a nullable type, never a
     * sentinel like `-1.0` — a sentinel is indistinguishable from a real value
     * and defeats null-checking.
     * @since 1.0.0
     */
    public val humidity: Double? = null,
)

/**
 * A temperature with an explicit unit.
 *
 * Wrapping the raw number kills the unit-confusion bug at the type level
 * (Celsius vs Fahrenheit), which is the single most common weather-API defect.
 * It is not a `@JvmInline value class` because it carries two fields; for a
 * single-field id we would use one to keep it unboxed and allocation-free.
 *
 * @since 1.0.0
 */
@Serializable
public class Temperature internal constructor(
    /** The numeric value, in [unit]. @since 1.0.0 */
    public val value: Double,
    /** The unit [value] is expressed in. @since 1.0.0 */
    public val unit: TemperatureUnit,
)

/**
 * Unit a [Temperature] is expressed in.
 *
 * An `enum` (a finite, closed set the library owns) — it bridges to a clean
 * Swift `enum` and lets consumers `when` over it. New units, if ever needed, are
 * an additive minor change.
 *
 * @since 1.0.0
 */
@Serializable
public enum class TemperatureUnit {
    @SerialName("celsius")
    CELSIUS,

    @SerialName("fahrenheit")
    FAHRENHEIT,
}

/**
 * High-level sky condition.
 *
 * A `sealed interface` rather than an `enum` because each condition may need to
 * carry condition-specific data over time (e.g. precipitation intensity for
 * [Rain]). Every subtype pins its wire discriminator with `@SerialName`, so a
 * Kotlin rename or package move never breaks the JSON contract or stored data.
 *
 * The library owns this hierarchy and `when`s over it exhaustively without
 * `else`. Because it is `sealed`, a Swift consumer (via SKIE) also gets an
 * exhaustive switch, and adding a variant is a deliberate, reviewed change that
 * surfaces as a compile error at every site the library controls.
 *
 * @since 1.0.0
 */
@Serializable
public sealed interface Condition {

    /** Clear or mostly clear sky. @since 1.0.0 */
    @Serializable
    @SerialName("clear")
    public data object Clear : Condition

    /** Cloud cover without precipitation. @since 1.0.0 */
    @Serializable
    @SerialName("cloudy")
    public data object Cloudy : Condition

    /**
     * Rainfall.
     *
     * Carries an intensity so callers can distinguish drizzle from a downpour.
     * @since 1.0.0
     */
    @Serializable
    @SerialName("rain")
    public class Rain internal constructor(
        /** Precipitation rate in millimetres per hour. @since 1.0.0 */
        public val millimetresPerHour: Double,
    ) : Condition

    /** Snowfall. @since 1.0.0 */
    @Serializable
    @SerialName("snow")
    public data object Snow : Condition

    /**
     * A condition this version of the library does not model, preserving the
     * raw provider code so callers can degrade gracefully and the wire stays
     * decodable when the provider introduces a new condition.
     * @since 1.0.0
     */
    @Serializable
    @SerialName("unknown")
    public class Unknown internal constructor(
        /** The raw condition code reported by the provider. @since 1.0.0 */
        public val rawCode: String,
    ) : Condition
}
