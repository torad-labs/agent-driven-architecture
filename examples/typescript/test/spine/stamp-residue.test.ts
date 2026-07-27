// ── D2(b) — THE RUNTIME HALF OF THE STAMP WALL, AND ITS NAMED RESIDUE ──────
//
// test/gate/forge.test.ts proves the stamp cannot be SPELLED, and C4 proves the
// constructor cannot be BOUND outside `spine/boundary`. Neither closes the
// forge, and this file exists because that was measured rather than argued:
// against the shape-plus-lint version of this wall, EIGHT assertion-free
// vectors compiled AND linted clean inside a real block fold arm with the whole
// gate at EXIT=0 —
//
//     Object.assign({}, sig, { by: "Human" })              // T & U
//     Object.assign(structuredClone(sig), { by: "Human" }) // T -> T
//     patch(sig, { by: "Human" })                          // <T>(T, Partial<T>) => T
//     withField(sig, "by", "Human")                        // <T, K extends keyof T>
//     const widen: { by: string } = sig; widen.by = "Human"   // structural write
//     Reflect.set(sig, "by", "Human")                      // reflective write
//     Object.assign(sig, { by: "Human" })                   // IN-PLACE, on the boundary's own stamp
//     new (sig.constructor as new (…) => Signature)("Human", sig.authority)
//
// — and the seventh put `by: "Human"` on the COMMITTED, append-only StepRecord
// the boundary had just stamped `Agent`. The launder lives in the GENERIC
// SIGNATURE, not in the brand, so no spelling of the brand (`unique symbol`,
// `private`, `#`) can reach it, and the eighth produces a real branded frozen
// instance that no shape check could ever distinguish.
//
// Two runtime walls close the class, and this file is their enforcement layer —
// D5's bar met with a vitest probe rather than a fixture pair, because the
// invariant is about values at run time and not about syntax:
//
//   FREEZE    the minted stamp cannot be relabelled IN PLACE, so the record the
//             boundary committed keeps the actor the gate saw.
//   IDENTITY  a Command may only carry the stamp its own step minted, checked
//             at the single `verb.sign` call site — the one check a type
//             launder, a cast, an `any` and constructor reflection all fail.
//
// The third test is not a wall. It PINS A RESIDUE: `Reflect.set` on a frozen
// object returns `false` instead of throwing. The value is protected, the
// caller is not told, and writing that down is the difference between a bounded
// claim and a slogan.

import { describe, expect, it } from "vitest";
import { registryOf, signResult } from "../../src/spine/boundary/action";
import type { Actor, Authority } from "../../src/spine/pure/actor";
import { authority, Signature } from "../../src/spine/pure/actor";
import type { CommandBase } from "../../src/spine/pure/command";
import type { ToolResultBase } from "../../src/spine/pure/tool-result";
import type { InputSchema } from "../../src/spine/pure/verb";
import { reversible } from "../../src/spine/pure/verb";
import { harness } from "../harness";
import { must } from "../support/must";

describe("D2(b) — the minted stamp is frozen", () => {
  it("the stamp on a committed record cannot be relabelled in place", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "recallAnalysis", input: { recall: "x", publishedAt: 1 } }],
    });
    const sig = must(h.app.bus.records()[0]).sig;

    expect(Object.isFrozen(sig)).toBe(true);
    expect(sig.by).toBe("Agent");
    // `readonly` is a compile-time annotation and nothing more. Without the
    // freeze this line SUCCEEDS and the append-only record silently reads
    // "Human" — measured, through this exact harness.
    expect(() => Object.assign(sig, { by: "Human" })).toThrow(TypeError);
    expect(sig.by).toBe("Agent");
  });

  it("NAMED RESIDUE — Reflect.set is refused SILENTLY, not loudly", () => {
    // Deliberately NOT written as `toThrow`. `Reflect.set` on a frozen object
    // returns `false`; a caller that ignores the return value believes it
    // succeeded. The value is protected either way, which is why this is a
    // residue and not a hole — but a wall whose failure mode nobody wrote down
    // is a wall someone will later mistake for total.
    const sig = new Signature("Agent", authority("agent-run-7f"));
    expect(Reflect.set(sig, "by", "Human")).toBe(false);
    expect(sig.by).toBe("Agent");
  });
});

// ── the identity check at the ONE `verb.sign` call site ────────────────────
// `CommandBase.sig` is the ONLY Signature-typed value block code can emit, and
// `verb.sign` has exactly ONE call site (spine/boundary/action.ts). So this is
// where the constructed-forge class dies: whatever a verb hands back, if it is
// not the object THIS step minted, the boundary commits a refusal carrying its
// own stamp instead.

interface ForgeResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "forge";
}

interface ForgeCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "forge";
}

const NOTHING: InputSchema<null> = { "~standard": { validate: () => ({ value: null }) } };

/** A registry of one verb whose `sign` hands back a stamp it built itself. */
function forging(forge: (sig: Signature) => Signature) {
  return registryOf<null>([
    reversible<null, null, ForgeResult, ForgeCommand>({
      name: "forge",
      describe: "hands back a stamp the boundary never minted",
      schema: NOTHING,
      run: () => ({ outcome: "ok", tool: "forge" }),
      sign: (result, sig, id) => ({ outcome: "ok", tool: result.tool, sig: forge(sig), id }),
    }),
  ]);
}

/** Every laundering route that survives the shape and the lint. Each produces a
 *  value `tsc --noEmit` accepts as a `Signature` with NO assertion anywhere —
 *  which is precisely why the wall below is reference equality and not a shape
 *  check, a brand check, or a lint rule. */
const patch = <T extends object>(base: T, over: Partial<T>): T => ({ ...base, ...over });
const withField = <T extends object, K extends keyof T>(base: T, k: K, v: T[K]): T => ({
  ...base,
  [k]: v,
});

const LAUNDERS: readonly (readonly [string, (sig: Signature) => Signature])[] = [
  ["Object.assign intersection", (sig) => Object.assign({}, sig, { by: "Human" as const })],
  [
    "structuredClone + assign",
    (sig) => Object.assign(structuredClone(sig), { by: "Human" as const }),
  ],
  ["generic patch<T>", (sig) => patch(sig, { by: "Human" })],
  ["generic withField<T, K>", (sig) => withField(sig, "by", "Human")],
  [
    "constructor reflection",
    (sig) =>
      new (sig.constructor as new (b: Actor, a: Authority) => Signature)("Human", sig.authority),
  ],
  ["an explicit assertion", (sig) => ({ by: "Human", authority: sig.authority }) as Signature],
];

describe("D2(b) — a Command may only carry the stamp its own step minted", () => {
  it("REFUSES every forged stamp by identity — and passes the honest verb through", () => {
    const minted = new Signature("Agent", authority("agent-run-7f"));

    for (const [name, forge] of LAUNDERS) {
      const cmd = signResult(forging(forge), { outcome: "ok", tool: "forge" }, minted, "c1");
      // reference identity, NEVER toEqual: every launder above is structurally
      // a valid Signature, and four of them are structurally EQUAL to a valid
      // one. Only "is it this object" separates them.
      expect(cmd.sig, name).toBe(minted);
      expect(cmd.sig.by, name).toBe("Agent");
      expect(cmd.outcome, name).toBe("refused");
      expect(cmd.tool, name).toBe("forge");
      expect(cmd.id, name).toBe("c1");
    }

    // THE ALLOW-HALF, in the same `it` because it is the same one question. A
    // verb that carries the stamp it was handed — which is what all twelve
    // shipped verbs do — must pass through untouched, or this check is a
    // nuisance that denies the tree. The suite already proves that at scale:
    // `record.commands.at(-1)` is asserted `outcome: "ok"` in console, action,
    // gate, relay and mailbox tests, so inverting this branch (`===` for `!==`)
    // turns EIGHT of them red across THREE files — measured, not assumed. This
    // line is the local, readable half of that.
    const honest = signResult(
      forging((sig) => sig),
      { outcome: "ok", tool: "forge" },
      minted,
      "c1",
    );
    expect(honest.outcome).toBe("ok");
    expect(honest.sig).toBe(minted);
  });
});
