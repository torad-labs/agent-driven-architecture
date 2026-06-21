plugins {
    kotlin("jvm") version "2.4.0"
    kotlin("plugin.serialization") version "2.4.0"
    application
}

repositories {
    // ai.torad:torad-aisdk is published on Maven Central, so a fresh checkout
    // resolves the runtime with no local setup (no publishToMavenLocal needed).
    mavenCentral()
}

dependencies {
    // The agent-loop runtime: Marcos's aisdk-kotlin (the architecture sits on top of it).
    implementation("ai.torad:torad-aisdk:0.3.0-alpha01")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("adr.DemoKt")
}

tasks.test {
    useJUnitPlatform()
}
