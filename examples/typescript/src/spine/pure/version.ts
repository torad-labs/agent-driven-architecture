// ── spine/pure/version — WHICH COPY OF THE TEMPLATE THIS TIER IS ───────────
//
// The spine is vendored source and no registry ever publishes it (1.3), so the
// moment an upstream defect is fixed, every adopter is holding a fork. This
// string is the only thing that makes that fork navigable: it names the
// template revision this copy was taken at, and the repository's CHANGELOG
// carries one entry per value of it saying what a copy at the previous value
// has to do to move up. Without the marker there is no migration mechanism at
// all — "vendored forever" and "vendored and abandoned" are the same tree.
//
// IT IS NOT ANY OF THE OTHER VERSION NUMBERS IN THIS TREE, and confusing them
// is the expensive mistake. Four independent questions, four independent
// answers, each with exactly one home:
//
//   · THE REDUCER VERSION — `src/app/wire.ts`, APP-owned. Tags a snapshot with
//     which fold derived it, and refuses a snapshot taken under another (14.1).
//   · THE ENVELOPE `SCHEMA_VERSION` — `src/spine/pure/step-record.ts`,
//     SPINE-owned. Says which shape a committed record is in (14.7).
//   · THE PROMPT VERSION — `src/app/wire.ts`, APP-owned. A captured audit
//     fixture, not a compatibility number (14.7).
//   · THIS ONE — the template copy the reader is holding. Answered per
//     vendored tree: not per session, not per record, not per fold.
//
// The first, the second and this one are the three the ratified record refuses
// to merge; the prompt version is a fourth identifier that simply is not in
// that argument. A tree that merges any two of the three re-creates the
// over-engineering the dissolution removed, so nothing here derives from
// anything there and nothing there derives from this.
//
// The Kotlin port declares the same string at `spine/pure/Version.kt`: ONE
// architecture revision, two spellings, so a CHANGELOG entry means the same
// thing to either adopter. `test/laws/release.ts` is the checker that keeps
// the two ports, this marker and the CHANGELOG from drifting apart — it reads
// this file's live text rather than a copy, so renaming the constant is red
// rather than silent.

/** The template revision this vendored spine was taken at. Bumping it without
 *  adding the matching CHANGELOG entry fails the build: the release check reads
 *  both and refuses one without the other. */
export const SPINE_VERSION = "spine-1";
