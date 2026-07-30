plugins {
    `kotlin-dsl`
}

dependencies {
    // The convention plugins apply the Kotlin JVM and serialization plugins by id,
    // so both have to be on THIS build's classpath. Versions match the root build.
    implementation("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.0")
    implementation("org.jetbrains.kotlin:kotlin-serialization:2.4.0")
}
