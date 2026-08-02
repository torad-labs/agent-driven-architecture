// ── test/support/must — a named failure instead of `!` ─────────────────────
// `records().at(-1)!` asserts to the compiler what the test has not checked. When the
// assumption is wrong the failure is `Cannot read properties of undefined`, pointing at
// whatever ran next rather than at the assumption that broke.
//
// `must` costs the same one token and fails where the assumption is. It is the TS twin
// of the Kotlin port's `?: error("…")`, landed for the same reason: a `!!` replaced by a
// branch that names what cannot happen.

export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error(`must(): expected a value, got ${String(value)}`);
  }
  return value;
}
