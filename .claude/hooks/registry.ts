/**
 * THE HOOK CHAIN, DECLARED.
 *
 * Static imports, not directory scanning. A scanned chain silently shrinks when a file is renamed
 * or fails to parse — the session keeps running and the wall is simply gone, with nothing to
 * notice. Declared here, a missing module is a build error, and `selftest.ts` asserts the chain
 * is exactly this list. That is concept #924 applied to the guard layer itself: the chain cannot
 * quietly lose a link.
 *
 * 01-09  WALLS      PreToolUse. Refuse writes that would put the tree in a shape it must not take.
 *                   None registered: the ledger channel was the only one, and it went with the
 *                   ledger (operator ruling, 2026-10-10).
 * 10-19  LIFECYCLE  Session boundaries. Only the enforcement-surface digest remains. The re-anchor
 *                   and the stop beacon read the ledger, so they went with it.
 * (The 20-29 OPERATOR band is empty: the grant system it held was deleted 2026-08-13 on an
 *  operator ruling — "the grant system is dead". Its issuance channel was never even wired in
 *  this repo — no userpromptsubmit module exists to fire 20-grant-issue.)
 * 30-39  AUDIT      PostToolUse records. They refuse nothing and inject nothing; they exist so
 *                   that a route around a wall is conspicuous afterwards rather than invisible.
 *                   On a NOPASSWD host this is corroboration, never evidence — root can delete
 *                   the log. The load-bearing defence is dev/gates/ratchet.ts.
 */

// 01-no-python and 04-ast-grep-walls did NOT come across from compose-flow. The first is
// compose-flow's own operator law ("no python in this codebase at all"), and this repository's
// enforcement layer is currently Python; the second is hardwired to compose-flow-core/ paths and
// that repo's .yml ruleDirs, while this tree's .rules are .yaml under a registry.json.
// Both are PRODUCT decisions, not machinery, and travel no better than a decision book.
import deltaDigest from "./modules/12-delta-digest.ts";
import bashAudit from "./modules/30-bash-audit.ts";
import type { HookModule } from "./types.ts";

export const registry: readonly HookModule[] = [deltaDigest, bashAudit];
