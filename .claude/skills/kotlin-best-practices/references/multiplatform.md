# Kotlin Multiplatform (Tier 2)

Load this when the module targets more than one platform (any combination of JVM,
Android, iOS/Apple, Linux/Native, JS, Wasm). These rules keep platform code out of
`commonMain` and prevent the silent single-target trap, where common code happily
references a JVM symbol that vanishes the instant a second target is added.

If the module is single-platform, skip this block.

1. **Rely on the default hierarchy template; never hand-roll `dependsOn` for sets
   it already provides.** Since Kotlin 1.9.20 the template auto-creates
   `iosMain`/`appleMain`/`nativeMain`/`jvmMain` with type-safe accessors. A manual
   `.dependsOn()` edge **disables automatic application of the default template**
   for those source sets (build warning + lost accessors). If you genuinely need an
   extra intermediate set, call `applyDefaultHierarchyTemplate()` explicitly first,
   then add only the additive edge. *Detect:* grep `dependsOn(` in
   `build.gradle.kts`; watch the build log for "Default Kotlin Hierarchy Template
   was not applied".

2. **Keep `commonMain` free of platform symbols.** No `java.io.File`,
   `java.time.*`, `System.*`, `platform.Foundation.*`, `android.*`. `commonMain`
   compiles to *every* target including Native/JS where those don't exist. Hide
   them behind `expect`/`actual` or an interface. *Detect:* grep
   `java\.|android\.|platform\.(Foundation|UIKit)|System\.(getProperty|currentTimeMillis)`
   in `src/commonMain`.

3. **Prefer a common interface + `expect fun` factory over `expect class`.**
   Interfaces allow test fakes and multiple implementations; `expect class` is
   still Beta (needs `-Xexpect-actual-classes`). Reach for `expect class` only for
   genuine platform-inheritance cases. *Detect:* grep `expect class` in
   `commonMain`.

4. **Keep `expect` declarations minimal and implementation-free.** They are
   templates; the compiler rejects bodies. When a factory accretes platform
   branches, graduate it to an interface.

5. **Confine single-platform dependencies to their source set.** `commonMain` may
   depend only on libraries shipping artifacts for *every* declared target
   (Coroutines, kotlinx-serialization, Ktor client core). OkHttp →
   `jvmMain`/`androidMain`; a Darwin engine → `iosMain`. A JVM-only dep in
   `commonMain` breaks the Native/JS build. *Detect:* review the `commonMain {
   dependencies }` block against each library's published KMP targets; build a
   non-JVM target in CI.

6. **Put `actual` implementations in the highest shared intermediate set.** For
   `iosArm64` + `iosSimulatorArm64`, the single `actual` goes in `iosMain`. For an
   `actual` shared across *all* Native targets (Apple + Linux), it goes one level
   higher in `nativeMain`, inherited by every Native target rather than duplicated
   per family. Leaf sets stay empty unless a leaf genuinely differs. *Detect:* grep
   `actual ` in leaf source sets (`iosArm64Main`, `iosSimulatorArm64Main`) — a
   duplicated `actual` is a smell.

7. **Avoid runtime OS branching in common code** (`if (Platform.isIOS)`). It
   defeats compile-time separation and leaves dead branches per target. Use
   `expect`/`actual` or an injected interface. *Detect:* grep `Platform.(is|current)`
   in `commonMain`.

8. **Write shared tests in `commonTest` against `kotlin.test` only.**
   `@Test`/`assertEquals`/`assertTrue` compile to all targets; keep JUnit/XCTest
   specifics in `jvmTest`/`iosTest`.

9. **Build all targets in CI from day one — and *run* a Native target you can run
   cheaply.** A single-target project lets common code reach that target's symbols;
   a second target makes the leak a compile error at the worst time. A Native bug
   is worse: it can compile everywhere and fail only at *runtime* on Native (a Flow
   emission-context violation that's green on JVM; an unsynchronized collection
   that races only on the multi-threaded Native dispatcher). Apple targets need
   `macos-latest` to link+run, so put them in CI — **and also run a Native target
   that executes on the cheap leg**, because the macOS runner is slow and costly to
   gate on. `linuxX64` compiles **and runs** on `ubuntu-latest`, so a `linuxX64Test`
   inside the ordinary `check` gives fast, cheap Kotlin/Native runtime coverage
   that catches the Native-only bug class locally and on every PR — reserve the
   macOS leg for genuinely Apple-specific verification (the XCFramework, the Darwin
   HTTP engine).

10. **Cache `~/.konan` (and `~/.gradle`) in CI.** Kotlin/Native re-downloads its
    toolchain into `~/.konan` per fresh container otherwise; key the cache on the
    version catalog so a Kotlin bump invalidates it.

11. **On Kotlin/Native, use the modern memory model — never legacy freezing.**
    Shared mutable state uses atomics / `AtomicReference` / `@Volatile`, never
    `freeze()` or `@SharedImmutable` (gone with the new MM). And remember Native
    runs coroutines on a genuinely multi-threaded dispatcher: any shared collection
    a test double or production type mutates from more than one coroutine must be
    guarded (a `Mutex` for suspend sections, or a copy-on-write atomic) — an
    unsynchronized `ArrayList.add` that's safe on a single-threaded JVM/iOS test
    dispatcher will race on Linux/Native. *Detect:* grep
    `freeze\(\)|@SharedImmutable|ensureNeverFrozen`.
