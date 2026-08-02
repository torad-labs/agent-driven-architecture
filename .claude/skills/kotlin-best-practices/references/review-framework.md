# Rejection Framework + PR Checklist (Review mode)

The primary tool for review mode. Each row is a blocking-class finding: **smell →
why rejected → do instead → how to detect.** Where no static check exists, the
row says so — a grep that can't actually catch the smell is worse than an honest
"manual review backed by X".

**Apply only the tables for the tiers the code lives at** (see SKILL.md's tier
selector). The tier is marked on each table heading. For app/script code, the
Core tables are usually the whole review.

When you report findings: highest-severity first, distinguish blocking issues
from suggestions, cite the detection method honestly, and never raise a
higher-tier rule on code that doesn't live at that tier.

---

## Core — Coroutines & Flow  (Tier 0)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| `withContext(ctx){ emit(x) }` / `launch(ctx){ emit }` inside a `flow {}` | Violates context preservation → `IllegalStateException` (often only on Native) | `.flowOn(ctx)` as the last operator; `channelFlow{ send() }` if producing cross-coroutine | **No reliable static check** — `grep emit(` noises on every flow. Review `emit(` inside a `withContext`/`launch`/`async` lambda in a `flow{}`; back with a `runTest` collection test |
| `catch (e: Exception/Throwable)` without rethrowing `CancellationException` | Semi-cancelled coroutine, leaked work, broken propagation | `ensureActive()`/`throw e` first, or catch narrow types | detekt `SwallowedException`/`TooGenericExceptionCaught` (CancellationException not ignored) |
| `runCatching { someSuspendCall() }` | Captures `CancellationException` into `Result.failure` | `runSuspendCatching` or try/catch + `ensureActive()` | detekt `SuspendFunSwallowedCancellation` (needs type resolution — see honesty note) |
| `callbackFlow {}` / `channelFlow {}` without `awaitClose` | Channel closes early or callback leaks | `awaitClose { api.unregister(cb) }` as the final statement | Every `callbackFlow {`/`channelFlow {` must contain `awaitClose(` |
| `GlobalScope.launch/async` | No parent, no cancellation, untestable, lives forever | Injected `SupervisorJob`-backed scope tied to `close()` | detekt `GlobalCoroutineUsage`; grep `GlobalScope.` |
| `suspend fun foo(): Flow<T>` / eager work before returning the Flow | Breaks cold-Flow contract; hidden work at call time | Non-suspend fn returning `flow { }` | detekt `SuspendFunWithFlowReturnType`; grep `suspend fun .*: *Flow<` |
| `Thread.sleep` / blocking call / `runBlocking` in a suspend fn | Freezes Main, starves shared pools | `delay()`; `withContext(ioDispatcher)`; never `runBlocking` in reusable code | detekt `SleepInsteadOfDelay`; grep `runBlocking` in main source |
| `synchronized`/`ReentrantLock` for a suspending section, or in common code | Blocks a pooled thread across suspension; no `actual` on Native/JS | `Mutex.withLock` (suspend) or atomic CAS (lock-free) | grep `synchronized(`/`ReentrantLock` in `commonMain` |
| Hardcoded `Dispatchers.X` / unbounded provider I/O / per-request `limitedParallelism` | Untestable; connection blow-up under load; the cap isn't shared | Inject the dispatcher; one reused `Dispatchers.IO.limitedParallelism(n)` view in a `val` | grep `Dispatchers.(IO\|Default\|Main)` in class bodies; `limitedParallelism(` per-call |
| `shareIn`/`stateIn` in a getter or per-request fn | New upstream coroutine + connection each call | Call once into a stable `val` | grep `(shareIn\|stateIn)\(` inside `get()`/non-init bodies |
| `withContext(Job())` / `launch(Job())` | Severs cancellation; child outlives caller | New scopes use `SupervisorJob() + dispatcher`, owned + closed | grep `withContext(\s*Job()`, `launch(\s*Job()` |

## Core — Serialization  (Tier 0)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| `Json { }` inline at a call site | Discards per-class descriptor cache every chunk | One top-level/`object` `val`, injected | ast-grep `Json { $$$ }` not assigned to a top-level property |
| Polymorphic subtype with no `@SerialName` | Wire coupled to package/class names; rename = breaking | Explicit unique `@SerialName` per subclass | Review every `@Serializable` sealed subtype |
| Global `isLenient`/`coerceInputValues = true` | Accepts non-RFC JSON / silently substitutes defaults | Fix the payload; model fields explicitly; scope tolerance narrowly | grep `isLenient = true`, `coerceInputValues = true` |
| `explicitNulls = false` codec on an encode→decode round-trip | Null→default decode makes the round-trip non-idempotent | Make that codec decode-only; encode through an `explicitNulls=true` codec | grep `explicitNulls = false`, then grep its identifier for `encodeTo*(` calls |
| Global `ignoreUnknownKeys = true` (incl. request models) | Typos + drift silently dropped everywhere | `@JsonIgnoreUnknownKeys` per inbound class (and each nested class) | grep `ignoreUnknownKeys = true` at builder level |
| Custom `KSerializer` reusing a delegate's `.descriptor`, or kind/elements ≠ encode/decode | Misleads schema tooling; unspecified behavior | Unique package-qualified descriptor; mirror calls; or surrogate pattern | Review every `KSerializer` `descriptor` assignment |

## Core — Error Handling & Resilience  (Tier 0)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| Empty / log-only catch (`catch (e) {}`) | Real error looks like success; may swallow cancellation | Map to a typed error and throw/return; `ensureActive()` first | detekt `EmptyCatchBlock`/`SwallowedException` |
| Returning a mock/default on network/model failure | Masks outages; users get wrong output | Propagate a typed error | Review catch blocks wrapping I/O that `return` a non-error value |
| Retrying every exception/status (4xx, validation, cancellation) | Burns quota, amplifies load, defeats cancellation | Gate on `isRetryable`; short-circuit `is CancellationException` | Retry predicate must reference `isRetryable` + rethrow cancellation |
| Fixed-delay / jitter-free backoff, no caps | Thundering herd; unbounded wait | Full-jitter `random(0, min(maxDelay, base*2^n))` + maxRetries + deadline | Backoff fn must include a random term, `min(...,cap)`, `maxRetries`, `withTimeout` |
| Wrapping an exception while dropping `cause` | Root failure vanishes from traces and `when` | Always `cause = original`; surface full `errors` on exhaustion | detekt `ThrowingExceptionsWithoutMessageOrCause` |
| `throw IllegalStateException/RuntimeException(msg)` for expected failures | Callers substring-match messages; fragments the error channel | Sealed error/result hierarchy; null/Result for recoverable | grep `throw IllegalStateException(`/`throw RuntimeException(` in main code |
| Global `CoroutineExceptionHandler` as the error path; un-awaited `async` | Only fires for uncaught root failures; `async` ignores it | Handle at call site; always `await()` | grep `async {` whose result is never awaited |

## Core — Runtime Performance  (Tier 0)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| `data class Id(val v: String)` / bare `String` for high-frequency ids | Heap allocation + no type safety | `@JvmInline value class` with `init` | grep `data class \w+\((val\|public val) \w+: (String\|Int\|Long)\)$` |
| Value class as `List<Id>` element / `<T>` arg / `Id?` on a hot path | Boxes back to an object — undoes the win | Pass concrete type / extract `.value` at the boundary | **No static rule** (boxing is codegen). Manual review against hot files, backed by an allocation benchmark |
| Re-decoding the whole stream per chunk (`decodeToString`/`bodyAsText`/`split("\n")`) | O(n²) re-scan + transient garbage | Incremental framing over a retained buffer | grep `decodeToString(\|bodyAsText(\|.split("\n")` in transport |
| `acc += delta` string concat in a per-token loop | O(n²) allocation, GC pressure | per-part `StringBuilder`, materialize once | grep `\w+ += ` on a `String` accumulator inside a `collect{}`/loop |
| Reflexive `.asSequence()` on small/single-step collections | Iterator overhead exceeds the benefit | Plain `List`/`Iterable` operators | grep `.asSequence()`; review size + chain length |
| `lazy(LazyThreadSafetyMode.NONE)` on state a public getter exposes | Data race across caller threads | `NONE` only for thread-confined/construction-time state | grep `LazyThreadSafetyMode.NONE`; review confinement |
| `kotlin-reflect` dep or runtime reflection in the request path | Defeats R8, forces consumer keep-rules, unsupported on Native | Plugin + `reified` helpers | grep build files for `kotlin-reflect`; source for `::class.members`/`Class.forName` |

## Core — Ergonomics & Type Safety  (Tier 0)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| Nested receiver builders with no `@DslMarker` | Inner block silently calls an outer receiver → wrong config that compiles | One marker on the shared supertype | Every `Builder.() -> Unit` traces to a `@DslMarker` supertype |
| Sentinel values for "absent"/"default" (`-1`, `""`, `"AUTO"`) | Indistinguishable from real values; defeats null-checking | Nullable type + default param | grep `= -1\|Int.MIN_VALUE\|"AUTO"\|"NONE"` |
| Positional behavior-switching `Boolean` params | Unreadable; can't grow a third mode without a break | Named functions or enum mode | detekt `BooleanPropertyNaming`; public fns with ≥2 `: Boolean` |
| `sealed` on a hierarchy you'll keep extending, or a growable extension point left plain `open` | Added variant/member breaks clients silently | `@SubclassOptInRequired` for client-extensible; sealed only for truly closed | Review each public `sealed`/`open`: "will I add post-1.0?" |
| Fenced ` ```kotlin ` block in a KDoc comment instead of `@sample` | Never compiled → rots silently | Compiled `@sample` function in a samples source set | grep ` ``` ` inside doc comments |

## Core — Security & Logging Hygiene  (Tier 0)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| `println` / `NSLog` / `Log.d` / `System.out` in reusable code | Hard-codes a platform log sink the host can't choose | Inject a logger seam with a no-op default | grep `println(\|NSLog(\|Log.[dewiv](\|System.out` in main source — should be empty |
| Logging / surfacing a raw body, headers, or `Authorization`/key without redaction | Echoes prompts/secrets/keys into logs, crash reports, UI | Redact at every egress (strip auth/api-key headers, mask token-shaped substrings) | **No static proof** — review every egress site (grep the body/header field being logged or rethrown) |
| Prompt/PII content in spans or logs by default | Leaks PII/secrets into telemetry | Metadata-only by default; explicit opt-in for content | Review every span/log attribute against a metadata allowlist |
| Consumer-managed resource with no `close()`/`AutoCloseable`; `freeze()`/`@SharedImmutable` in new code | Leaked sockets/scopes; legacy Native freezing is gone | `AutoCloseable` + idempotent `close()`; atomics for shared state | grep `freeze()\|@SharedImmutable\|ensureNeverFrozen`; review lifecycle types for `close()` |

## Build / Tooling / Testing  (applies to any Kotlin project)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| `System.currentTimeMillis()`/`Clock.System.now()`/`Random.Default`/`Dispatchers.IO` inside a class | Nondeterministic, untestable, delays don't skip | Inject `Clock`/`Random`/dispatcher with prod defaults | grep `currentTimeMillis(\|Random.Default\|Dispatchers.(IO\|Default\|Main)` in non-DI code |
| `.toList()`/`.collect {}` on a hot/infinite flow under `runTest` | `runTest` hangs then times out | Collect in `backgroundScope` / Turbine `testIn(backgroundScope)` | grep `.toList()`/`.collect {` inside `runTest` on non-finite flows |
| Real network engine (`HttpClient(CIO/OkHttp/Darwin)`) in unit tests | Slow, flaky, doesn't exercise error/retry deterministically | Ktor `MockEngine` sharing prod config | grep `HttpClient((CIO\|OkHttp\|Java\|Darwin)` in test sources |
| Hand-asserting individual JSON fields for serialized models | Misses default/nullability/discriminator drift | Golden/approval test through the real `encodeToString()` | Review: serialization tests reference committed golden files |
| detekt `autoCorrect = true` in the CI gate | No-op without `buildUponDefaultConfig`; can fix-then-fail | `autoCorrect = false` in CI; auto-correct local only | grep `autoCorrect\s*=\s*true`; check CI detekt invocation |
| detekt baseline carried with no burn-down target | Suppression ledger masquerading as a standard | Treat baseline as a temporary scaffold with a committed burn-down | Baseline entry count must trend down release-over-release |

## Library — API Design & Compatibility  (Tier 1 — only for published surfaces)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| Public fn/prop with **inferred** type (`fun build() = Impl()`) | Compiled signature pins to the inferred type; a body edit breaks compiled clients | Explicit return/property type on every public decl | `explicitApi()` strict; detekt `LibraryCodeMustSpecifyReturnType` |
| New public `data class` for an evolvable model | Added/reordered property breaks ctor/`copy()`/`componentN()` | Regular class/interface; or freeze + add via overloads | grep `public data class`; ABI dump diff on `copy`/ctor |
| Param added to an existing public fn (even defaulted), or `@JvmOverloads` as the "fix" | JVM descriptor changes → `NoSuchMethodError` for compiled Kotlin callers | New overload, keep original signature | `checkKotlinAbi` fails; review any public param-list edit |
| Switching `-jvm-default=enable`→`no-compatibility` after release | Drops `DefaultImpls` → `NoSuchMethodError`/`AbstractMethodError`; invisible in source | Keep `enable` post-1.0; `@JvmDefaultWithoutCompatibility` per interface | ABI dump diff shows `DefaultImpls` disappearing |
| Removing/narrowing/`@RequiresOptIn`-hiding a public decl in a minor | Source+binary break, no migration; opt-in is for staging not retiring | `@Deprecated(replaceWith=...)` WARNING→ERROR→HIDDEN over minors | ABI dump diff fails on disappearance without a prior `@Deprecated` release |
| Public-ABI change shipped without a matching SemVer bump / CHANGELOG entry | The version is the compatibility contract; a silent mismatch lies to resolvers | Bump per SemVer; CHANGELOG entry in the same PR | No static bump check — manual review backed by the ABI diff |
| New public declaration with no `@since` | No version anchor for consumers or the deprecation ladder | `@since` on every new public member | grep `@since`; review each new public decl in the diff |
| `@PublishedApi internal` treated as private and freely changed | Inlined into client bytecode = public ABI | Freeze its signature; ABI-review it like public | grep `@PublishedApi`; audit against the dump |
| Mutable/array type across the public boundary (`MutableList`, `Array<String>`) | Callers mutate library state; not thread-safe | Read-only `List`/`Set`/`Map`; defensive copy if array unavoidable | grep `: (Mutable(List\|Set\|Map)\|Array)<` in public surface |
| Public-ABI type whose dependency is `implementation()` not `api()` | POM scopes it `runtime`; consumer can't resolve the type | Declare the dep `api()` | Cross-check ABI-dump types vs POM `compile`-scope deps |

## Multiplatform  (Tier 2 — only for multi-target modules)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| Manual `iosMain.dependsOn(commonMain)` etc. | Disables default-hierarchy-template application (warning + lost accessors) | Generated accessors; `applyDefaultHierarchyTemplate()` before any additive edge | grep `dependsOn(` in build files; build log "Default ... Hierarchy Template was not applied" |
| Platform symbol in `commonMain` (`java.*`, `android.*`, `platform.Foundation.*`, `System.*`) | Fails on Native/JS; compiles now, breaks when a target is added | `expect`/`actual` or an interface | grep `java\.\|android\.\|platform\.(Foundation\|UIKit)\|System\.` in `commonMain` |
| `expect class` where an interface + factory suffices | One impl per platform, no fakes, relies on Beta | interface in common + `expect fun buildX(): TheInterface` | grep `expect class` in `commonMain` |
| Runtime OS branching in common (`if (Platform.isIOS)`) | Defeats compile-time separation; dead branches per target | `expect`/`actual` or injected interface | grep `Platform.(is\|current)` in `commonMain` |
| JVM/Apple-only dep in `commonMain { dependencies }` | Breaks non-JVM target resolution | Move to `jvmMain`/`androidMain`/`appleMain` | Review block vs each lib's KMP targets; build a Native target in CI |
| Duplicated `actual` in both `iosArm64Main` and `iosSimulatorArm64Main` | Doubles maintenance, risks device/sim drift | Single `actual` in `iosMain` (or `nativeMain` if also shared with Linux) | grep `actual ` in leaf source sets |
| Only Apple Native targets in CI (no cheap-to-run Native) | Native-only runtime bugs hide until the slow macOS leg / never | Add a `linuxX64Test` to the ubuntu `check` for cheap Native runtime coverage | Review CI: is any Native target actually *run*, not just compiled? |
| Unsynchronized shared collection mutated from >1 coroutine | Races on the multi-threaded Native dispatcher (safe on single-thread JVM/iOS test runtime) | `Mutex` (suspend) or copy-on-write atomic | Review shared `MutableList`/`MutableMap` mutated in `suspend`/callback paths |

## Publishing & iOS Interop  (Tier 3 — only when shipping a KMP library)

| Smell | Why rejected | Do instead | How to detect |
|---|---|---|---|
| Empty/stub `-javadoc` jar | Passes Central, gives consumers zero docs | Dokka HTML javadoc jar | grep `archiveClassifier.*javadoc`; confirm Dokka applied |
| Publishing targets from different CI hosts | Duplicate root publications; Central rejects | One `publish` on `macos-latest` | Review workflow for >1 job running a `publish` task |
| Public-ABI dep declared `implementation()` | Consumer POM omits it from compile scope → unresolvable type | `api()` for any dep in the public signature | ABI-dump type cross-check vs POM scopes |
| SKIE applied in a non-framework module | Silently no-ops; Flow/suspend/sealed never reach Swift | Apply in the `framework {}`/`native.cocoapods` module | Confirm the module applying `co.touchlab.skie` is the framework producer |
| Fat/universal framework for distribution | App Store rejects simulator slices | `XCFramework(name)` | grep `binaries { framework` without surrounding `XCFramework(...)` |
| No `gradle/verification-metadata.xml` | Inbound supply chain unverified — a hijacked artifact runs in CI + consumers | Commit a hand-reviewed `verification-metadata.xml`; pin versions | `test -f gradle/verification-metadata.xml`; grep catalog for `+`/dynamic |

---

## PR Review Checklist

Distilled, mechanical. Apply only the groups whose tier the code lives at.

**Core (Tier 0) — every Kotlin change**
- [ ] Every broad catch rethrows `CancellationException` first; no `runCatching` around a suspend call.
- [ ] Streaming returns a non-suspend cold `Flow`; `.flowOn` (not `withContext`) sets emission context; exercised by a `runTest` collection test.
- [ ] No `GlobalScope`; dispatchers/`Clock`/`Random`/engine injected; `callbackFlow`/`channelFlow` has `awaitClose`; shared I/O bounded by a reused `limitedParallelism(n)`.
- [ ] No blocking call / `Thread.sleep` / `runBlocking` in a suspend fn.
- [ ] Retry gates on `isRetryable`, honors `Retry-After`, uses jittered capped backoff + deadline; errors carry `cause` + status; no mock/default returned on failure.
- [ ] `Json` reused not per-call; polymorphic subtypes carry `@SerialName`; forward-compat via per-class `@JsonIgnoreUnknownKeys`; `explicitNulls=false` codec is decode-only.
- [ ] Hot paths: single-field ids are `@JvmInline value class` kept unboxed; streamed text uses `StringBuilder`; streams framed incrementally; no `kotlin-reflect`.
- [ ] Builders `@DslMarker`-scoped; optional config nullable+default not sentinel; no positional behavior `Boolean`; finite outcomes `sealed`.
- [ ] No `println`/`NSLog`/`Log.d` in reusable code; no unredacted bodies/headers/secrets logged; resources `AutoCloseable` with idempotent `close()`.
- [ ] `Clock`/`Random`/dispatcher/engine injected; HTTP tested with `MockEngine`; coroutine tests use `runTest` + `backgroundScope`; wire contract has golden tests.

**Published API (Tier 1)**
- [ ] `explicitApi()` strict passes; every new public decl has explicit visibility + return/property type.
- [ ] `checkKotlinAbi` green; an `api/*.api` change is intentional + noted in the PR (not silently `updateKotlinAbi`'d); compiler-bump churn called out as such.
- [ ] No new public `data class` for an evolvable model; no param appended to an existing public fn.
- [ ] Public collections read-only; no `Mutable*`/`Array` across the boundary; `@PublishedApi internal` reviewed as public ABI.
- [ ] `-jvm-default` stays `enable`; removals go through `@Deprecated` WARNING→ERROR→HIDDEN; new decls carry `@since`; ABI change ships a CHANGELOG entry + SemVer-correct bump.

**Multiplatform (Tier 2)**
- [ ] No platform symbols in `commonMain`; no manual `dependsOn`; no single-platform dep in common; `actual`s in the highest shared set.
- [ ] No `synchronized`/`ReentrantLock` in `commonMain`; no `freeze()`/`@SharedImmutable`; shared collections guarded for the multi-threaded Native dispatcher.
- [ ] CI builds all targets AND runs a cheap Native target (e.g. `linuxX64Test`), not only the macOS leg.

**Publishing & iOS (Tier 3)**
- [ ] Every public-ABI dependency is `api()`, not `implementation()`.
- [ ] One macOS publish job; required POM metadata + signing + SNAPSHOT guard; real Dokka HTML javadoc jar; XCFramework (not fat); SKIE in the framework module; `gradle/verification-metadata.xml` present.
