// ── eslint.config.js — THE GATE (15.2) ─────────────────────────────────────
// 15.1 stakes the architecture's answer to its own central problem on machine
// enforcement, and 15.4 closes: "the payoff … is contingent on these checks
// being present and blocking." The shipped reference shipped NONE — `Date.now()`
// inside a tool body and an `fs` import in the domain file both compiled clean,
// 8/8 green, no CI, no lint config, no rule of any kind.
//
// Seventeen checks. FIFTEEN LIVE HERE, in ordinary ESLint rules that any
// TypeScript team already runs; C13 (registry totality plus handler totality)
// and C17 (no Irreversible-class effect constructed outside its pinned site) are
// vitest checks,
// because each is a question about VALUES or about the TREE, not about one
// file's syntax. All seventeen DENY — `npm
// run lint` exits non-zero — and every one ships a BLOCK-test and an ALLOW-test
// (test/gate/gate.test.ts over test/gate/fixtures/). There is no warning tier.
//
// Boring on purpose: `no-restricted-imports` with an allow-list regex per
// folder is §1.3's import table written out verbatim, `no-restricted-syntax` is
// the forbidden-call list, and exhaustiveness is the type-aware
// `switch-exhaustiveness-check`. Nothing here is a bespoke analyser, so a
// reader can check the rule against the ESLint docs rather than against us.
//
// Discipline (15.2): a wrong rule is FIXED and re-tested, never disabled. No
// check ships without its allow-test — that is what keeps a check from drifting
// into a nuisance authors turn off.

import tseslint from "typescript-eslint";

// ── the seventeen ───────────────────────────────────────────────────────────
// `by` is how test/gate/gate.test.ts attributes a lint message to a check:
// "tag" matches the `[Cn]` marker every message below carries, "rule" matches a
// whole rule id whose own wording we do not author.
export const CHECKS = [
  { id: "C1", invariant: "G4/G10 — dependencies point inward", by: "tag", rule: "" },
  { id: "C2", invariant: "G11 — no cross-block symbol import", by: "tag", rule: "" },
  { id: "C3", invariant: "G9 — no clock, random or id outside the boundary", by: "tag", rule: "" },
  { id: "C4", invariant: "G1 — an Actor is unrepresentable upstream", by: "tag", rule: "" },
  { id: "C5", invariant: "G9 — the fold cannot key an effect", by: "tag", rule: "" },
  { id: "C6", invariant: "§12.4 — per-item failures are not session-global", by: "tag", rule: "" },
  { id: "C7", invariant: "G1 — one production site for ToolResult", by: "tag", rule: "" },
  { id: "C8", invariant: "G2 — tools are pure", by: "tag", rule: "" },
  { id: "C9", invariant: "G12 — closed matches, no catch-all", by: "rule", rule: "@typescript-eslint/switch-exhaustiveness-check" },
  { id: "C10", invariant: "G7 — no service locators, no module-level mutable state", by: "tag", rule: "" },
  { id: "C11", invariant: "§7.9/G13 — ports are interfaces only", by: "tag", rule: "" },
  { id: "C12", invariant: "§4.6 — ephemeral view-state never folds", by: "tag", rule: "" },
  { id: "C13", invariant: "registry totality plus handler totality — every ok result has a Verb that signs, and every declared Effect kind has a registered handler", by: "vitest", rule: "" },
  { id: "C14", invariant: "G3 — the loop is a declaration", by: "tag", rule: "" },
  { id: "C15", invariant: "G14 — the spine tier is self-contained and vendorable", by: "tag", rule: "" },
  { id: "C16", invariant: "G6 — only the admission rule opens the fold's attributed output", by: "tag", rule: "" },
  { id: "C17", invariant: "G6 — an Irreversible-class effect is constructed only at its own pinned site, never in a Reversible verb's arm", by: "vitest", rule: "" },
];

// ── import-specifier vocabulary ─────────────────────────────────────────────
// §1.3's table is a table of specifier shapes, and since the workspace wall the
// tree spells them TWO ways: relative INSIDE a package, and a bare package
// specifier ACROSS one. Each fragment below is one cell of the table.
//
// The two spellings are not interchangeable and the split is deliberate. A bare
// specifier is resolved through the target package's `exports` map, so an
// unpublished path is a resolution error before any rule runs; a relative path
// is resolved against `rootDir`, so it is a resolution error only when it
// escapes into a project this one does not reference. Neither mechanism can say
// WHICH tier of a referenced package a folder may name — that is this table's
// job, and it is the reason the table outlives the wall.
const SIBLING = "\\./[a-z0-9-]+"; //                       ./slice
const SPINE_PURE = "\\.\\./pure/[a-z0-9-]+"; //             ../pure/ids        (from inside spine/)
const SPINE_PORTS = "\\.\\./ports/[a-z0-9-]+"; //           ../ports/bus
const SPINE_BOUNDARY = "\\.\\./boundary/[a-z0-9-]+"; //     ../boundary/action
const BLOCK_PURE = "@adr/spine/pure/[a-z0-9-]+"; //          @adr/spine/pure/ids (from inside blocks/X/)
// A block declares `@adr/spine` as a dependency, so it names the spine the way
// it names any dependency. The RELATIVE spelling `../../spine/pure/ids` is
// deliberately absent: it still compiles (a relative reach into a REFERENCED
// project is redirected to that project's declarations, measured), so keeping it
// off this list is what stops the package boundary being routed around by path.
const AGENT_SDK = "ai(?:/[a-z]+)?"; //                      the agent-loop runtime
// The schema CONVERTER, allowed here and nowhere else. spine/agent is already the one
// file licensed to interpret a schema — a block writes Valibot, spine/pure only ever
// calls `~standard.validate`, and the runtime wants JSON Schema for the tool
// definition. Granting the converter to this bucket keeps that conversion in the
// adapter instead of pushing JSON Schema up into what a block is allowed to write.
const SCHEMA_TO_JSON = "@valibot/to-json-schema";
const SCHEMA_DSL = "valibot"; //                            the input schema, model-facing AND the decoder.
//   A Standard Schema (standardschema.dev), so spine/pure names the STANDARD rather
//   than this library: see InputSchema in spine/pure/verb.ts. Swapping it for zod or
//   arktype is this one line plus the block imports — the spine does not move.
const EXTERNAL = "(?!@adr/)[^.].*"; //                       any client library, never a workspace package
//   The negative lookahead is load-bearing and it is a REGRESSION FIX, not
//   polish. Before the wall, `spine/*` was reachable only by a relative path, so
//   an adapter's licence to hold a client library could not reach it. Once the
//   spine became `@adr/spine`, a bare-anything allowance would have handed the
//   one impure file in a block every spine tier at once — `@adr/spine/boundary`
//   included. The adapter's spine allowance stays exactly `BLOCK_PURE`.

/** C1 — THE RULE, in the book's canonical wording, verbatim: an import may
 *  point inward toward the core, or it is the composition root; it may never
 *  point outward from the core, sideways between adapters, or from a passive
 *  node — a surface or a tool — into anything but domain types.
 *  §1.3 is that sentence as an ALLOW-LIST, so anything not listed is forbidden.
 *
 *  SUNSET — v0.3.0, marked 2026-07-30. The workspace wall ships in this release
 *  and this check is deleted in the next one. MEASURED, so the deletion is a
 *  decision and not a surprise: of the NINETEEN allow-list sites in this file
 *  the package boundary subsumes ZERO. Ten are INTRA-SPINE-TIER (`spine/pure`
 *  may not import `spine/ports`) and the spine is one package, so no package
 *  edge exists to express them. Eight are INTRA-BLOCK PER-FILE (only `tools.ts`
 *  gets the schema DSL, only `adapter.ts` gets a client library, only a
 *  `*.test.ts` resident gets the shared rig) and npm cannot scope a dependency
 *  below package granularity — the same limitation the Kotlin port names for
 *  Gradle. One is the catch-all, which the wall does subsume in part. What the
 *  wall adds is a SECOND, earlier layer on the cross-package fragment; what it
 *  cannot do is carry this table. Deleting this check on schedule therefore
 *  means moving those eighteen sites onto a layer that does not exist yet, and
 *  that layer is the release's work, not this file's.
 *
 *  The count is one `only(…)` call per bucket with an allow-list: ten spine
 *  buckets, eight inside a block folder (four of which share the `blockImports`
 *  helper), and the catch-all. `app` has no allow-list, which is what makes it
 *  the composition root.
 *
 *  The version is written `v0.3.0` with its prefix on purpose: an unprefixed
 *  three-component numeral on a comment line is read by the citation lint's
 *  STRICT position as a book section, and reported as a phantom one. */
const only = (where, ...allowed) => ({
  regex: `^(?!(?:${allowed.join("|")})$)`,
  message: `[C1] ${where}`,
});

// ── the checks that ride on `no-restricted-imports` ─────────────────────────

// C2 — G11: no cross-block symbol import. From inside `blocks/X`, a sibling is
// exactly one `../` away, any `../../blocks/…` is the long way round to the same
// place, and since the wall `@adr/block-…` is the third way. Blocks communicate
// by reading a sibling's slice off the one folded State as a VALUE, or by
// dispatching a verb the sibling's arm folds.
//
// SUNSET — v0.3.0, marked 2026-07-30, AND THE ONE ROUTE THE WALL LEAVES OPEN.
// Five cross-block routes were measured against a standing workspace, `tsc -b`
// exit code and error code each recorded in this port's README:
//   · `../escalation/fold`             — denied, TS6059 + TS6307 (rootDir)
//   · `@adr/block-escalation/fold`     — denied, TS2307 (unpublished subpath)
//   · `@adr/block-escalation/adapter`  — denied, TS2307 (unpublished subpath)
//   · `@adr/block-escalation`          — denied, TS2307 (no `.` export)
//   · `@adr/block-escalation/register` — RESOLVES CLEAN, exit 0
// The fifth is this rule's whole subject. npm links every workspace package into
// the single root node_modules, and neither an exports map nor a tsconfig
// reference can make a package's PUBLISHED entry visible to one consumer and
// invisible to another. So the wall narrows this route from "any file in the
// sibling" to "the sibling's one declared entry" and cannot close it. The third
// pattern below is what closes it, and the release that deletes this rule owes
// that route a replacement layer.
const C2 = [
  { regex: "^\\.\\./(?!\\.\\./)", message: "[C2] a block may not import a sibling block — blocks talk through the one folded State" },
  { regex: "^\\.\\./\\.\\./blocks/", message: "[C2] a block may not reach another block by path — blocks talk through the one folded State" },
  { regex: "^@adr/block-", message: "[C2] a block may not import a sibling block by package name either — the workspace links every package into one node_modules, so the sibling's published entry resolves and only this rule denies it" },
];

// C4 — G1: an Actor is UNREPRESENTABLE where a tool could forge one.
// Scoped to the files that DECLARE transport cases: a block's `slice`
// legitimately stores an Authority (that is the value the gate compares
// against, §2.2's `Escalating(requestedBy)`), and a fold arm legitimately
// receives the boundary's Signature. What may never happen is a ToolResult
// variant with an Actor-typed member — which is what these files declare.
const C4 = [
  {
    regex: ".",
    importNames: ["Actor", "Authority", "Signature", "authority"],
    message: "[C4] a ToolResult declaration may not name Actor/Authority/Signature — the stamp is minted after the tool returns",
  },
];

// C4, fourth half — ONE PRODUCTION SITE FOR THE STAMP, in THREE layers.
// The Kotlin port denies the resolved call `adr.spine.pure.Signature.<init>` in
// every folder but `**/spine/boundary/**` (detekt ForbiddenMethodCall).
// TypeScript has no module-internal visibility, so the analogue denies the
// VALUE BINDING instead: `Signature` is a CLASS, and a file that can only name
// it as a TYPE cannot construct one at all — `new Signature(…)` against a
// type-only import is a compile error, aliased or not.
//
// C4_MINT is ONE `no-restricted-imports` entry, deliberately not a set of
// esquery selectors. MEASURED: this single entry denies the named import, the
// aliased import, the inline-`type`-mixed import, the namespace import and the
// re-export, at ANY specifier spelling — including the `.js` suffix and any
// future rename of `actor.ts`, both of which defeated the path-keyed selectors
// this replaced. `allowTypeImports` keeps every `import type` fold arm and
// every `export type` register.ts clean. It is also this file's own idiom (C4,
// C5_MINT, C7_IMPORT all ride `importNames`), so it EXTENDS the owner rather
// than planting a rival detector at the same layer.
//
// THE ASYMMETRY IS THE POINT, and it is what closes the two-hop:
//
//   C4_MINT   is exempted for the minting bucket — the boundary MUST import
//             the constructor, or there is nothing to mint with.
//   C4_LAUNDER rides EVERY bucket, boundary included — a second module
//             republishing the constructor puts it back within reach under a
//             name an import rule cannot key on.
//   C4_SEAL   rides the minting bucket ONLY, and is the price of the
//             exemption: the one folder that holds a value binding of
//             `Signature` publishes NO value binding at all, because
//             `import { Signature as S }; export { S }` rebinds the name and a
//             name-keyed rule cannot follow a rebinding.
//
// NAMED RESIDUE, in the C4_SHAPE tradition of writing down what a rule cannot
// see. These three layers close STATIC ESM VALUE BINDINGS of the name, and
// nothing else:
//   · an explicit assertion (`{} as Signature`) or an `any` still produces a
//     value the type system accepts. It can no longer ride a Command — the
//     boundary refuses a Command whose stamp is not the one this step minted
//     (spine/boundary/action.ts) — but no rule here denies writing it.
//   · `boundary.ts` could wrap `new Signature(…)` in an exported function. That
//     is not a re-export and no selector sees it; it is a one-file diff inside
//     the one folder whose whole job is minting, and the runtime identity check
//     is what makes it non-load-bearing.
// The claim these rules earn is "the constructor cannot be BOUND outside the
// boundary", never "a Signature cannot be produced".
const C4_LAUNDER = [
  {
    selector: 'ExportNamedDeclaration[exportKind="value"] > ExportSpecifier[local.name="Signature"]',
    message:
      "[C4] `Signature` is never re-exported as a value — not even from `spine/boundary`, because a second module publishing the constructor puts it back within reach under a name the import denial cannot key on",
  },
  {
    selector: 'ExportAllDeclaration[exportKind="value"]',
    message:
      "[C4] a value `export * from` is denied everywhere — it republishes every binding of its source, including the Signature constructor, under no name at all",
  },
  // The DECLARATION spellings of the same republication. An ExportSpecifier
  // selector is structurally blind to `export const Stamp = Signature`,
  // `export default Signature` and `export class X extends Signature` — one
  // keystroke from the specifier form, and each one either rebinds the
  // constructor or IS a second production site. Name-keyed, so they ride every
  // bucket: outside the declaring file the value name cannot even enter scope
  // (C4_MINT), and the declaring file has no legitimate alias.
  {
    selector: 'VariableDeclarator[init.name="Signature"]',
    message:
      "[C4] binding `Signature` to a second name is denied everywhere — `const Stamp = Signature` is the declaration spelling of the re-export the specifier rule already denies, one keystroke apart",
  },
  {
    selector: 'ExportDefaultDeclaration[declaration.name="Signature"]',
    message:
      "[C4] `export default Signature` republishes the constructor under the one name an import denial cannot key on",
  },
  {
    selector: 'ClassDeclaration[superClass.name="Signature"]',
    message:
      "[C4] subclassing `Signature` forges a second constructor whose instances pass every check on the first — the subclass IS a production site",
  },
];

const C4_SEAL = [
  {
    selector: 'ExportNamedDeclaration[exportKind="value"] > ExportSpecifier',
    message:
      "[C4] the folder that mints the stamp publishes no value binding at all — `import { Signature as S }; export { S }` renames the constructor, and a name-keyed rule cannot follow a rebinding",
  },
  // The declaration spellings of the same leak. Inside the exempt folder the
  // constructor is legitimately in scope under ANY local name, so a name-keyed
  // selector cannot follow it; the seal must deny the FORM. The folder exports
  // only interfaces, classes, functions and types today, so banning
  // `export const` and `export default` wholesale costs nothing.
  {
    selector: 'ExportNamedDeclaration[exportKind="value"][declaration.type="VariableDeclaration"]',
    message:
      "[C4] the folder that mints the stamp publishes no value binding at all — `export const X = …` is the declaration spelling of the specifier re-export this bucket already denies",
  },
  {
    selector: 'ExportDefaultDeclaration',
    message:
      "[C4] the folder that mints the stamp publishes no value binding at all — a default export is a value binding under the one name no import rule can key on",
  },
];

const C4_MINT = [
  {
    regex: ".",
    importNames: ["Signature"],
    allowTypeImports: true,
    message:
      "[C4] only `spine/boundary` may name `Signature` as a value — upstream of the stamp it is a TYPE, so there is nothing to construct",
  },
];

// C5 — G9: the fold cannot mint an effect key. `Effect` is the FOLD's
// transport and carries no identity; `KeyedEffect` is the BOUNDARY's and is
// built from the COMMITTED step index, so it is literally unavailable until
// `bus.append` has returned.
const C5_MINT = [
  {
    regex: ".",
    importNames: ["EffectKey", "keyedEffect", "keyOf"],
    message: "[C5] only the boundary and the replay harness may mint an effect key",
  },
];
const C5_TYPE = [
  {
    regex: ".",
    importNames: ["KeyedEffect"],
    message: "[C5] KeyedEffect is the boundary's transport — the fold never names it",
  },
];

// C6 — 12.4: a per-item failure is not session-global. `Degraded`/`Error`
// describe the SESSION (a budget exceeded, an append that failed, a turn that
// threw) and belong to the boundary. A block that rejects one bad ticket folds
// a per-item `Notice.Rejected`.
const C6 = [
  {
    regex: ".",
    importNames: ["RunStatus", "RunStatusBase", "RunStatusKind", "Degraded", "Errored", "degraded", "errored", "working", "idle"],
    message: "[C6] a block may not touch the session-global RunStatus — a rejection folds a per-item Notice",
  },
];

// C7 — G1: ONE production site for every ToolResult. The spine's own two cases
// are minted at the boundary; a block's are minted by its verb bodies.
const C7_IMPORT = [
  {
    regex: ".",
    importNames: ["unhandled", "refused"],
    message: "[C7] only the boundary produces a spine ToolResult — a recorded result may never disagree with what was folded",
  },
];

// C8 — G2: a pure file names no I/O.
const C8_IMPORT = [{ regex: "^node:", message: "[C8] a pure file may not import a runtime module" }];

// C15 — G14: THE SPINE TIER IS SELF-CONTAINED, so it can be lifted out whole.
// 1.3 sells the spine as something you inherit rather than author. No package
// exists on any registry, and both reference ports carry the spine as source —
// so the honest claim is narrower and this check is what makes it PROVABLE
// rather than aspirational: the tier is a fixed, small, self-contained set of
// files that names nothing in your feature code, so you vendor it once and never
// edit it per feature. A published artifact is future work.
//
// IT IS NOT REDUNDANT WITH C1. C1 is a per-folder allow-list; C15 is a
// TIER-LEVEL DENIAL that no per-folder rule can accidentally relax, and it
// survives a future spine folder being added with a permissive bucket. (In the
// Kotlin port it catches something C1 structurally cannot: Kotlin forces every
// sealed-hierarchy variant into one package, which C1 has to permit.)
//
// SUNSET — v0.3.0, marked 2026-07-30. The wall gives this check a partner and not
// a replacement: `@adr/app` publishes no exports at all, so the spine naming the
// composition root by package name is TS2307, but the spine naming a BLOCK by
// package name resolves exactly as the app's own import does. The third pattern
// below is the one that denies it, and it is why the tier-level denial has to
// survive the wall rather than being retired by it.
const C15 = [
  { regex: "(^|/)blocks/", message: "[C15] the spine tier is self-contained — it may not name a block" },
  { regex: "(^|/)app/", message: "[C15] the spine tier is self-contained — it may not name the composition root" },
  { regex: "^@adr/block-", message: "[C15] the spine tier is self-contained — it may not name a block, and a package specifier is still naming one" },
];

// C12 — 4.6: ephemeral view-state never folds. Hover, scroll offset and an
// unsubmitted draft never enter a tool, never fold and never sign; only the
// owning block's `project` may read them.
const C12 = [{ regex: "view-state$", message: "[C12] only a block's own `project` may see its ephemeral view-state" }];

// ── the checks that ride on `no-restricted-syntax` ──────────────────────────

// C1, third half — a dynamic `import()` routes around the import table, because
// the specifier is an expression rather than a declaration. Nothing in the tree
// needs one, so the whole form is denied and the table stays total.
const NO_DYNAMIC_IMPORT = [
  { selector: "ImportExpression", message: "[C1] a dynamic import routes around §1.3's table — declare the dependency at the top of the file" },
];

// C3 — G9: `now` has exactly one source in the system, and it is a port.
const C3 = [
  { selector: 'MemberExpression[object.name="Date"][property.name="now"]', message: "[C3] `now` comes from the Clock port, read once per step at the boundary" },
  { selector: 'NewExpression[callee.name="Date"]', message: "[C3] `now` comes from the Clock port, read once per step at the boundary" },
  { selector: 'MemberExpression[object.name="Math"][property.name="random"]', message: "[C3] randomness is a port, not an ambient capability" },
  { selector: 'MemberExpression[object.name="crypto"]', message: "[C3] ids come from the IdSource port, minted from the committed sequence" },
  { selector: 'MemberExpression[object.name="performance"][property.name="now"]', message: "[C3] `now` comes from the Clock port, read once per step at the boundary" },
];

// C4, third half — the DECLARATIONS the stamp claims are staked on. Two shapes
// the book calls unrepresentable had no watcher here: `Ctx` gaining a
// stamp-typed member (§5.3/G1 — "no field of the read-only context may declare
// one"; verb.ts legitimately imports Signature for the sign seam, so the import
// rule cannot guard this), and a staged-input variant gaining an Authority
// (11.2 — "recall confers no authority BY CONSTRUCTION": the field's ABSENCE is
// the guarantee). Both were red-proven silent before this rule existed. The
// declaration is denied by NAME, and test/gate/anchors.test.ts pins that the
// named declarations still exist in the live tree — a name-keyed rule whose
// anchor drifts goes quietly vacuous, which is how C7's derivation rotted.
//
// NAMED RESIDUE (TS-structural): `Actor` is a string union, so an inline
// literal union (`by: "Human" | "Agent"`) spells the same shape with no type
// reference for this selector to see. Kotlin's enum has no such spelling.
const C4_SHAPE = [
  {
    selector: 'TSInterfaceDeclaration[id.name="Ctx"] TSTypeReference[typeName.name=/^(Actor|Authority|Signature)$/]',
    message: "[C4] Ctx carries no stamp — a tool cannot ask who is asking; the answer is minted after it returns",
  },
  {
    selector: 'TSInterfaceDeclaration[id.name=/^(StagedInputBase|Perceived|Recalled)$/] TSTypeReference[typeName.name=/^(Actor|Authority|Signature)$/]',
    message: "[C4] a staged input carries no stamp — recall confers no authority BY CONSTRUCTION (11.2)",
  },
];

// C7, THIRD half — the FORM every key-named selector in this file is blind to.
//
// `ObjectExpression > Property[key.name="outcome"]` below, `Property[key.name=
// "emitted"]` in C16, and every other key-keyed rule here read a NAME off the
// parse tree. `{ ["out" + "come"]: "ok" }` and `{ ["emitted"]: e }` spell the
// same field with a computed key and are, to all of them, invisible.
//
// So the FORM is denied rather than each spelling enumerated. That is a
// DELIBERATE WIDENING of C7's existing coverage: the literal rule below has had
// this hole since it was written, and closing it is asserted on its own fixture
// pair in test/gate/gate.test.ts. It rides EVERY bucket from inside `bucket()`
// for the same reason NO_DYNAMIC_IMPORT does — a table with one escape hatch is
// not a table — and it costs nothing today, because the whole live tree writes
// every object key literally (measured: zero hits, asserted as a standing test).
//
// THE ACCEPTED COST, stated so the next author is not surprised: this denies a
// LEGITIMATE computed key anywhere in any bucket — `({ [k]: v })` in an ordinary
// file is now a `[C7]` error. §15.2's remedy for a rule that has become a
// nuisance is to AMEND THE RULE WITH ITS FIXTURE PAIR and re-prove it both ways.
// It is never to suppress: an inline directive is itself a gate failure
// (`linterOptions.noInlineConfig`), and there is no third option.
const C7_COMPUTED = [
  {
    selector: "ObjectExpression > Property[computed=true]",
    message: "[C7] a computed key spells a field under a name no key-named rule in this gate can read — every object key in this tree is written literally",
  },
  {
    selector: "ObjectPattern > Property[computed=true]",
    message: "[C7] a computed key spells a field under a name no key-named rule in this gate can read — every object key in this tree is written literally",
  },
];

// C16 — G6: the fold's ATTRIBUTED output is opened by the admission rule and by
// nothing else (docs/DECISIONS.md:85).
//
// THE WALL IS THE LANGUAGE, NOT THIS RULE. `Attributed` (spine/pure/effect.ts)
// holds its two halves in `#`-private fields and publishes exactly one method,
// `admit`, so `a.emitted` does not exist to be written and no destructuring,
// spread or computed access can reach it. The Kotlin port makes the same move
// with private constructor properties. What this rule is, therefore, is a
// TRIPWIRE: it fires the instant a future author widens the field back out into
// an ordinary public member, which is the one edit that would turn the wall back
// into a convention. test/gate/anchors.test.ts pins the private shape itself.
//
// PROPERTY-READ ONLY, and never the bare token: `[property.type!="PrivateIdentifier"]`
// keeps the rule off the rule's own implementation, so no bucket needs an
// exemption flag and there is no per-file carve-out to spread. A KDoc or comment
// naming the word is not a member access and cannot trip it either.
//
// THE ACCEPTED COST: `m.emitted` on an unrelated object is denied tree-wide.
// That is the FORM being denied rather than the spelling enumerated; §15.2's
// remedy is to amend the rule with its fixture pair, never to suppress.
const C16 = [
  {
    selector: 'MemberExpression[property.type!="PrivateIdentifier"][property.name="emitted"]',
    message: "[C16] only the admission rule opens the fold's attributed output — an effect reaches `perform` through `admit`, never by field access",
  },
  {
    selector: 'MemberExpression[computed=true][property.value="emitted"]',
    message: "[C16] only the admission rule opens the fold's attributed output — a computed member access is the same read one keystroke apart",
  },
  {
    selector: 'ObjectPattern > Property[key.name="emitted"]',
    message: "[C16] only the admission rule opens the fold's attributed output — destructuring is the same read with the dot moved",
  },
];

// C7, second half — a ToolResult is an object literal with an `outcome` key.
// (`r.outcome === "ok"` is a READ, and reads are everywhere they should be.)
//
// The SAME key rides CommandBase, so this selector also denies a COMMAND
// literal outside a verb body or the boundary — a fold arm cannot stash a
// Command no gate ever saw into its own slice — and the C7 block-fixture pins
// the Command half so it cannot rot away unnoticed.
//
// NAMED RESIDUE, and it is the exact twin of the Kotlin port's `cmd.copy(…)`
// (src/test/kotlin/adr/gate/Rules.kt): a SPREAD carries the key without
// writing it, so `{ ...received }` in a fold arm mints a transport this
// text-level selector cannot see. Measured: the spread passes with no message.
// An earlier version of this paragraph claimed the opposite — that `outcome`
// being required meant no literal could be spelled without the key — which is
// true of a literal and false of a spread. Not closed by widening the selector:
// `slice.ts:withPriority` spreads legitimately, so denying SpreadElement in the
// pure buckets would be a nuisance rule §15.2 warns about. The stamp itself is
// not forgeable this way (Signature is a class, not a plain object), so a
// spread copy carries its original sig; the residue is recorded in
// OPEN-GAPS.md on both ports rather than half-closed here.
const C7_LITERAL = [
  {
    selector: 'ObjectExpression > Property[key.name="outcome"]',
    message: "[C7] signed transport (a ToolResult or a Command) may only be produced by a verb body or by the boundary",
  },
];

// C8 — G2: tools are pure. The tool body runs twice per agent action (once so
// the model has a payload to reason over, once at the boundary to produce the
// recorded truth); that is free for a pure function and ruinous for anything else.
const C8_SYNTAX = [
  { selector: "AwaitExpression", message: "[C8] a pure file does not await — I/O belongs to an adapter" },
  { selector: "FunctionDeclaration[async=true], FunctionExpression[async=true], ArrowFunctionExpression[async=true]", message: "[C8] a pure file declares no async function — I/O belongs to an adapter" },
  { selector: 'CallExpression[callee.name="fetch"]', message: "[C8] a pure file performs no I/O — that is what the adapter is for" },
  { selector: 'MemberExpression[object.name="process"]', message: "[C8] a pure file reads no ambient environment" },
];

// C10 — G7: no service locators, no module-level mutable state. `Program >` is
// the whole of it: a `let` inside a closure is a local, which is why
// `spine/boundary/in-memory` needs no exemption.
const C10 = [
  { selector: 'Program > VariableDeclaration[kind="let"]', message: "[C10] module-level mutable state is a service locator in disguise — pass it through the composition root" },
  { selector: 'Program > VariableDeclaration[kind="var"]', message: "[C10] module-level mutable state is a service locator in disguise — pass it through the composition root" },
  { selector: 'Program > ExportNamedDeclaration > VariableDeclaration[kind="let"]', message: "[C10] module-level mutable state is a service locator in disguise — pass it through the composition root" },
  { selector: 'Program > ExportNamedDeclaration > VariableDeclaration[kind="var"]', message: "[C10] module-level mutable state is a service locator in disguise — pass it through the composition root" },
];

// C11 — 7.9/G13: "a port is a published contract, not an implementation" is a
// property of the FOLDER, not a convention someone remembers.
const C11 = [
  {
    selector: "FunctionDeclaration, ClassDeclaration, VariableDeclaration, ArrowFunctionExpression, FunctionExpression, TSEnumDeclaration, TSModuleDeclaration",
    message: "[C11] a port is a published contract, not an implementation — declare an interface and bind it at the composition root",
  },
];

// C14 — G3: the loop is a DECLARATION. No branching, no state, no domain logic;
// it converts a verb table into SDK tools and hooks the boundary onto the
// finished-step callback.
// EXPRESSIONS DECIDE TOO. The first shipping listed statement nodes only, so a
// ternary — or a `&&`/`||`/`??` chain — passed a rule whose G3 cell promises
// "fails the build at its first decision point". The Kotlin half (detekt
// CyclomaticComplexMethod, threshold 2) counts every one of those; a TS rule
// that counted none of them made one laws.toml cell true on one port and false
// on the other. A declared default (`{ staged = [] }`) stays legal in both
// ports by the same reasoning: Kotlin's defaulted parameter is not a decision
// detekt counts, and the destructuring default is its TS spelling.
const C14 = [
  {
    selector: "IfStatement, ForStatement, ForOfStatement, ForInStatement, WhileStatement, DoWhileStatement, TryStatement, SwitchStatement",
    message: "[C14] the loop is a declaration, not a program — decisions belong to the fold",
  },
  {
    selector: "ConditionalExpression, LogicalExpression",
    message:
      "[C14] a ternary or a logical chain is a decision the loop may not make — decisions belong to the fold",
  },
];

// ── the checks that ride on `no-restricted-globals` ────────────────────────
// A selector matches `Date.now()`; it does not match `const { now } = Date`.
// Denying the GLOBAL closes the aliasing route, and costs nothing because no
// pure file in the system has any business naming one of these.
// `Math` is deliberately absent: `Math.max` is pure and legitimate, and a rule
// that forbids it is the nuisance 15.2 warns about — so C3 keeps a narrow
// selector for `Math.random` alone.
const C3_GLOBALS = [
  { name: "Date", message: "[C3] `now` comes from the Clock port, read once per step at the boundary" },
  { name: "crypto", message: "[C3] ids come from the IdSource port, minted from the committed sequence" },
  { name: "performance", message: "[C3] `now` comes from the Clock port, read once per step at the boundary" },
];
const C8_GLOBALS = [
  { name: "fetch", message: "[C8] a pure file performs no I/O — that is what the adapter is for" },
  { name: "process", message: "[C8] a pure file reads no ambient environment" },
];

// C9 — G12: a closed match, never a catch-all. Type-aware: the rule reads
// the union from the type checker, so adding a variant breaks every consumer.
const C9_RULE = {
  "@typescript-eslint/switch-exhaustiveness-check": [
    "error",
    {
      // our idiom is an explicit `default: { const _never: never = x }`, so an
      // exhaustive switch is allowed to carry one …
      allowDefaultCaseForExhaustiveSwitch: true,
      // … but a default NEVER makes a union switch count as exhaustive, which
      // is the whole point: `default: return "other"` is not a closed match.
      considerDefaultExhaustiveForUnions: false,
      requireDefaultForNonUnion: true,
    },
  ],
};

// ── composition helpers ─────────────────────────────────────────────────────

const bucket = (files, { imports, syntax, globals = [], mintsStamp = false }) => ({
  files,
  // THE GATE CANNOT BE SILENCED FROM INSIDE A FILE. Without this line, one
  // `/* eslint-disable */` comment turns every check below into prose — 15.2's
  // "a wrong rule is fixed and re-tested, never disabled" was a discipline,
  // and this is what makes it structural. A directive in the tree is inert,
  // and the block-test in test/gate/gate.test.ts watches one fail to work.
  linterOptions: { noInlineConfig: true },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  plugins: { "@typescript-eslint": tseslint.plugin },
  rules: {
    ...C9_RULE,
    "no-restricted-imports": imports.length === 0 ? "off" : ["error", { patterns: imports }],
    // NO_DYNAMIC_IMPORT, C4_LAUNDER, C7_COMPUTED and C16 ride every bucket, so a
    // bucket added later is denied all four by DEFAULT: an import table with an
    // escape hatch is not a table, and a stamp with a second publication site is
    // not a stamp. None of the four takes an exemption flag — C16 is written
    // against the PUBLIC member only, so the file that implements the rule needs
    // no carve-out and there is no per-file flag here that could spread.
    // `mintsStamp` TRADES one wall for another rather than switching a wall
    // off — the minting bucket loses C4_MINT and gains C4_SEAL — which is what
    // keeps the single exemption watched from both sides.
    "no-restricted-syntax": [
      "error",
      ...NO_DYNAMIC_IMPORT,
      ...C4_LAUNDER,
      ...C7_COMPUTED,
      ...C16,
      ...(mintsStamp ? C4_SEAL : []),
      ...syntax,
    ],
    // The BASE `no-restricted-imports` above is §1.3's per-bucket import table;
    // this one is C4's mint denial. Two rules, two pattern sets, both on.
    "@typescript-eslint/no-restricted-imports": mintsStamp
      ? "off"
      : ["error", { patterns: C4_MINT }],
    "no-restricted-globals": globals.length === 0 ? "off" : ["error", ...globals],
  },
});

/** every rule that applies to a file inside `blocks/<X>/`, before per-leaf edits */
const blockImports = (allowed, extra = []) => [
  only("a block may import `spine/pure` and its own folder, nothing else", ...allowed),
  ...C2,
  ...C5_MINT,
  ...C5_TYPE,
  ...C6,
  ...C7_IMPORT,
  ...C8_IMPORT,
  ...C12,
  ...extra,
];

const BLOCK_ALLOWED = [SIBLING, BLOCK_PURE];

// A block's isolation test now lives IN the block folder — residency is what
// makes the block's internals visible to it and to nothing else, since the
// package publishes only its registration. It is a RESIDENT rather than part of
// the shipped package (the package tsconfig excludes it), so it gets its own
// bucket instead of an exemption inside another one, and the bucket is narrow:
//   · its own folder, so the test can drive `./fold` and `./slice` directly —
//     the whole point of co-locating it;
//   · any spine tier, because an isolation test legitimately drives the replay
//     harness, which no shipped block file may name;
//   · the test runner, and the SHARED RIG under test/ by exact path — not a
//     free `../../../` — so a test cannot quietly become the route by which a
//     block folder reaches the composition root;
//   · C2 still rides it, so a resident may not reach a sibling block either.
// It does NOT get C4's mint denial by exemption: the four `new Signature(...)`
// calls these tests used moved to test/support/stamp.ts, so no file under src/
// binds the constructor outside `spine/boundary`. C7's literal rule and C12 are
// off here, because a test's job is to CONSTRUCT the transport it feeds to an
// arm and to read the view-state the console block owns.
const BLOCK_TEST_ALLOWED = [
  SIBLING,
  "@adr/spine/[a-z-]+/[a-z0-9-]+",
  "vitest",
  "\\.\\./\\.\\./\\.\\./test/(?:harness|support/[a-z0-9-]+)",
];
const PURE_SYNTAX = [...C3, ...C4_SHAPE, ...C7_LITERAL, ...C8_SYNTAX, ...C10];

// ── §1.3, folder by folder ─────────────────────────────────────────────────
// Ordered general → specific. Flat config merges rule-by-rule, so a later
// bucket restates only the rule it changes.
export const gate = [
  // The catch-all, first and strictest: a file that is in NONE of §1.3's
  // folders may import nothing at all. Every bucket below overrides both rules
  // wholesale, so this is what a file lands on by being somewhere undeclared —
  // a new folder cannot quietly opt out of the gate by not being listed.
  bucket(["**/src/**/*.ts"], {
    imports: [only("this file is in no folder §1.3 declares — it belongs under spine/, blocks/<X>/ or app/")],
    syntax: [...C3, ...C4_SHAPE, ...C7_LITERAL, ...C8_SYNTAX, ...C10],
    globals: [...C3_GLOBALS, ...C8_GLOBALS],
  }),

  // spine/pure — ZERO I/O; the transport vocabulary and nothing else.
  bucket(["**/src/spine/pure/**/*.ts"], {
    imports: [only("`spine/pure` may import `spine/pure` only", SIBLING), ...C5_MINT, ...C5_TYPE, ...C7_IMPORT, ...C8_IMPORT, ...C12, ...C15],
    syntax: PURE_SYNTAX,
    globals: [...C3_GLOBALS, ...C8_GLOBALS],
  }),
  // … except the two files that DECLARE what the others may not name.
  bucket(["**/src/spine/pure/tool-result.ts"], {
    imports: [only("`spine/pure` may import `spine/pure` only", SIBLING), ...C4, ...C5_MINT, ...C5_TYPE, ...C8_IMPORT, ...C12, ...C15],
    syntax: [...C3, ...C8_SYNTAX, ...C10],
    globals: [...C3_GLOBALS, ...C8_GLOBALS],
  }),
  bucket(["**/src/spine/pure/keyed-effect.ts"], {
    imports: [only("`spine/pure` may import `spine/pure` only", SIBLING), ...C7_IMPORT, ...C8_IMPORT, ...C12, ...C15],
    syntax: PURE_SYNTAX,
    globals: [...C3_GLOBALS, ...C8_GLOBALS],
  }),

  // spine/ports — INTERFACES ONLY. A file here with a body is a gate failure.
  bucket(["**/src/spine/ports/**/*.ts"], {
    imports: [only("`spine/ports` may import `spine/pure` only", SPINE_PURE), ...C5_MINT, ...C5_TYPE, ...C7_IMPORT, ...C8_IMPORT, ...C12, ...C15],
    syntax: [...C7_LITERAL, ...C10, ...C11],
  }),
  bucket(["**/src/spine/ports/sink.ts"], {
    // `perform` accepts a KeyedEffect and nothing else, so this one signature
    // has to name the type. It still may not MINT one.
    imports: [only("`spine/ports` may import `spine/pure` only", SPINE_PURE), ...C5_MINT, ...C7_IMPORT, ...C8_IMPORT, ...C12, ...C15],
    syntax: [...C7_LITERAL, ...C10, ...C11],
  }),

  // spine/boundary — THE ONE IMPURE SEAM. The clock, the ids and the keys live
  // here, and nowhere else.
  bucket(["**/src/spine/boundary/**/*.ts"], {
    imports: [only("`spine/boundary` may import `spine/pure` and `spine/ports`", SIBLING, SPINE_PURE, SPINE_PORTS), ...C12, ...C15],
    syntax: [...C10],
    // the ONE folder that may bind the `Signature` constructor as a value (C4),
    // and in exchange the one folder that may publish no value binding at all
    mintsStamp: true,
  }),

  // spine/agent — the ONLY file in the system that may name the agent runtime.
  bucket(["**/src/spine/agent/**/*.ts"], {
    imports: [
      only("`spine/agent` may import `spine/pure`, `spine/ports`, `spine/boundary`, the agent-loop SDK and the schema converter", SPINE_PURE, SPINE_PORTS, SPINE_BOUNDARY, AGENT_SDK, SCHEMA_TO_JSON),
      ...C5_MINT,
      ...C5_TYPE,
      ...C7_IMPORT,
      ...C8_IMPORT,
      ...C12,
      ...C15,
    ],
    syntax: [...C3, ...C7_LITERAL, ...C10, ...C14],
    globals: [...C3_GLOBALS],
  }),

  // spine/surface — ONE ViewModel stream and ONE action sink (G8).
  bucket(["**/src/spine/surface/**/*.ts"], {
    imports: [
      only("`spine/surface` may import `spine/pure`, `spine/ports` and `spine/boundary/action`", SPINE_PURE, SPINE_PORTS, "\\.\\./boundary/action"),
      ...C5_MINT,
      ...C5_TYPE,
      ...C7_IMPORT,
      ...C8_IMPORT,
      ...C12,
      ...C15,
    ],
    syntax: [...C3, ...C7_LITERAL, ...C10],
    globals: [...C3_GLOBALS],
  }),

  // spine/concurrency — THE BARGE-IN LOOP and THE TIER RELAY's read side. It
  // awaits, because bounding a turn and racing a mailbox is the whole job — so
  // C8's no-await rule is off here and C3 is NOT: the consumer reads no wall
  // clock, only relative durations handed to the Scheduler port, which is what
  // keeps `clock.now()` at the boundary the one clock read in the system.
  bucket(["**/src/spine/concurrency/**/*.ts"], {
    imports: [
      only("`spine/concurrency` may import `spine/pure`, `spine/ports` and `spine/boundary/action`", SPINE_PURE, SPINE_PORTS, "\\.\\./boundary/action"),
      ...C5_MINT,
      ...C5_TYPE,
      ...C7_IMPORT,
      ...C8_IMPORT,
      ...C12,
      ...C15,
    ],
    syntax: [...C3, ...C7_LITERAL, ...C10],
    globals: [...C3_GLOBALS],
  }),

  // spine/replay — re-folds committed bytes; may mint keys, performs nothing.
  bucket(["**/src/spine/replay/**/*.ts"], {
    imports: [only("`spine/replay` may import `spine/pure`, `spine/ports` and `spine/boundary`", SPINE_PURE, SPINE_PORTS, SPINE_BOUNDARY), ...C7_IMPORT, ...C8_IMPORT, ...C12, ...C15],
    syntax: [...C3, ...C7_LITERAL, ...C10],
    globals: [...C3_GLOBALS],
  }),

  // blocks/<X> — the default every file in a block folder starts from.
  bucket(["**/src/blocks/*/*.ts"], { imports: blockImports(BLOCK_ALLOWED), syntax: PURE_SYNTAX, globals: [...C3_GLOBALS, ...C8_GLOBALS] }),

  // blocks/<X>/contract — where the block's ToolResult cases are DECLARED.
  bucket(["**/src/blocks/*/contract.ts"], { imports: blockImports(BLOCK_ALLOWED, C4), syntax: PURE_SYNTAX, globals: [...C3_GLOBALS, ...C8_GLOBALS] }),

  // blocks/<X>/tools — the verb table: the ONE place a block mints a result.
  bucket(["**/src/blocks/*/tools.ts"], {
    imports: blockImports([...BLOCK_ALLOWED, SCHEMA_DSL]),
    syntax: [...C3, ...C8_SYNTAX, ...C10],
    globals: [...C3_GLOBALS, ...C8_GLOBALS],
  }),

  // blocks/<X>/project — the two pure projections; the ONE reader of view-state.
  bucket(["**/src/blocks/*/project.ts"], {
    imports: [only("a block may import `spine/pure` and its own folder, nothing else", ...BLOCK_ALLOWED), ...C2, ...C5_MINT, ...C5_TYPE, ...C6, ...C7_IMPORT, ...C8_IMPORT],
    syntax: PURE_SYNTAX,
    globals: [...C3_GLOBALS, ...C8_GLOBALS],
  }),

  // blocks/<X>/port — the block's private frozen contract.
  bucket(["**/src/blocks/*/port.ts"], { imports: blockImports(BLOCK_ALLOWED), syntax: [...C3, ...C7_LITERAL, ...C10, ...C11], globals: [...C3_GLOBALS, ...C8_GLOBALS] }),

  // blocks/<X>/adapter — the ONLY impure file in a block; it may hold a client.
  bucket(["**/src/blocks/*/adapter.ts"], {
    imports: [
      only("an adapter may import its own port, `spine/pure` and its own client library", SIBLING, BLOCK_PURE, EXTERNAL),
      ...C2,
      ...C5_MINT,
      ...C5_TYPE,
      ...C6,
      ...C7_IMPORT,
      ...C12,
    ],
    syntax: [...C3, ...C7_LITERAL, ...C10],
    globals: [...C3_GLOBALS],
  }),

  // blocks/<X>/view-state — EPHEMERAL. It imports nothing at all.
  bucket(["**/src/blocks/*/view-state.ts"], {
    imports: [only("ephemeral view-state imports nothing — it is not part of the system's truth"), ...C2],
    syntax: PURE_SYNTAX,
    globals: [...C3_GLOBALS, ...C8_GLOBALS],
  }),

  // blocks/<X>/*.test — the CO-LOCATED isolation test, a resident of the folder.
  bucket(["**/src/blocks/*/*.test.ts"], {
    imports: [
      only("a co-located block test may import its own folder, any spine tier, the runner and the shared rig", ...BLOCK_TEST_ALLOWED),
      ...C2,
      ...C5_MINT,
      ...C6,
    ],
    syntax: [...C3, ...C8_SYNTAX, ...C10],
    globals: [...C3_GLOBALS, ...C8_GLOBALS],
  }),

  // app — THE ROOT. The single cross-layer importer (G7/G10), and the only
  // place that may name every block.
  bucket(["**/src/app/**/*.ts"], {
    imports: [...C5_MINT, ...C7_IMPORT, ...C12],
    syntax: [...C3, ...C7_LITERAL, ...C10],
    globals: [...C3_GLOBALS],
  }),
];

export default [
  {
    // test/gate/fixtures holds DELIBERATELY BROKEN source — it is INPUT to the
    // gate's own block-tests, not part of the tree the gate defends.
    // .tsbuild holds the wall's declaration output — generated, git-ignored, and
    // not source, exactly like test/gate/.work. Belt-and-braces: measured, eslint
    // already skips dot-directories, so this documents intent and costs nothing.
    ignores: [
      "node_modules/**",
      "test/gate/fixtures/**",
      // the quickstart walk's adopter template - a SECOND application, linted by
      // nothing here and compiled only inside its own scratch tree.
      "test/laws/fixtures/quickstart/**",
      // the G12 harness's scratch copy, at the port root since it began carrying
      // `test/`; the old path stays listed so a stale copy is ignored too.
      ".work/**",
      "test/gate/.work/**",
      ".tsbuild/**",
    ],
  },
  ...gate,
];
