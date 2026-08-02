// ── spine/pure/staged — the OFF-BUS INPUT fixture, sealed (5.4, 10.2, 11.2) ─
// Everything a step consumed that did NOT come off the bus, in the order it was
// staged. Two kinds, and they differ in exactly one way that matters: where the
// text came from. NEITHER IS TRUSTED.
//
//   Perceived   10.2 — content a sensor, an inbox or a webhook perceived.
//   Recalled    11.2 — a PEER TIER's published conclusion, fetched through the
//                      relay. A suggestion, never a command. It carries no
//                      Authority, and there is no field on it that could carry
//                      one, so recall confers no authority BY CONSTRUCTION.
//
// G12, expressed natively: a shared base interface declares `source` ONCE, the
// union is closed here, and every consumer matches it with a `never` guard.
//
// WHY THE RECALL OUTCOME IS A SEALED SET AND NOT A NULLABLE STRING. "The deep
// tier has not published yet" and "the deep tier is slow and this is what we
// held last" are different facts with different consequences, and a caller that
// cannot tell them apart will eventually present stale as fresh. Three variants,
// three `never`-guarded consumers (`renderStaged` below, plus the analysis
// block's view row and context line), so a fourth cannot slip past.
//
// WHY `publishedAt` AND NOT A PRE-COMPUTED `age`. An age captured at read time
// is a SECOND clock reading, unrecorded, and it would diverge on every re-fold.
// `publishedAt` is a value that travels; the age is DERIVED at the consuming
// step (`ageOf`) from the one clock read the boundary already makes. That keeps
// "`clock.now()` is the only clock read in the system" literally true, and makes
// the age deterministic under replay.

import type { SourceKey, SourceName, Timestamp } from "./ids";

// ── The relay's own record ──────────────────────────────────────────────────
// What an append-only relay hands back. Declared here, in `spine/pure`, because
// it rides `Recall` onto the committed record; the port that reads it lives in
// `spine/ports/relay`.

export interface RelayEntry {
  readonly publishedAt: Timestamp;
  readonly text: string;
}

/** How long the FAST tier will wait for the relay before degrading. The party
 *  that must not block owns the bound — never the port (11.2). */
export const RECALL_DEADLINE_MS = 50;

// ── Recall: the sealed outcome of one bounded read ──────────────────────────

export type RecallKind = "Fresh" | "LastKnown" | "Empty";

/** The parent declares both shared properties exactly once, so no variant can
 *  be added that forgets to say what it holds or when it was published. */
export interface RecallBase {
  readonly kind: RecallKind;
  readonly text: string;
  readonly publishedAt: Timestamp | null;
}

/** The read completed inside its deadline. */
export interface Fresh extends RecallBase {
  readonly kind: "Fresh";
  readonly publishedAt: Timestamp;
}

/** The deadline blew; this is the newest entry we already held. STALE, and it
 *  says so in its own type — a caller cannot mistake it for `Fresh` without
 *  writing the mistake down. */
export interface LastKnown extends RecallBase {
  readonly kind: "LastKnown";
  readonly publishedAt: Timestamp;
}

/** Wired, nothing to give. Also covers "timed out and we have never read
 *  successfully" — decided, not overlooked: the fast tier's behaviour is
 *  identical in both cases (it has no conclusion), and the operational signal
 *  that the relay is slow is the FOLDED fault, not this type. */
export interface EmptyRecall extends RecallBase {
  readonly kind: "Empty";
  readonly text: "";
  readonly publishedAt: null;
}

export type Recall = Fresh | LastKnown | EmptyRecall;

export const emptyRecall: EmptyRecall = { kind: "Empty", text: "", publishedAt: null };

export function fresh(entry: RelayEntry): Fresh {
  return { kind: "Fresh", text: entry.text, publishedAt: entry.publishedAt };
}

export function lastKnown(entry: RelayEntry): LastKnown {
  return { kind: "LastKnown", text: entry.text, publishedAt: entry.publishedAt };
}

/** Derived at the consuming step from the ONE injected clock read — never
 *  captured at read time. `null` when there is nothing to age. */
export function ageOf(recall: Recall, now: Timestamp): number | null {
  return recall.publishedAt === null ? null : now - recall.publishedAt;
}

// ── StagedInput: the sealed set the committed record carries ────────────────

export type StagedKind = "Perceived" | "Recalled";

export interface StagedInputBase {
  readonly kind: StagedKind;
  readonly source: SourceName;
}

/** Untrusted perceived content staged for this turn (10.2).
 *
 *  `key` is the source's OWN id for this work item, and it rides the COMMITTED
 *  record on purpose: the durable policy's dedupe scope is rebuilt from the
 *  timeline at recovery (12.2), so "each work item folds at most once" survives
 *  a process restart. A key held only on the uncommitted mailbox envelope dies
 *  with the process — which is exactly the double-fold this field closes. */
export interface Perceived extends StagedInputBase {
  readonly kind: "Perceived";
  readonly body: string;
  readonly key: SourceKey;
}

/** A peer tier's conclusion, staged for this turn (11.2). There is exactly ONE
 *  production site for this variant in the system — the consumer — mirroring
 *  the one-production-site rule `ToolResult` already lives under (C7). A
 *  producer cannot post a forged relay snapshot. */
export interface Recalled extends StagedInputBase {
  readonly kind: "Recalled";
  readonly recall: Recall;
}

export type StagedInput = Perceived | Recalled;

/** The discriminant as a CONSTANT, and the ONE place it is compared — the same
 *  move `spine/pure/mailbox` makes for `Input`. Recovery filters a committed
 *  timeline through this guard to rebuild the durable dedupe scope. */
export const PERCEIVED_KIND = "Perceived" as const;

export function isPerceived(staged: StagedInput): staged is Perceived {
  return staged.kind === PERCEIVED_KIND;
}

export function perceived(source: SourceName, body: string, key: SourceKey): Perceived {
  return { kind: "Perceived", source, body, key };
}

export function recalled(source: SourceName, recall: Recall): Recalled {
  return { kind: "Recalled", source, recall };
}

/** CONSUMER 1 of 3 of the sealed `Recall`. The digest the model reads must say
 *  which branch was taken, because that digest is what the committed
 *  `ContextFixture` pins — a live run that recalled `Fresh` and a re-fold that
 *  resolved `LastKnown` would produce different text and fail the golden trace. */
export function renderStaged(staged: StagedInput): string {
  switch (staged.kind) {
    case "Perceived":
      return `staged[${staged.source}]: ${staged.body}`;
    case "Recalled":
      return `recall[${staged.source}]: ${renderRecall(staged.recall)}`;
    default: {
      const _never: never = staged;
      return _never;
    }
  }
}

function renderRecall(recall: Recall): string {
  switch (recall.kind) {
    case "Fresh":
      return `fresh, published @${recall.publishedAt} — ${recall.text}`;
    case "LastKnown":
      return `LAST KNOWN (relay did not answer in time), published @${recall.publishedAt} — ${recall.text}`;
    case "Empty":
      return "no conclusion published";
    default: {
      const _never: never = recall;
      return _never;
    }
  }
}
