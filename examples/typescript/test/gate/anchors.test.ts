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
import type { CommandBase, SealedCommand } from "../../src/spine/pure/command";
// C16 keys on the member `Attributed` must NOT publish, and the admission
// rule's own totality rides `EffectClass`:
import type { EffectBase, EffectClass } from "../../src/spine/pure/effect";
import { attributed } from "../../src/spine/pure/effect";
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
// C7_IMPORT keys on these, and C7_MINT/C7_LAUNDER on the two below them:
import type { SealedResult, ToolResultBase } from "../../src/spine/pure/tool-result";
import { refused, seal, TransportSeal, unhandled } from "../../src/spine/pure/tool-result";
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
  SealedResult,
  SealedCommand,
  Ctx<unknown>,
  EffectClass,
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
      // C7_MINT and C7_LAUNDER are rules about a VALUE BINDING, so they go
      // vacuous the moment either name stops being a value — turn `seal` into a
      // type-only helper or fold `TransportSeal` into an interface and no file
      // can value-import it, so both rules match nothing, silently, forever.
      // The seal probe catches the TYPE half; this catches the rule half.
      seal,
      TransportSeal,
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

  it("C16's anchor: `Attributed` publishes ONLY `admit` — the halves are #-private", () => {
    // C16 denies READING `emitted`. The wall underneath it is that there is no
    // `emitted` to read: `Attributed` holds both halves in `#`-private fields,
    // so every spelling of the read — dotted, computed, destructured, spread —
    // is a language-level error rather than a lint message. Widen the field back
    // into an ordinary public member and C16 becomes the only thing standing
    // there; this pin is what makes that widening a RED diff instead of a quiet
    // downgrade. (The same move `Signature` makes one seam over: the wrong thing
    // is unwritable rather than merely discouraged.)
    const one = attributed(
      { outcome: "ok", tool: "setPriority" } as unknown as ToolResultBase,
      { kind: "Diag", at: 1, effectClass: "Routine", note: "x" } as unknown as EffectBase,
    );
    // the public surface is exactly one method…
    expect(Object.getOwnPropertyNames(one)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(one) as object).sort()).toEqual([
      "admit",
      "constructor",
    ]);
    // …and no enumerable route reaches either half.
    expect(JSON.parse(JSON.stringify(one))).toEqual({});
    // the class marker every effect leaf must answer is still on the BASE, so
    // the admission rule's totality is the compiler's and not a convention.
    const classRidesTheBase: keyof EffectBase = "effectClass";
    expect(classRidesTheBase).toBe("effectClass");
  });

  it("the block rosters are pinned — the filenames the buckets scope by cannot drift silently", () => {
    // contract.ts, tools.ts, project.ts, port.ts, adapter/ and view-state.ts
    // are SCOPES: C4 applies to contract.ts, the schema DSL is granted to
    // tools.ts, C11 to port.ts, C12 keys on view-state, and the client-library
    // grant is scoped to the `adapter/` FOLDER now that the leaf is its own
    // build unit. A block file renamed
    // out of its bucket falls back to the generic rules and quietly sheds the
    // specific ones — this pin is what makes that a visible diff.
    //
    // THREE NON-SOURCE ENTRY CLASSES PER BLOCK SINCE THE WORKSPACE WALL, and
    // this readdir has no extension filter on purpose, so each one had to be
    // added here deliberately rather than slipping in:
    //   · package.json  — the block IS a package now; its `exports` map is what
    //     makes every file below unreachable by a bare specifier.
    //   · adapter/      — the block's SECOND build unit, a directory rather than
    //     a file since the unit split. It is in this roster because a block that
    //     lost its leaf would otherwise be a shorter list nobody reads.
    //   · tsconfig.json — the wall itself: `composite` roots the project at this
    //     folder, so a reach into a sibling is a resolution error.
    //   · <block>.test.ts, in the four blocks that have an isolation test — the
    //     test co-locates, which is what makes the block's internals visible to
    //     it and to nothing outside the folder. `*.test.ts` is a SCOPE too: it
    //     has its own bucket, so a test renamed out of it would land on the
    //     shipped-code rules and go red rather than quietly relax them.
    const blocks: Record<string, readonly string[]> = {
      analysis: [
        "adapter",
        "contract.ts",
        "fold.ts",
        "package.json",
        "port.ts",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
        "tsconfig.json",
      ],
      artifact: [
        "adapter",
        "artifact.test.ts",
        "contract.ts",
        "fold.ts",
        "package.json",
        "port.ts",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
        "tsconfig.json",
      ],
      console: [
        "adapter",
        "console.test.ts",
        "contract.ts",
        "fold.ts",
        "package.json",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
        "tsconfig.json",
        "view-state.ts",
      ],
      escalation: [
        "adapter",
        "contract.ts",
        "escalation.test.ts",
        "fold.ts",
        "package.json",
        "port.ts",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
        "tsconfig.json",
      ],
      inbox: [
        "adapter",
        "contract.ts",
        "fold.ts",
        "package.json",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
        "tsconfig.json",
      ],
      triage: [
        "adapter",
        "contract.ts",
        "fold.ts",
        "package.json",
        "project.ts",
        "register.ts",
        "slice.ts",
        "tools.ts",
        "triage.test.ts",
        "tsconfig.json",
      ],
    };
    // THE LEAF'S OWN ROSTER, pinned in the same breath and for the same reason.
    // `adapter` above is a DIRECTORY entry, so the roster next door would
    // otherwise say nothing about what is inside it — and what is inside it is
    // the difference between a declared-empty leaf and a live one. Both shapes
    // are named, so a leaf that grew a file, or one that lost its wall, is a
    // visible diff. The three IO-less blocks ship the pair anyway: §4.6's
    // pair is unconditional, and the leaf that holds nothing still declares.
    const leaves: Record<string, readonly string[]> = {
      analysis: ["adapter.ts", "package.json", "tsconfig.json"],
      artifact: ["adapter.ts", "package.json", "tsconfig.json"],
      console: ["package.json", "tsconfig.json"],
      escalation: ["adapter.ts", "package.json", "tsconfig.json"],
      inbox: ["package.json", "tsconfig.json"],
      triage: ["package.json", "tsconfig.json"],
    };
    for (const [block, files] of Object.entries(leaves)) {
      expect(
        readdirSync(join(ROOT, "src", "blocks", block, "adapter")).sort(),
        `${block}/adapter`,
      ).toEqual(files);
    }
    for (const [block, files] of Object.entries(blocks)) {
      expect(readdirSync(join(ROOT, "src", "blocks", block)).sort(), block).toEqual(files);
    }
  });
});
