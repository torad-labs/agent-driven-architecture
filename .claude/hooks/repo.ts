/**
 * REPO-LEVEL CONSTANTS — the only file a vendoring has to edit.
 *
 * The harness in this directory is vendored from compose-flow (lineage in
 * dev/campaigns/setup/VENDORED.md). Everything else in it is repository-agnostic; these three
 * values are what differ between consumers.
 *
 * WHY THIS FILE EXISTS. In the source repo the ledger path was a `const LEDGER` duplicated across
 * four lifecycle modules. Four copies of one fact is four chances for a vendoring to update three
 * of them — and the one it misses fails silently, because a lifecycle module that cannot read the
 * ledger returns null and simply says nothing. That is the quietest possible failure in the whole
 * chain. Extracted here on vendoring; worth promoting back upstream.
 */

/** The campaign ledger this repository's lifecycle modules read. */
export const LEDGER = "dev/campaigns/sdk.toml";

/** The readiness matrix. */
export const MATRIX = "dev/matrix.toml";

/** Used only in operator-facing messages, never in logic. */
export const REPO_NAME = "agent-driven-architecture";
