# Transcript — Designing a binary-stable KMP weather API surface

## Task

Design the public surface for a small Kotlin Multiplatform (JVM + iOS) library that
wraps a weather REST API, to be published to Maven Central and consumed from both
Android (Kotlin) and Swift. Deliver the main client entry point, the forecast result
type, and the error representation. Priority: age well, don't break binary compatibility.

## Approach and reasoning

I treated this as a published-library API-design problem first and a "weather" problem
second. The hard constraints that shaped every decision:

1. **Published to Maven Central → binary compatibility is forever.** Once apps compile
   against v1.0, every later release should keep linking. That rules out a few
   conveniences that are fine in app code but traps in a library.

2. **Consumed from Swift via the Kotlin/Native ObjC bridge.** The surface has to be
   things that bridge cleanly: `suspend` (→ Swift `async`), `sealed` (→ Swift
   `switch`), plain classes and enums. It has to avoid things that bridge badly:
   inline `value class`, and reliance on Kotlin default arguments (Swift can't see
   them).

3. **commonMain only.** No `java.*`, no JVM-only types in the public API.

### Key decisions

- **Entry point is an `interface` with a `companion object` factory** (`WeatherClient` +
  `WeatherClient.create(...)`), not a concrete class with a public constructor. The
  concrete impl (`DefaultWeatherClient`) is `internal`, so it can be rewritten freely.
  New capabilities arrive as new interface methods with default bodies — additive, no
  ABI break. `forecast(...)` is `suspend` so it bridges to Swift async and to coroutines
  with no callback/future type leaking into the surface.

- **Forecast result type is a `sealed interface WeatherResult`** with `Success` /
  `Failure` subtypes. Closed set → exhaustive `when` in Kotlin and `switch` in Swift.
  Returned-as-data for *expected* outcomes. Cancellation and programming errors are NOT
  result variants — they throw — because a `Failure` for cancellation would let callers
  swallow it and break structured concurrency.

- **Errors are a `sealed class WeatherError : Throwable`** with specific cases
  (`Network`, `LocationNotFound`, `Unauthorized`, `RateLimited`, `Server`) **plus an
  `Unexpected` catch-all.** The catch-all is the forward-compatibility hinge: when a
  future version (or the server) produces a failure this version can't classify, it
  lands in `Unexpected` — which old consumers already handle — instead of leaking an
  arbitrary exception type or surprising an exhaustive `when`. Extending `Throwable`
  means a `Failure` can be rethrown at a call site and carries `cause` + stack trace
  for logging, while still being returned as data by default.

- **No `data class` anywhere in the public surface.** `Forecast`, `Configuration` (and
  the result/error wrappers) are plain classes with hand-written `equals`/`hashCode`/
  `toString`. A data class bakes `copy(...)` and `componentN()` into the ABI, so adding
  a property later breaks already-compiled callers. Plain classes let new optional
  properties be appended over time.

- **Construction goes through factories / builders, not exposed constructors.**
  `Forecast.Builder`, `Configuration` (defaulted ctor for Kotlin + `Builder` for
  Swift/Java), `Location.of(...)`, `Temperature.celsius/fahrenheit(...)`. New optional
  fields are added as new builder setters / new defaulted params — additive and
  binary-safe. Builders also give Swift a fluent path since Kotlin defaults don't bridge.

- **Unit-safe value types.** `Temperature` stores Celsius canonically and is built via
  named factories, killing the "is this number C or F?" boundary bug. It's a plain class,
  not an inline `value class`, because value classes bridge poorly to ObjC. `Location.of`
  validates coordinate ranges and throws on bad input (a caller bug, not a weather
  failure → not a result variant).

- **`SkyCondition` enum includes `UNKNOWN`.** An enum is right for a closed
  server-defined vocabulary; the explicit `UNKNOWN` gives the deserializer a safe place
  to put conditions newer than this library, so old apps degrade instead of crashing.

### Discipline / verification

Compiled the whole surface under `kotlinc -Xexplicit-api=strict`, which is the
publishing standard: every public declaration must carry an explicit visibility, and it
fails on any implicit-public API. Result: clean compile, exit 0, no warnings — and no
reliance on any JVM-only stdlib (commonMain-safe).

Then wrote a small consumer to prove the surface is actually usable as intended:
- exhaustive `when` over `WeatherResult` and over `WeatherError` compiles (Swift `switch`
  parity),
- `suspend fun forecast` is callable from a coroutine context,
- `Temperature.fahrenheit(212.0).celsius == 100.0`,
- `Configuration.Builder` works,
- the empty-API-key path returns `WeatherError.Unauthorized` as data.

Consumer compiled and ran:

```
ok 0.0C
UNKNOWN
maxRetries=5
212F=100.0C
auth: Invalid or missing API key
```

## What I'd add before publishing (out of scope here)

- The Gradle wiring: `explicitApi()` in the build, the binary-compatibility-validator
  plugin (`apiDump` / `apiCheck`) to catch ABI breaks in CI, and the
  `kotlinx-coroutines-core` commonMain dependency.
- `kotlinx.serialization` `@Serializable` internal DTOs that map onto these public
  types (keeping the wire contract separate from the public API).
- KDoc `@since` tags and a `@Deprecated`-with-`ReplaceWith` policy for evolution.

## Final code

The compiled, runnable deliverable lives in `outputs/`:

- `WeatherClient.kt` — entry-point interface + `create(...)` factory.
- `WeatherResult.kt` — sealed result type (`Success` / `Failure`) + `forecastOrNull()`.
- `WeatherError.kt` — sealed error hierarchy with `Unexpected` catch-all.
- `Model.kt` — `Location`, `Temperature`, `SkyCondition`, `Forecast` (+ `Builder`).
- `Configuration.kt` — optional tuning (defaulted ctor + `Builder`).
- `DefaultWeatherClient.kt` — `internal` stub implementation (not part of the ABI).
