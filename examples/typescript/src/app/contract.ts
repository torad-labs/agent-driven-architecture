// ── app/contract — THE ROOT: the only place that names every block (G10) ────
// The spine may not name a block and a block may not name a sibling (both L1),
// so the closed unions have exactly one legal home: here.
//
// Kotlin closes these hierarchies for itself — a sealed interface knows its own
// subtypes. TypeScript has to write the union out, and that is the whole of the
// TS/Kotlin delta in blast radius (§11.4): three extra appends in this file per
// new block. The guarantee is identical; the ceremony is not.

import type {
  AnalysisCommand,
  AnalysisEffect,
  AnalysisResult,
  AnalysisSlice,
  AnalysisView,
} from "../blocks/analysis/register";
import { analysis } from "../blocks/analysis/register";
import type {
  ArtifactCommand,
  ArtifactEffect,
  ArtifactResult,
  ArtifactSlice,
  ArtifactView,
} from "../blocks/artifact/register";
import { artifact } from "../blocks/artifact/register";
import type {
  ConsoleCommand,
  ConsoleResult,
  ConsoleSlice,
  ConsoleView,
} from "../blocks/console/register";
import { consoleBlock } from "../blocks/console/register";
import type {
  EscalationCommand,
  EscalationEffect,
  EscalationResult,
  EscalationSlice,
  EscalationView,
} from "../blocks/escalation/register";
import { escalation } from "../blocks/escalation/register";
import type { InboxCommand, InboxResult, InboxSlice, InboxView } from "../blocks/inbox/register";
import { inbox } from "../blocks/inbox/register";
import type {
  Priority,
  Ticket,
  TriageCommand,
  TriageEffect,
  TriageResult,
  TriageSlice,
  TriageView,
} from "../blocks/triage/register";
import { triage } from "../blocks/triage/register";
import type { SpineCommand } from "../spine/pure/command";
import type { SpineEffect } from "../spine/pure/effect";
import type { SpineSlice } from "../spine/pure/spine-slice";
import { emptySpineSlice } from "../spine/pure/spine-slice";
import type { SpineResult } from "../spine/pure/tool-result";
import type { ViewModel } from "../spine/pure/view";

// ── The three closed sets ───────────────────────────────────────────────────

export type ToolResult =
  | SpineResult
  | TriageResult
  | EscalationResult
  | ConsoleResult
  | ArtifactResult
  | AnalysisResult
  | InboxResult;

export type Command =
  | SpineCommand
  | TriageCommand
  | EscalationCommand
  | ConsoleCommand
  | ArtifactCommand
  | AnalysisCommand
  | InboxCommand;

export type Effect =
  | SpineEffect
  | TriageEffect
  | EscalationEffect
  | ArtifactEffect
  | AnalysisEffect;

/** Everything a block's arm may be handed. The spine's own two cases are folded
 *  by the spine's own arm, so they are excluded here. */
export type OkResult = Extract<ToolResult, { readonly outcome: "ok" }>;

// ── State: a PRODUCT of slices, one per block ───────────────────────────────
// State has exactly one shape, so it is a product, not a sum. Every closed set
// INSIDE it — TicketStatus, SealStatus, RunStatus, Notice — is sealed.

export interface State {
  readonly spine: SpineSlice;
  readonly triage: TriageSlice;
  readonly escalation: EscalationSlice;
  readonly console: ConsoleSlice;
  readonly artifact: ArtifactSlice;
  readonly analysis: AnalysisSlice;
  readonly inbox: InboxSlice;
}

export interface AppView extends ViewModel {
  readonly triage: TriageView;
  readonly escalation: EscalationView;
  readonly console: ConsoleView;
  readonly artifact: ArtifactView;
  readonly analysis: AnalysisView;
  readonly inbox: InboxView;
}

export interface Seed {
  readonly tickets: readonly Ticket[];
  readonly priority?: Priority;
  readonly panels?: readonly string[];
}

export function initialState(seed: Seed = { tickets: [] }): State {
  return {
    spine: emptySpineSlice,
    triage: triage.sliceOf(seed.tickets, seed.priority ?? "Normal"),
    escalation: escalation.sliceOf(seed.tickets.map((t) => t.id)),
    console: consoleBlock.sliceOf(seed.panels ?? ["escalation", "findings"]),
    artifact: artifact.emptySlice,
    analysis: analysis.emptySlice,
    inbox: inbox.emptySlice,
  };
}
