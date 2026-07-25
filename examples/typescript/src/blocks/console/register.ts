// ── blocks/console/register — THE ONE PUBLIC SYMBOL (L1, I7) ───────────────
// Identical in shape to `blocks/triage/register.ts`. A reader comparing the two
// sees A1's whole point: there is one kind of block.

import type { BlockRegistration } from "../../spine/pure/verb";
import { isConsoleResult } from "./contract";
import { consoleArm } from "./fold";
import { consoleContextLines, consoleView } from "./project";
import { consoleSliceOf, emptyConsoleSlice } from "./slice";
import { consoleVerbs } from "./tools";

export const consoleBlock = {
  name: "console",
  register: <S>(): BlockRegistration<S> => ({ block: "console", verbs: consoleVerbs<S>() }),
  arm: consoleArm,
  view: consoleView,
  contextLines: consoleContextLines,
  owns: isConsoleResult,
  emptySlice: emptyConsoleSlice,
  sliceOf: consoleSliceOf,
} as const;

export type { ConsoleCommand, ConsoleResult } from "./contract";
export type { ConsoleSlice } from "./slice";
export type { ConsoleView, PanelRow } from "./project";
// `view-state` is NOT re-exported. Nothing outside this block — not even the
// composition root — has a path to the ephemeral type (check C12).
