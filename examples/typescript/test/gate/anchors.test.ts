// ── THE GATE'S ANCHORS — every name the rules key on, pinned to the live tree ─
//
// The failure class this file closes was found live, in C7: a rule keyed to a
// shape (unions as interfaces) went quietly VACUOUS when the live tree migrated
// (unions became classes), while its fixtures — separate frozen trees still
// written in the old shape — kept its block-test green. A name-keyed or
// path-keyed rule has the same failure mode: rename `RunStatus`, move
// `keyedEffect`, or rename a block file, and the rule that keys on it stops
// matching anything, silently, forever.
//
// So every anchor is pinned here, in the cheapest medium that fails loudly:
//   · names the rules key on   → real imports, so `tsc` breaks on a rename
//   · the `outcome` key C7 rides → a `keyof` pin, so a field rename breaks here
//   · the filenames the buckets scope by → exact per-block rosters, like the
//     spine roster pin in gate.test.ts
//
// A rule whose anchor cannot drift silently is a rule whose fixtures can be
// trusted to stand in for the tree.

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
// C4 keys on these import names (and C4_SHAPE on the type names):
import type { Actor, Authority } from "../../src/spine/pure/actor";
import { authority, Signature } from "../../src/spine/pure/actor";
// C7_LITERAL rides the `outcome` key of BOTH transport bases:
import type { CommandBase } from "../../src/spine/pure/command";
// C5 keys on these:
import type { EffectKey, KeyedEffect } from "../../src/spine/pure/keyed-effect";
import { keyedEffect, keyOf } from "../../src/spine/pure/keyed-effect";
// C6 keys on these:
import type {
  Degraded,
  Errored,
  RunStatusBase,
  RunStatusKind,
} from "../../src/spine/pure/run-status";
import { degraded, errored, idle, working } from "../../src/spine/pure/run-status";
// C4_SHAPE keys on these interface names:
import type { Perceived, Recalled, StagedInputBase } from "../../src/spine/pure/staged";
// C7_IMPORT keys on these:
import type { ToolResultBase } from "../../src/spine/pure/tool-result";
import { refused, unhandled } from "../../src/spine/pure/tool-result";
import type { Ctx } from "../../src/spine/pure/verb";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");

/** The type-level anchors, held in one place so the imports above are used.
 *  If any of these names is renamed or moved, `tsc` fails THIS file — loudly —
 *  instead of the rule that keys on it going quietly vacuous. */
type TypeAnchors = [
  Actor,
  Authority,
  Signature,
  CommandBase,
  EffectKey,
  KeyedEffect,
  RunStatusBase,
  RunStatusKind,
  Degraded,
  Errored,
  StagedInputBase,
  Perceived,
  Recalled,
  ToolResultBase,
  Ctx<unknown>,
];

describe("the gate's anchors hold", () => {
  it("every VALUE name a rule keys on is still exported where the rule expects it", () => {
    // C3/C4/C5/C6/C7 key on these by name; a rename must break here, not there.
    // `Signature` is in this VALUE list on purpose: C4's mint denial is a rule
    // about a VALUE BINDING, so it goes vacuous the moment `Signature` stops
    // being a value (revert it to an interface and no file can value-import
    // it, so the rule matches nothing — silently, forever). The forge probe
    // catches that too; this catches it in one line, here, where every other
    // anchor lives.
    for (const anchored of [
      authority,
      Signature,
      keyedEffect,
      keyOf,
      degraded,
      errored,
      working,
      unhandled,
      refused,
    ]) {
      expect(typeof anchored).toBe("function");
    }
    expect(idle.kind).toBe("Idle");
  });

  it("the `outcome` key C7's literal rule rides is still the key on BOTH transport bases", () => {
    // If this field is ever renamed, C7_LITERAL matches nothing and its own
    // fixtures (which spell the old key) stay green — the C7-derivation rot,
    // in eslint clothing. This pin makes the rename fail the build instead.
    const outcomeRidesBoth: keyof ToolResultBase & keyof CommandBase = "outcome";
    expect(outcomeRidesBoth).toBe("outcome");
    const anchors: TypeAnchors | null = null;
    expect(anchors).toBeNull();
  });

  it("the block rosters are pinned — the filenames the buckets scope by cannot drift silently", () => {
    // contract.ts, tools.ts, project.ts, port.ts, adapter.ts and view-state.ts
    // are SCOPES: C4 applies to contract.ts, the schema DSL is granted to
    // tools.ts, C11 to port.ts, C12 keys on view-state. A block file renamed
    // out of its bucket falls back to the generic rules and quietly sheds the
    // specific ones — this pin is what makes that a visible diff.
    const blocks: Record<string, readonly string[]> = {
      analysis: [
        "adapter.ts",
        "contract.ts",
        "fold.ts",
        "port.ts",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
      ],
      artifact: [
        "adapter.ts",
        "contract.ts",
        "fold.ts",
        "port.ts",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
      ],
      console: [
        "contract.ts",
        "fold.ts",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
        "view-state.ts",
      ],
      escalation: [
        "adapter.ts",
        "contract.ts",
        "fold.ts",
        "port.ts",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
      ],
      inbox: ["contract.ts", "fold.ts", "project.ts", "register.ts", "slice.ts", "tools.ts"],
      triage: ["contract.ts", "fold.ts", "project.ts", "register.ts", "slice.ts", "tools.ts"],
    };
    for (const [block, files] of Object.entries(blocks)) {
      expect(readdirSync(join(ROOT, "src", "blocks", block)).sort(), block).toEqual(files);
    }
  });
});
