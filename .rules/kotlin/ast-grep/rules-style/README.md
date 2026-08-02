# Kotlin Style Rules

Rules in this directory are valid ast-grep rules preserved for opt-in style enforcement. They are not listed in the default `sgconfig.yml` `ruleDirs`, so `torad add kotlin-rules` does not block on them by default.

Curated 2026-07-03 (KT-3) from a calibration scan of 71 rules against three real Kotlin corpora (5,577 findings): house architecture tenets and rules whose violation cannot be distinguished syntactically from idiomatic code (e.g. `no-else-in-sealed-when` cannot see whether the `when` subject is sealed; `sealed-over-stringly` flags wire-protocol string parsing — the compliant pattern). Opt in per project by adding `rules-style` to `ruleDirs`.
