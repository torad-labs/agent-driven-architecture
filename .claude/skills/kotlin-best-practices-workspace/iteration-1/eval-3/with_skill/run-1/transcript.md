# Transcript — tier judgment for `SettingsViewModel.kt` review

## Process
1. Read `SKILL.md` → review mode + the tier selector ("pick the tiers that apply"
   FIRST; don't impose higher-tier rules on lower-tier code).
2. Read `references/review-framework.md` (smell tables, tier-tagged) and
   `references/core-kotlin.md` (Tier 0 detail) for the active tier.
3. Read the file under review in full.
4. Classified tiers, then walked only the Tier 0 tables + Tier 0 PR checklist.

## Tiers judged applicable

| Tier | Applicable? | Why |
|---|---|---|
| **0 — Core** | **YES** | It's Kotlin. Always applies. |
| **1 — Published API** | **NO** | `internal class`, single app module, file comment states nothing outside the module touches it. Skill's test: "can a caller you don't control compile against this?" → No. |
| **2 — Multiplatform** | **NO** | Single target (Android/JVM). No `commonMain`, no `expect`/`actual`, no multi-target `kotlin {}` build. |
| **3 — Publishing & iOS** | **NO** | No `publishing {}` / `framework {}` / XCFramework / Maven coordinate. |

## What the tier decision deliberately excluded (and why it would be wrong to raise)

The skill is explicit: raising library/ABI/publishing rules on an internal app
class is "noise that trains the reader to ignore you" and "buries the real
feedback." Concretely, I did NOT raise:

- **`explicitApi()` / explicit public return types** (Tier 1). The class and its
  members aren't a controlled public surface.
- **"Don't grow a public `data class`" against `SettingsUiState`** (Tier 1). This
  is the obvious trap in this file — a reviewer over-applying the skill would flag
  the `data class` and recommend a regular class + overloads. That rule exists for
  cross-module *binary compatibility*, which does not exist here. `data class`
  with defaults is the correct, idiomatic choice for internal UI state. Calling it
  out as a problem would be a false positive driven by tier confusion.
- **KMP / Native-dispatcher / `commonMain` purity** (Tier 2).
- **`api()` vs `implementation()`, Dokka javadoc jar, ABI dump gating** (Tier 3).

## Findings kept (all Tier 0)
1. Hardcoded `Dispatchers.IO` (lines 29, 51) — inject for testability. (Core
   Coroutines §6 + Testing table.) — the one I'd push on.
2. `persist()` launches unordered independent writes — last-write-wins not
   guaranteed (lost-update race). (Manual review; no static rule.)
3. No error handling on `read()`/`write()` — flagged with an honest caveat that
   `SettingsRepository` isn't in the review set, so fallibility is unconfirmed;
   plus a warning not to "fix" it with a default-on-failure (anti-pattern).

## Honesty notes applied
- Detection methods cited per-finding; #2 and #3 explicitly marked "manual review
  / no static rule" rather than implying a detector fires.
- #3 caveated because the repository type is out of scope of the provided files
  (only `SettingsViewModel.kt` and `PriceStreamRepository.kt` are present).
