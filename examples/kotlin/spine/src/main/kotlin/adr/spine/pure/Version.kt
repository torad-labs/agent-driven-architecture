// ── spine/pure/Version — WHICH COPY OF THE TEMPLATE THIS TIER IS ───────────
//
// The spine is vendored source and no registry ever publishes it (1.3), so the
// moment an upstream defect is fixed, every adopter is holding a fork. This string
// is the only thing that makes that fork navigable: it names the template revision
// this copy was taken at, and the repository's CHANGELOG carries one entry per
// value of it saying what a copy at the previous value has to do to move up.
// Without the marker there is no migration mechanism at all — "vendored forever"
// and "vendored and abandoned" are the same tree.
//
// IT IS NOT ANY OF THE OTHER VERSION NUMBERS IN THIS TREE, and confusing them is
// the expensive mistake. Four independent questions, four independent answers,
// each with exactly one home:
//
//   · THE REDUCER VERSION — `app/Wire.kt`, APP-owned. Tags a snapshot with which
//     fold derived it, and refuses a snapshot taken under another (14.1).
//   · THE ENVELOPE `CURRENT_SCHEMA` — `spine/pure/StepRecord.kt`, SPINE-owned.
//     Says which shape a committed record is in (14.7).
//   · THE PROMPT VERSION — `app/Wire.kt`, APP-owned. A captured audit fixture,
//     not a compatibility number (14.7).
//   · THIS ONE — the template copy the reader is holding. Answered per vendored
//     tree: not per session, not per record, not per fold.
//
// The first, the second and this one are the three the ratified record refuses to
// merge; the prompt version is a fourth identifier that simply is not in that
// argument. A tree that merges any two of the three re-creates the
// over-engineering the dissolution removed, so nothing here derives from anything
// there and nothing there derives from this.
//
// The TypeScript port declares the same string at `spine/pure/version.ts`: ONE
// architecture revision, two spellings, so a CHANGELOG entry means the same thing
// to either adopter. The checker that keeps the two ports, this marker and the
// CHANGELOG from drifting apart lives in the TypeScript port
// (`test/laws/release.ts`) and reads BOTH ports' live text — the same single-home
// arrangement the citation lint already has, and for the same reason: two copies
// of one rule are two chances to disagree. This port's own gate pins the file into
// the spine roster, so deleting it here is red here.

package adr.spine.pure

/**
 * The template revision this vendored spine was taken at. Bumping it without adding
 * the matching CHANGELOG entry fails the build: the release check reads both and
 * refuses one without the other.
 */
const val SPINE_VERSION = "spine-1"
