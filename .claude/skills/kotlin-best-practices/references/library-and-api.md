# Published API & Publishing (Tiers 1 & 3)

Load this when the code is compiled against by *others* — a library, an SDK, a
published artifact, a shared module with a stable surface (Tier 1) — and/or when
you're shipping it to Maven Central or consuming it from Swift/iOS (Tier 3).

**Do not apply these rules to app code, scripts, or internal classes nobody
external compiles against.** The whole point of a tier is to not raise
binary-compatibility concerns where there is no binary contract.

## Contents
- [API Design & Backward Compatibility](#api-design--backward-compatibility) (Tier 1)
- [Publishing & iOS Interop](#publishing--ios-interop) (Tier 3)
- [Supply Chain](#supply-chain) (Tier 1/3)

---

## API Design & Backward Compatibility

The published surface is a contract. Three kinds of compatibility are in scope —
binary, source, and behavioral — and binary breaks are the ones invisible in a
source review. The recurring failure mode: it compiles for you, and throws
`NoSuchMethodError`/`AbstractMethodError` in a consumer compiled against the old
bytecode.

1. **Keep `explicitApi()` strict on; never suppress it.** Every public/protected
   declaration must carry an explicit visibility modifier and an explicit
   return/property type, or the build fails. An inferred return type pins the
   *compiled* signature to whatever inference produced, so a body edit
   (`List`→`Collection`) silently changes the published descriptor. *Detect:*
   `explicitApi()` errors; detekt `LibraryCodeMustSpecifyReturnType`.

2. **Write the explicit type on every public return and property — never an
   expression body that infers it.** The bytecode encodes the declared type:
   `fun parse(): JsonElement`, not `fun parse() = ...`.

3. **Gate the public surface on a committed ABI dump.** Two mechanisms exist: the
   mature standalone **binary-compatibility-validator** plugin (`apiDump` to
   regenerate, `apiCheck` under `check`), and the newer **in-KGP** validation
   (`abiValidation {}` DSL, `updateKotlinAbi`/`checkKotlinAbi`) which also covers
   the merged klib ABI for multiplatform — note the KGP DSL is still
   `@ExperimentalAbiValidation` (needs opt-in, and its options have been renamed
   across Kotlin versions, e.g. the unsupported-targets knob). Either way it fails
   the build on any unreviewed change to the public ABI. Treat a dump diff as a
   reviewable API change, never a formality, and never run the update task
   reflexively to go green — that silently blesses a real break. *Caveat:* a Kotlin compiler bump
   can legitimately re-emit the dump (reordered members, new synthetic
   accessors); pin the Kotlin version, regenerate in the same PR, and call the
   churn out as expected — don't let it train reviewers to rubber-stamp dump
   diffs.

4. **Add optional parameters via a new overload, never by appending — even with a
   default.** Any parameter change alters the JVM method descriptor →
   `NoSuchMethodError` for already-compiled Kotlin callers. Source still compiles,
   hiding it from review; the ABI dump catches it. `@JvmOverloads` does **not**
   fix this for Kotlin callers: an omitted-default Kotlin call binds to the
   `$default` synthetic + an arg-presence bitmask, not a telescoping overload, so
   the `$default` descriptor a recompiled caller needs is still the one that
   moved. Only a hand-written overload preserves the old descriptor.

5. **Do not let a public `data class` grow.** Adding a property changes the
   synthesized constructor + `copy(...)` descriptors (binary break); reordering
   remaps `componentN()` (behavioral break). Where a public value type is expected
   to gain fields, model it as a regular class or interface. A `data class` with a
   genuinely frozen shape is fine — but make "this never grows" an explicit,
   recorded decision.

6. **Seal closed domain hierarchies.** `sealed interface`/`sealed class` blocks
   illegal external implementations and makes consumer `when` exhaustive without
   `else`. For a hierarchy you *intend* consumers to extend (and may add abstract
   members to), use `@SubclassOptInRequired` instead — it requires opt-in at the
   inheritance site, signalling "you may extend, but new members can appear." Plain
   `open` on a growable contract breaks subclasses silently.

7. **Treat `@PublishedApi internal` as frozen public ABI.** It is inlined into
   client bytecode, so changing it breaks binary compatibility exactly like a
   public change — the `internal` keyword fools reviewers. Subject every
   `@PublishedApi` declaration to the same compatibility review as public API.
   *Detect:* grep `@PublishedApi`; audit each against the ABI dump.

8. **Accept and return read-only collections; never expose arrays or `Mutable*`.**
   Callers must not mutate library-held state, and arrays force defensive copies.
   Public signatures use `List`/`Set`/`Map`; back internal mutation with a private
   `_xs` exposed as the read-only supertype. *Detect:* grep
   `: (Mutable(List|Set|Map)|Array)<` in the public surface (note `explicitApi()`
   does **not** flag these once the type is written).

9. **Evolve, don't remove — and tie deprecation to versions.** Retire API with
   `@Deprecated(message, replaceWith = ReplaceWith(...))` escalating `WARNING` →
   `ERROR` → `HIDDEN`, never bare removal. The levels map to compatibility:
   `WARNING` is source-and-binary-safe; `ERROR` is source-breaking but still emits
   the old bytecode (binary-safe); `HIDDEN` removes it from source resolution while
   still emitting bytecode, so binary compat survives until final deletion in a
   major. Advance the levels across your *own* releases — for a normal library that
   means bumping `@Deprecated(level = …)` deliberately per release (the
   `@DeprecatedSinceKotlin(warningSince, errorSince, hiddenSince)` annotation looks
   like the automation for this, but its versions are *Kotlin API versions* keyed
   to the consumer's `-api-version` — it's meant for stdlib/`kotlin.*` deprecation,
   not arbitrary library versions). Don't abuse `@RequiresOptIn` to retire existing
   declarations — opt-in stages *new* surface, it doesn't kill old.

10. **Pin the JVM default-methods mode explicitly; treat it as an ABI decision.**
    Since Kotlin 2.2, interface functions with bodies compile to real JVM default
    methods, controlled by the stable `-jvm-default` option. For a published
    library keep `-jvm-default=enable` (generates the default method **and** keeps
    `DefaultImpls` compatibility stubs, so consumers compiled against older
    bytecode still link). Switching to `no-compatibility` after release drops
    `DefaultImpls` from the ABI — a classic invisible binary break the ABI dump
    catches. Opt individual interfaces out of stubs with
    `@JvmDefaultWithoutCompatibility`.

11. **Tie release numbers to SemVer; back it with `@since` + a kept CHANGELOG.**
    Post-1.0, the version is the compatibility contract: binary-or-source break =
    **major**, additive surface = **minor**, fix = **patch** — and the proof is the
    ABI dump, not memory. Put `@since <version>` on every new public declaration,
    and ship a `CHANGELOG.md` entry with every reviewable ABI-dump change in the
    same PR. *Detect:* no static bump-correctness check exists — this is manual
    review backed by the ABI diff (a dump change with only a patch bump, or a
    disappearance without a prior `@Deprecated` release, is a finding).

12. **Gate unstable surface behind a tiered `@RequiresOptIn` marker.**
    `Level.ERROR` for surfaces that may break binary compat; markers need
    BINARY/RUNTIME retention and no `EXPRESSION`/`FILE`/`TYPE` target. Propagate
    opt-ins you consume upward. Feed internal-but-`public` markers into the ABI
    exclusion filter so churning them never trips the check.

13. **Every dependency whose types appear in the public ABI must be declared
    `api()`, not `implementation()`.** See Publishing §below — this is the most
    common "fails differently from an app" defect.

---

## Publishing & iOS Interop

A KMP library publishes one umbrella module plus per-target artifacts, all of
which Maven Central wants in **one** deployment from **one** macOS host.

1. **Publish all artifacts from a single macOS runner.** Apple `.klib`/XCFramework
   artifacts only build on macOS, and Central forbids duplicate root publications.
   One `publish...` task, `runs-on: macos-latest`. Splitting the publish across
   hosts produces duplicate `kotlinMultiplatform` modules and fails the deploy.

2. **Populate required POM metadata and gate on pre-publish guards.** Central
   rejects deployments missing license/developer/SCM or a PGP signature. Refuse to
   publish a `SNAPSHOT`, refuse unsigned artifacts, and require credentials —
   guards that fail *before* upload, not after.

   **Publish through the Central Portal, not legacy OSSRH.** Sonatype sunset the
   old OSSRH / `nexus-staging` flow (cutoff mid-2025); new projects deploy via the
   Central Portal. Don't hand-roll the staging/signing/POM dance — use the
   community-standard `com.vanniktech.maven.publish` plugin, which targets the
   Portal, wires signing + sources + the Dokka javadoc jar, and validates the POM.
   A skill or build that points at `nexus-staging`/OSSRH is already stale.

3. **Ship a real Dokka HTML `-javadoc` jar, never an empty stub.** Dokka's Javadoc
   format can't render KMP, so HTML-in-javadoc.jar is the correct way to satisfy
   Central and stay browsable. An empty javadoc jar passes validation and gives
   consumers nothing.

4. **Package Apple output as an XCFramework with a stable `baseName` and explicit
   `bundleId`.** `baseName` is the Swift `import` name; `bundleId` sets a unique
   `CFBundleIdentifier`. Never ship a fat/universal framework — the App Store
   rejects simulator slices.

5. **Declare any dependency whose types appear in the public ABI as `api()`, not
   `implementation()`.** Coroutines, kotlinx-serialization, and Ktor types leak
   into public signatures (a returned `Flow`, a `@Serializable` param, an engine
   seam); if declared `implementation()`, the generated POM scopes them `runtime`,
   the type is invisible to consumers at compile time, and their build fails to
   resolve a symbol that's plainly in your API. This is *the* canonical
   "fails-differently-from-an-app" defect — an app never publishes a POM. *Detect:*
   cross-check ABI-dump types against the POM's `compile`-scope deps; any
   ABI-visible type whose artifact is only `runtime`-scoped is a finding.

6. **For iOS DX, apply SKIE in the framework-producing module only.** The raw ObjC
   bridge turns `Flow` into an opaque object (not `AsyncSequence`), `suspend` into
   completion handlers (not `async`), and sealed types into non-exhaustive Swift.
   SKIE fixes this — but applied outside the module with `framework {}` /
   `native.cocoapods` it silently no-ops. Pin SKIE and Kotlin versions together,
   and **verify SKIE supports your exact Kotlin version before adopting** — it
   tracks Kotlin closely but can lag a fresh release by days (e.g. it didn't
   support Kotlin 2.4.0 on that version's release day), and an unsupported pairing
   fails the build.

7. **Don't rely on JetBrains Swift export for the production iOS surface yet** (it
   is Alpha as of Kotlin 2.4 and supports only final classes directly inheriting
   `Any`, type-erases generics, and breaks on sealed/open hierarchies). Default to
   ObjC bridge + SKIE; track Swift export behind a flag.

---

## Supply Chain

1. **Pin and verify inbound dependencies with `gradle/verification-metadata.xml`.**
   Outbound artifact signing protects consumers; it does nothing for the
   dependencies *your* build pulls. Gradle's dependency verification fails the
   build when a downloaded artifact's SHA-256 (and optionally PGP signature)
   doesn't match a committed expectation — the defense against a compromised or
   namespace-hijacked dependency. Bootstrap with
   `./gradlew --write-verification-metadata sha256,pgp --export-keys`, then
   **review the generated file by hand** (bootstrapping trusts whatever is
   currently resolvable) and commit it. Pin versions in the version catalog; avoid
   dynamic/`+`/`-SNAPSHOT` coordinates, which sidestep the checksum. *Detect:*
   `test -f gradle/verification-metadata.xml`; grep the catalog for `+`/dynamic
   versions.
