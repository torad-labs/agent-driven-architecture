---
name: kotlin-best-practices
description: >-
  Engineering standard for writing AND reviewing idiomatic, correct, maintainable
  Kotlin — apps, scripts, and especially published libraries and Kotlin
  Multiplatform (KMP) modules. Use whenever writing or reviewing/improving Kotlin:
  coroutines and Flow, cancellation and structured concurrency,
  kotlinx.serialization wire contracts, error handling and retry/resilience,
  performance, public-API binary compatibility (explicitApi, ABI, deprecation),
  KMP source sets and expect/actual, and Maven Central / iOS publishing. Trigger
  even without the words "best practice": "review this Kotlin/KMP code", "is this
  idiomatic", "will this break binary compat", "fix this coroutine/Flow/serializer",
  or a Kotlin/KMP PR review. Rules are tiered: core for all Kotlin; library,
  multiplatform, and publishing rules for published or multiplatform modules. NOT
  for: Java-to-Kotlin conversion, AGP or CocoaPods-to-SwiftPM migrations,
  JPA/Hibernate entity mapping, Jetpack Compose UI, or trivial syntax questions —
  dedicated skills own those.
---

# Kotlin Engineering Best Practices

The standard a contributor's Kotlin is held to, and the checklist a reviewer
applies. It exists because the costly Kotlin mistakes are invisible in a green
local build: a swallowed `CancellationException` that leaks coroutines in
someone else's production app, a `Flow` emitted off-context that throws only on
Kotlin/Native, a renamed `@SerialName` that breaks stored data, or — for a
library — an inferred return type that becomes a `NoSuchMethodError` in a
downstream consumer six months later.

The aim is **correct, idiomatic, evolvable Kotlin**, and for libraries, **a
green merge, not a green diff.**

## Two modes

This skill drives two jobs. Decide which the user is asking for:

- **Writing mode** — generating new Kotlin (a function, a class, a feature, a
  module). Apply the rules for the tiers in play (below) *as you write*, and
  explain the non-obvious choices so the reader learns the *why*.
- **Review mode** — auditing a diff, a PR, a file, or "is this good / idiomatic /
  safe?". Work through `references/review-framework.md` — the grep/detekt-able
  smell tables and the PR checklist — and report findings in the format that
  section defines. A finding is *smell → why it's rejected → fix → how it was
  detected.*

If the user's intent spans both ("write X and make sure it's solid"), write it
in writing mode, then do a quick review-mode pass over what you produced.

## First, pick the tiers that apply

**Not every rule applies to every Kotlin file.** Imposing library/ABI rules on a
throwaway script, or publishing rules on an internal app module, is noise that
trains the reader to ignore you. Before applying anything, classify the code:

| Tier | Applies when… | Load |
|---|---|---|
| **0 — Core** | **Always.** Any Kotlin at all. | `references/core-kotlin.md` |
| **1 — Published API** | The code is compiled against by *other* modules/teams/consumers — a library, an SDK, a published artifact, a shared `:core` module with a stable surface. | `references/library-and-api.md` |
| **2 — Multiplatform** | The module targets more than one platform (JVM + Android + iOS / Native / JS / Wasm). | `references/multiplatform.md` |
| **3 — Publishing & iOS interop** | You are shipping a KMP library to Maven Central and/or it is consumed from Swift/iOS. | `references/library-and-api.md` (Publishing & iOS section) |

Heuristics for picking tiers:
- A one-off script, an app feature, an internal class nobody else compiles
  against → **Tier 0 only.** Don't raise ABI, `explicitApi`, or publishing
  concerns; they don't apply and they bury the real feedback.
- A function/type that other modules call across a stable boundary → **Tier 0 + 1.**
- A `commonMain` source set, an `expect`/`actual`, a `build.gradle.kts` with
  multiple `kotlin { }` targets → add **Tier 2.**
- A `framework {}` / XCFramework / `publishing {}` block, a Maven coordinate →
  add **Tier 3.**

When unsure whether code is a "published API", ask one question: *can a caller
you don't control compile against this?* If yes, Tier 1 applies.

## The principles, one screen

The highest-value rule from each theme. The detail, the *why*, and the
detection method live in the reference block named in brackets.

**Core (Tier 0) — apply to all Kotlin:**
- **Rethrow `CancellationException` first in every broad catch.** Swallowing it
  leaves coroutines running after their scope is gone and defeats `withTimeout`.
  Never wrap a `suspend` call in stdlib `runCatching` (it captures cancellation
  into `Result.failure`). [core-kotlin → Coroutines]
- **Streaming = a non-suspend function returning a cold `Flow`;** set its
  dispatcher with `.flowOn(...)` as the last operator, never `withContext`/
  `launch` around `emit()` (that throws `Flow invariant is violated`, sometimes
  only on Native). [core-kotlin → Coroutines]
- **Inject dispatchers, `Clock`, `Random`, and the HTTP engine;** never hardcode
  `Dispatchers.IO`/`System.currentTimeMillis()`/`Random.Default` inside a class —
  it's nondeterministic and untestable. [core-kotlin → Coroutines, Testing]
- **Reuse one `Json` instance;** pin `@SerialName` on every polymorphic subtype;
  use per-class `@JsonIgnoreUnknownKeys` for forward-compat, not the global flag.
  [core-kotlin → Serialization]
- **Carry machine-readable error fields** (status, cause, `isRetryable`); retry
  only retryable statuses with capped, *jittered* backoff + a deadline; never
  return a mock/default on failure (it fakes success). [core-kotlin → Errors]
- **Allocation discipline on hot/streaming paths:** reuse `StringBuilder` not
  `+=`; frame streams incrementally over one buffer (not `split` per chunk);
  `@JvmInline value class` for single-field ids (and keep them unboxed). [core-kotlin → Performance]
- **Nullable-with-default for "absent", never sentinels** (`-1`/`""`/`"AUTO"`);
  no behavior-switching `Boolean` params; `sealed` + exhaustive `when`; KDoc the
  public surface. [core-kotlin → Ergonomics]
- **Never `println`/`NSLog`/`Log.d` in reusable code;** route through an injected
  logger seam; never log secrets or full request/response bodies unredacted.
  [core-kotlin → Security]

**Published API (Tier 1):**
- **`explicitApi()` strict; explicit return/property types** on every public
  declaration (inferred types pin the compiled signature to inference). Gate the
  surface on a committed **ABI dump**. [library-and-api → API & Binary Compat]
- **Add params via a new overload, never by appending** (even defaulted — the
  JVM descriptor moves → `NoSuchMethodError`). Don't grow a public `data class`.
  Treat `@PublishedApi internal` as frozen public ABI. [library-and-api]
- **Evolve, don't remove:** `@Deprecated` WARNING → ERROR → HIDDEN, never bare
  removal. [library-and-api]

**Multiplatform (Tier 2):**
- **Keep `commonMain` free of platform symbols** (`java.*`, `android.*`,
  `platform.Foundation.*`); hide them behind `expect`/`actual` or an interface.
  Put `actual`s in the highest shared source set. [multiplatform]
- **Build *and run* a cheap Native target in CI** (e.g. `linuxX64`), not only the
  costly macOS leg — Native-only bugs (a Flow-context violation, an
  unsynchronized collection racing on the multi-threaded Native dispatcher)
  compile everywhere and fail only at Native runtime. [multiplatform]

**Publishing & iOS (Tier 3):**
- **Declare any dependency whose types appear in the public API as `api()`,** not
  `implementation()` (else the POM scopes it `runtime` and consumers can't
  resolve the type). Publish all artifacts from one macOS runner. [library-and-api → Publishing]

## Writing mode — how to apply

1. Classify the tiers (above). State them briefly if non-obvious ("this is a
   published `commonMain` API, so Tier 0+1+2 apply").
2. Read the reference block(s) for those tiers and write to them.
3. Prefer the idiomatic construct with the *why* attached in a comment or the
   explanation — e.g. "returning a cold `Flow` (not `suspend`) so collection
   stays lazy and cancellable."
4. Match the surrounding code's style. Don't impose a higher tier than the code
   lives at.

## Review mode — how to apply

1. Classify the tiers of the code under review.
2. Open `references/review-framework.md`. Walk the smell tables for the active
   tiers; for each match, capture: **smell**, **why rejected**, **fix**, **how
   detected** (the grep/detekt rule, the ABI diff, or "manual review backed by
   X" when no static check exists — be honest about which).
3. Run the relevant lines of the **PR checklist** at the end of that block.
4. Report findings highest-severity first. A finding the reader can't act on
   (vague, or a rule from a tier that doesn't apply) is worse than no finding.
   Distinguish blocking issues from suggestions.

Honesty rule, for both modes: when you cite a "detector", be precise about
whether it actually fires. A grep that can't really catch the smell, or a detekt
rule that needs type resolution the project doesn't run, is "manual review
backed by X" — say so rather than implying enforcement that isn't there.

## Reference blocks

Load only what the active tiers need:

- **`references/core-kotlin.md`** — Tier 0, applies to all Kotlin: Coroutines &
  Flow, Serialization, Error Handling & Resilience, Runtime Performance,
  Ergonomics & Type Safety, Testing (`runTest`/`MockEngine`/injected seams), and
  Security & logging hygiene. Start here for almost everything.
- **`references/library-and-api.md`** — Tiers 1 & 3: public API design & binary
  compatibility (explicitApi, ABI dumps, deprecation, data-class evolution,
  `@PublishedApi`), and Publishing & iOS interop (Maven Central, XCFramework,
  SKIE, `api()` vs `implementation()`, supply-chain verification).
- **`references/multiplatform.md`** — Tier 2: KMP source-set structure,
  `expect`/`actual` discipline, the default hierarchy template, confining
  platform dependencies, and running a cheap Native target in CI.
- **`references/review-framework.md`** — the Rejection Framework (tier-tagged
  smell tables: smell / why rejected / do instead / how to detect) plus the
  one-page PR Review Checklist. This is review mode's primary tool.
