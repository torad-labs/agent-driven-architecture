A VIOLATING Kotlin step list: the replay test invocation has been dropped.
It is deliberately terse: the checker judges whether the claims are present and
resolvable, never whether the prose is good.

This step list is for YOUR new repository.

Paths it names:
* `spine/build.gradle.kts`
* `spine/src/main/kotlin/adr/blocks/`
* `spine/src/main/kotlin/adr/spine/pure/Version.kt`
* `settings.gradle.kts`
* `build-logic/`
* `block/console/src/main/kotlin/adr/blocks/console/Fold.kt`
* `block/console/adapter/build.gradle.kts`
* `src/test/kotlin/adr/spine/ReplayTest.kt`

Commands it runs:
* `./gradlew --console=plain check`
* `./gradlew run`

Walked facts it keeps:
* Extending sealed classes or interfaces from a different module is prohibited
* without an existing directory is not allowed
* ReplayTest
