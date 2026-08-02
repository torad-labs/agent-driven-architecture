# Transcript — Design a published KMP weather library's public surface (with skill)

## Task

Design the public surface for a small Kotlin Multiplatform library (JVM + iOS)
that wraps a weather REST API, published to Maven Central, called from Android
and Swift. Three things asked for: the main client entry point, the result type
for a forecast, and how errors are represented — designed to age well without
breaking binary compatibility.

## Skill applied

`kotlin-best-practices` SKILL.md, **writing mode**.

### Tier classification

Per SKILL.md's tier table, this code hits **all four tiers**:

| Tier | Why it applies here |
|---|---|
| **0 — Core** | It's Kotlin. Always. |
| **1 — Published API** | Compiled against by other teams; published Maven artifact; binary compat is an explicit requirement ("not break binary compatibility down the line"). |
| **2 — Multiplatform** | JVM + iOS, written in `commonMain` style. |
| **3 — Publishing & iOS interop** | Maven Central + consumed from Swift. |

### Reference blocks loaded

- `references/core-kotlin.md` (Tier 0)
- `references/library-and-api.md` (Tiers 1 & 3)
- `references/multiplatform.md` (Tier 2)

(`review-framework.md` not loaded — this is writing mode; I ran a quick
review-style grep pass over my own output instead.)

## Deliverable

Five `commonMain` files under `outputs/`:

- `WeatherClient.kt` — entry point (`interface` + `create` factory) and `Location`
- `Forecast.kt` — `Forecast` result type, `Temperature`/`TemperatureUnit`, sealed `Condition`
- `WeatherError.kt` — sealed error hierarchy
- `WeatherClientConfig.kt` — config builder (the growth point) + `Logger` seam
- `DefaultWeatherClient.kt` — `internal` implementation skeleton (kept out of the ABI)

### Verification

Compiled with `kotlinc 2.3.21` against `kotlinx-coroutines 1.10.2`,
`kotlinx-serialization-core 1.9.0`, the serialization compiler plugin, **and
`-Xexplicit-api=strict`** — the exact gate Tier 1 mandates. Result: **exit 0,
zero warnings**, all serializers generated (including the sealed `Condition`
hierarchy). The explicit-API rule isn't just claimed; the compiler enforced it.

The first compile *failed* — `Forecast` was `@Serializable` but `Location`
wasn't, so the generated serializer had no serializer for the `location`
property. Fixed by making `Location` `@Serializable` and moving its
coordinate-range invariant into an `init` block (so validation runs on the
deserialization path too, not only the factory). A second pass removed a
deprecation warning by moving from `kotlinx.datetime.Instant` to the now-stable
`kotlin.time.Instant`.

## Key API-design / binary-compat decisions and the WHY

### Entry point — `interface WeatherClient` + `create` factory, not a class

- **`interface`, not `class`** [multiplatform §3, library §1]. Keeps the concrete
  implementation type out of the ABI (it can be replaced without a binary break),
  lets tests substitute a fake without a network, and avoids `expect class`
  (still Beta on KMP). The `internal DefaultWeatherClient` never enters the
  public surface.
- **A `create(apiKey, configure: Config.() -> Unit = {})` factory whose signature
  is frozen** [library §4]. All future configuration arrives through the
  `WeatherClientConfig` builder as *new builder methods*, never as new parameters
  on `create`. Appending a parameter to `create` — even a defaulted one — moves
  the JVM method descriptor and throws `NoSuchMethodError` in already-compiled
  callers. The builder *is* the mechanism that keeps the entry point's descriptor
  immovable.
- **`currentForecast` is `suspend` (one-shot); `forecastUpdates` returns a cold
  `Flow` and is *not* `suspend`** [core §Coroutines 1/3/4]. One-shot reads
  suspend; streaming returns a cold flow so collection stays lazy and cancellable,
  and the dispatcher is set with `.flowOn(...)` internally, never `withContext`
  around `emit`. These two shapes also map cleanly through SKIE to Swift `async`
  and `AsyncSequence` respectively [library §Publishing/iOS 6].
- **`AutoCloseable` with an idempotent `close()`** [core §Security 4]. JVM callers
  get `use {}`; Swift callers call `close()` on teardown; double-close is a no-op
  (guarded by an atomic CAS).

### Forecast result type — regular class with a private constructor, *not* a data class

- **The single most consequential binary-compat decision** [library §5].
  A public `data class` cannot gain a field without changing its synthesized
  constructor and `copy(...)` descriptors (binary break), and reordering fields
  silently remaps `componentN()` destructuring (behavioral break). A forecast is
  *exactly* the value that accretes fields over time (humidity, UV, wind…), so it
  is a regular class with an `internal` constructor and named `val`s — it grows
  additively, the constructor staying internal. Consumers read named properties;
  they never destructure or `copy`.
- **`Temperature` wraps value + unit** to kill the Celsius/Fahrenheit confusion
  bug at the type level [core §Ergonomics] — the most common weather-API defect.
- **`Condition` is a `sealed interface`, not an enum** [core §Ergonomics 4,
  library §6, core §Serialization 2]. Each variant can carry data (`Rain` carries
  intensity); every subtype pins `@SerialName` so a Kotlin rename never breaks the
  wire; an `Unknown(rawCode)` fallback keeps the wire decodable when the provider
  adds a condition. Sealed → exhaustive `when` for the library *and* exhaustive
  `switch` for Swift via SKIE.
- **Absent humidity is `Double? = null`, never a `-1.0` sentinel** [core
  §Ergonomics 2].

### Error representation — a single sealed `class WeatherError : Exception`

This is the design fork I weighed explicitly:

- **Sealed exception, not a `Result`/either return** [core §Errors 11, library
  §6]. An exception threads `suspend` cleanly to Swift `async throws` via SKIE and
  to Kotlin's natural `try/catch`. A `Result`-style return would surface on iOS as
  an opaque sealed object Swift can't exhaustively switch and wouldn't integrate
  with `async throws`. Sealed (not `open`) so external code can't inject error
  subtypes, and consumers — Kotlin and Swift — get exhaustive handling.
- **Machine-readable fields, not message parsing** [core §Errors 2/3]. An
  abstract `isRetryable` plus `Http.status` and `Http.retryAfterSeconds` let retry
  logic branch on data. `Http.isRetryable` is derived from status (408/425/429 +
  5xx retryable; 4xx terminal). `cause` is preserved on every variant [core
  §Errors 8].
- **Closed-for-1.x with an `Unexpected` escape hatch** [library §6/§9, §11
  SemVer]. Adding an error subtype mid-major would break consumers' exhaustive
  `when`s (a source break). So an unforeseen failure arrives as `Unexpected`
  (cause preserved) rather than as a new subtype; a genuinely new variant waits
  for the next major. This is the concrete "age well without breaking compat"
  move for the error channel.

### Cross-cutting

- **`commonMain`-clean** [multiplatform §2]: no `java.*` / `platform.*` /
  `System.*`. Time is `kotlin.time.Instant`; the close flag is a `kotlin.concurrent`
  atomic, not a JVM `synchronized` block [multiplatform §11, core §Coroutines 8].
- **No `println`/`NSLog`** [core §Security 1]: diagnostics route through an
  injected `Logger` interface defaulting to a no-op; the host picks the sink. Doc
  comments note credentials are never logged.
- **`api()`-vs-`implementation()` flagged for the build** [library §13,
  Publishing §5]: `Flow`, `@Serializable` types, and `kotlin.time.Instant` appear
  in the public ABI, so coroutines / serialization-runtime must be declared
  `api()` or consumers can't resolve those types. (Build-file concern — recorded
  here for whoever wires `build.gradle.kts`.)
- **`explicitApi()` strict** [library §1]: every declaration has explicit
  visibility + explicit return/property type, verified by compiling under
  `-Xexplicit-api=strict`. Surface should be gated on a committed ABI dump.
- **`@since 1.0.0` on every public declaration** [library §11] for the SemVer +
  CHANGELOG discipline.
- **`@DslMarker` on the config builder supertype** [core §Ergonomics 1] so a
  future nested block can't leak into the outer scope.

## Final code

### outputs/WeatherClient.kt

```kotlin
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
```

### outputs/Forecast.kt

```kotlin
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
```

### outputs/WeatherError.kt

```kotlin
package dev.example.weather

/**
 * The single error type the library raises.
 *
 * Modelled as a **`sealed class` extending `Exception`**, which threads three
 * needs together:
 *
 *  - **Exception, so it works with `suspend`.** A thrown sealed exception maps
 *    cleanly through SKIE to a Swift `throws`/`async throws` function and to
 *    Kotlin's natural `try`/`catch`. (A `Result`-style return would surface on
 *    iOS as an opaque sealed object the Swift compiler cannot exhaustively
 *    switch, and would not integrate with `async throws`.)
 *  - **Sealed, so handling is exhaustive.** Consumers — including Swift via
 *    SKIE — get a `when`/`switch` with no `else`, and a new variant becomes a
 *    reviewed, deliberate change rather than a silent fall-through. The base is
 *    `sealed`, not `open`, precisely so external code cannot inject its own
 *    error subtypes into the contract.
 *  - **Machine-readable, so retry logic branches on fields, not message text.**
 *    [isRetryable] and [WeatherError.Http.status] let a caller decide on data,
 *    never by substring-matching a human-facing string.
 *
 * The hierarchy is closed and frozen for 1.x. New failure shapes that don't fit
 * an existing variant are reported as [Unexpected] rather than by adding a
 * subtype mid-major-version (which would break exhaustive `when`s consumers
 * wrote — a source break). A genuinely new variant waits for the next major.
 *
 * Every variant carries [cause] where one exists, so the original failure chain
 * is never dropped.
 *
 * @since 1.0.0
 */
public sealed class WeatherError(
    message: String,
    cause: Throwable?,
) : Exception(message, cause) {

    /**
     * Whether retrying the same request may succeed. Computed from the failure
     * kind so callers branch on a flag, not on parsing [message].
     * @since 1.0.0
     */
    public abstract val isRetryable: Boolean

    /**
     * A transport-level failure before a complete HTTP response was received —
     * connection refused, DNS failure, socket timeout. Retryable.
     * @since 1.0.0
     */
    public class Network internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = true
    }

    /**
     * The request exceeded its deadline. Retryable (with backoff).
     * @since 1.0.0
     */
    public class Timeout internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = true
    }

    /**
     * The provider returned a non-success HTTP status.
     *
     * [isRetryable] is derived from [status]: 408/425/429 and 5xx are
     * retryable; 4xx client errors (400/401/403/404/422) are terminal and fail
     * fast. [retryAfterSeconds] echoes the provider's `Retry-After` when present
     * so the caller can honour it as a floor before exponential backoff.
     * @since 1.0.0
     */
    public class Http internal constructor(
        /** The HTTP status code returned by the provider. @since 1.0.0 */
        public val status: Int,
        /**
         * Seconds the provider asked the caller to wait before retrying
         * (`Retry-After`), or `null` if it sent none. Absence is `null`, never
         * a sentinel.
         * @since 1.0.0
         */
        public val retryAfterSeconds: Long?,
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean =
            status == 408 || status == 425 || status == 429 || status in 500..599
    }

    /**
     * The credential supplied to [WeatherClient.create] was rejected by the
     * provider (401/403 surfaced as a distinct, clearly-actionable variant).
     * Terminal — retrying with the same key cannot succeed.
     * @since 1.0.0
     */
    public class Authentication internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = false
    }

    /**
     * A successful HTTP response whose body could not be decoded into the
     * library's model — a malformed or contract-violating payload. Terminal;
     * retrying yields the same bytes.
     * @since 1.0.0
     */
    public class Decoding internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = false
    }

    /**
     * A failure that does not fit any other variant. The escape hatch that lets
     * the closed hierarchy stay closed across 1.x: rather than add a subtype
     * (and break consumers' exhaustive `when`s), an unforeseen failure arrives
     * here with its [cause] preserved. Not retryable by default.
     * @since 1.0.0
     */
    public class Unexpected internal constructor(
        message: String,
        cause: Throwable?,
    ) : WeatherError(message, cause) {
        override val isRetryable: Boolean = false
    }
}
```

### outputs/WeatherClientConfig.kt

```kotlin
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
```

### outputs/DefaultWeatherClient.kt

```kotlin
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
```

## Compile evidence

```
$ kotlinc -cp <coroutines:datetime:serialization-core> \
    -Xplugin=kotlin-serialization-compiler-plugin.jar \
    -Xexplicit-api=strict -opt-in=kotlin.RequiresOptIn \
    -d /tmp/weather-out *.kt
=== exit: 0 ===   # zero warnings, all serializers generated
```

## Notes for the build wiring (out of the source surface, recorded per Tier 3)

- Declare `kotlinx-coroutines-core` and `kotlinx-serialization-*` as **`api()`**,
  not `implementation()` — their types (`Flow`, `@Serializable`) are in the public
  ABI, so an `implementation()` scope makes them `runtime` in the POM and breaks
  consumer resolution.
- Enable `explicitApi()` strict and gate on a committed ABI dump
  (binary-compatibility-validator or the in-KGP `abiValidation {}`).
- Publish via the Central Portal with `com.vanniktech.maven.publish` (OSSRH is
  sunset); apply SKIE in the framework-producing module only and verify it
  supports the pinned Kotlin version; ship a real Dokka HTML `-javadoc` jar.
- Run a `linuxX64Test` in the ordinary `check` for cheap Kotlin/Native runtime
  coverage; reserve the macOS leg for the XCFramework + Darwin engine.
```
```
