// ── spine/pure/actor — the stamp (G1, amended by G6) ────────────────────────
// TWO orthogonal questions, two types:
//
//   Actor      answers WHO ACTED.              Closed; grows only at architecture
//                                              revision, never per application.
//   Authority  answers UNDER WHOSE PERMISSION. An opaque principal id.
//
// The irreversible gate keys on the Authority, NEVER on the Actor. That is what
// makes an unattended confirmer representable (a policy tier acts *through* the
// agent's stream, so `by` is truthfully `Agent`, while its `authority` differs
// from the one that raised the Request) without adding an Actor variant: a tenth
// kind of confirmer is a new Authority id, never a new Actor.
//
// Both fields ride ONE value — `Signature` — minted once per step at the
// boundary and carried onto every Command. Nothing upstream of the boundary can
// name any of these three symbols (gate check C4): an Actor is UNREPRESENTABLE
// where a tool could forge it, not merely unused.

/** WHO ACTED. It grows only at ARCHITECTURE REVISION, never per application: a
 *  tenth kind of confirmer adds an Authority id, never a variant here.
 *
 *  `Spine` is what a revision looks like. The spine itself authors steps nobody
 *  asked for — a conflated input, a turn that ignored cancellation, a fault caught
 *  off a port — and stamping those `Agent` said a model decided them. It did not.
 *  The timeline had no way to say who did until this value existed. */
export type Actor = "Human" | "Agent" | "Spine";

declare const AUTHORITY_BRAND: unique symbol;

/** An opaque principal id — like a TicketId, not a variant set. It answers
 *  "under whose permission", and a tenth kind of confirmer adds no type. */
export type Authority = string & { readonly [AUTHORITY_BRAND]: true };

/** The ONLY way to mint an Authority. Denied inside `blocks/**` (check C4). */
export function authority(id: string): Authority {
  return id as Authority;
}

/** Authorship and permission, together, stamped once per step at the boundary.
 *
 *  DELIBERATELY A CLASS WITH A PRIVATE `#` BRAND — not an interface, and NOT
 *  the `unique symbol` intersection `Authority` uses ten lines up. An interface
 *  is STRUCTURAL: every fold arm legitimately RECEIVES a Signature, and a
 *  structural type any file can name is a type that file can also spell. The
 *  forge was one line inside an arm that already holds the agent's stamp:
 *
 *      const forged: Signature = { ...sig, by: "Human" };
 *
 *  MEASURED, and this is why the local `Authority` idiom is not copied here: a
 *  `unique symbol` brand denies the bare literal and leaves that SPREAD
 *  compiling, because TypeScript's object-spread type carries the brand
 *  property over from the spread source. A `#` field is not a property a
 *  spread can carry, so both spellings stop type-checking.
 *  test/gate/fixtures/forged-signature/ runs both against the real compiler,
 *  and that probe is also the regression pin: revert this class to an
 *  interface and the probe goes green where it must be red.
 *
 *  `Object.freeze(this)` IS LOAD-BEARING, not defensive habit. `readonly` is a
 *  compile-time annotation and nothing more: without the freeze,
 *  `Object.assign(sig, { by: "Human" })` inside any fold arm relabels the
 *  boundary's OWN stamp in place, and the append-only record the boundary
 *  committed then reads an actor the gate never saw. Measured: exactly that,
 *  through the real harness, before this line existed. It is behaviour-neutral
 *  otherwise — `by` and `authority` stay public readonly, so every read in the
 *  tree (`sig.by`, `sig.authority`) is untouched, and value equality is NOT
 *  hand-written, unlike the Kotlin half: Kotlin's `==` dispatches to `equals`,
 *  so a plain class there would silently become reference-equal, while TS `===`
 *  on an object was already reference equality when this was an interface.
 *  Nothing moved sideways.
 *
 *  WHAT THE THREE LAYERS EARN, and no more:
 *   · COMPILE — the stamp cannot be SPELLED. Bare literal, object spread, and
 *     construction from a type-only import all fail `tsc`.
 *   · LINT — no file outside `spine/boundary` may BIND this name as a value by
 *     any static ESM form at any specifier spelling (C4_MINT), no file may
 *     re-export it as a value (C4_LAUNDER), and the minting folder may publish
 *     no value binding at all (C4_SEAL).
 *   · RUNTIME — this freeze, so the minted stamp cannot be relabelled in place;
 *     and `spine/boundary/action.ts`, where a Command may only carry the stamp
 *     its own step minted, checked by IDENTITY.
 *
 *  NAMED RESIDUE, because "unforgeable" would be a lie:
 *   (a) `Reflect.set(sig, "by", "Human")` returns `false` instead of throwing.
 *       The value is protected; the caller is not told. Pinned by a test.
 *   (b) an explicit assertion or an `any` still produces a value the compiler
 *       accepts as a Signature — as in any language with a cast, and as this
 *       tree's own gate probes do deliberately. It can no longer ride a
 *       Command, but nothing otherwise denies writing it.
 *   (c) a fold arm can write a literal `Actor` string into its OWN slice
 *       (`ArtifactLine.by`, blocks/artifact/slice.ts) with no Signature
 *       involved at all. That is not a stamp forge, and no Signature shape
 *       prevents it. */
export class Signature {
  readonly #stamp = true;

  constructor(
    readonly by: Actor,
    readonly authority: Authority,
  ) {
    Object.freeze(this);
  }
}
