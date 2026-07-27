// ── app/wire — the SINGLE composition root (G7) ────────────────────────
// Exactly one file may know what is real and what is faked in a build. Removing
// it means a service locator, which G7 forbids.
//
// Plugging a block in is: its `register(...)` line here, its slice field in
// app/contract, its three union memberships there, and its branch in each of
// app/assemble's three dispatchers. Pulling it out is the same list, subtracted,
// plus `rm -rf src/blocks/<X>/`. Every one of those is an APPEND to a closed
// set, and the compiler names each one you forget.

import { liveRelay } from "../blocks/analysis/adapter";
import type { AnalysisRelay } from "../blocks/analysis/register";
import { analysis } from "../blocks/analysis/register";
import { liveDelivery } from "../blocks/artifact/adapter";
import type { DeliveryPort } from "../blocks/artifact/register";
import { artifact } from "../blocks/artifact/register";
import { consoleBlock } from "../blocks/console/register";
import { livePager } from "../blocks/escalation/adapter";
import type { OncallPort } from "../blocks/escalation/register";
import { escalation } from "../blocks/escalation/register";
import { inbox } from "../blocks/inbox/register";
import { triage } from "../blocks/triage/register";
import type { Action, Registry } from "../spine/boundary/action";
import { registryOf } from "../spine/boundary/action";
import { Boundary } from "../spine/boundary/boundary";
import { InMemoryBus, sequentialIds } from "../spine/boundary/in-memory";
import type { RelayRecall, TurnRunner } from "../spine/concurrency/consumer";
import { SerialConsumer } from "../spine/concurrency/consumer";
import type { Authorization } from "../spine/ports/authorization";
import type { Bus } from "../spine/ports/bus";
import type { Clock } from "../spine/ports/clock";
import type { IdSource } from "../spine/ports/id-source";
import type { Mailbox } from "../spine/ports/mailbox";
import type { Scheduler } from "../spine/ports/scheduler";
import type { PerformMode, Sink } from "../spine/ports/sink";
import type { Actor, Authority } from "../spine/pure/actor";
import { authority } from "../spine/pure/actor";
import type { Emit } from "../spine/pure/emit";
import type { SessionId } from "../spine/pure/ids";
import type { KeyedEffect } from "../spine/pure/keyed-effect";
import type { DrainMessage, InputPolicy } from "../spine/pure/mailbox";
import type { ConsumerEvent } from "../spine/pure/turn";
import type { BlockRegistration } from "../spine/pure/verb";
import { committedSourceKeys } from "../spine/replay/replay";
import { Controller } from "../spine/surface/controller";
import { dispatchers, project } from "./assemble";
import type { AppView, Effect, State } from "./contract";
import { initialState } from "./contract";

// ── The effect sink: one branch per Effect case, exhaustive ────────────────
// A new effect kind costs TWO appends: its case in the owning block's contract,
// and one branch here. The compiler names the second one.
//
// REPLAY touches nothing (F5). RECOVERY re-drives; the deduping sink in front
// of it drops anything already acknowledged, keyed on the committed step index.

export interface Ports {
  readonly oncall: OncallPort;
  readonly delivery: DeliveryPort;
  /** the tier relay's WRITE half — the deep tier's only route to a peer (11.2) */
  readonly relay: AnalysisRelay;
  readonly log: (line: string) => void;
}

export function effectSink(ports: Ports): Sink {
  return {
    perform(keyed: KeyedEffect<Effect>, mode: PerformMode): void {
      if (mode === "REPLAY") return; // collect the descriptor; touch NOTHING
      const effect = keyed.effect;
      switch (effect.kind) {
        case "Diag":
          ports.log(`[diag @${effect.at}] ${effect.note}`);
          return;
        case "LogDecision":
          ports.log(
            `[decision @${effect.at}] ${effect.ticket} → ${effect.level}` +
              (effect.supersedes === null ? "" : ` (was ${effect.supersedes})`),
          );
          return;
        case "PageOncall":
          ports.oncall.page(effect.ticket);
          return;
        case "DeliverArtifact":
          ports.delivery.deliver(effect.lines);
          return;
        case "PublishConclusion":
          // The deep tier's write, as an ordinary effect descriptor — so REPLAY
          // stubs it and RECOVERY dedupes it on `EffectKey`, for free.
          ports.relay.publish(effect.at, effect.text);
          return;
        default: {
          const _never: never = effect;
          return _never;
        }
      }
    },
  };
}

// ── Authorization: the PRODUCT-OWNED seam (14.3, F3, F13) ──────────────────
// A real deployment resolves a principal from a session token, a policy tier's
// identity, or an approval queue's record. Here it is a supplied table, so the
// unattended-confirmer cases are exercisable offline.

export interface AuthorizationConfig {
  /** the authority this stream is acting under, per Actor */
  readonly authorities: Readonly<Record<Actor, Authority>>;
  /** the product's own rule; default-allow once the gate's structural checks
   *  (a pending request exists, and it was raised by a DIFFERENT principal)
   *  have already passed.
   *
   *  Keyed on the AUTHORITY, never the Actor — §5.2's "preserved for audit,
   *  not for branching" applies to the composition root too. A default that
   *  branched on `sig.by` here would be the exact anti-pattern G6 forbids the
   *  gate, shipped as the line every adopter copies first: it makes "a policy
   *  tier may confirm, this run may not" unrepresentable, because both are
   *  truthfully `Agent`. The Kotlin port's `ConfirmingAuthorities` keys the
   *  same way. */
  readonly mayConfirm?: (by: Authority) => boolean;
}

export function authorization(config: AuthorizationConfig): Authorization<State> {
  return {
    authorityOf: (by: Actor, _session: SessionId): Authority => config.authorities[by],
    mayConfirm: (sig) => config.mayConfirm?.(sig.authority) ?? true,
  };
}

export const defaultAuthorities: Readonly<Record<Actor, Authority>> = {
  Human: authority("host:operator"),
  Agent: authority("agent-run-7f"),
  Spine: authority("spine:consumer"),
};

// ── The application ────────────────────────────────────────────────────────

export interface Env {
  readonly clock: Clock;
  /** 11.4's allowlist: WHICH blocks this stream is permitted to run. Omitted,
   *  an app gets every block — so an app that never tiers pays nothing. */
  readonly verbs?: readonly BlockRegistration<State>[];
  readonly ids?: IdSource;
  readonly bus?: Bus;
  readonly sink: Sink;
  readonly authz?: Authorization<State>;
  readonly session?: SessionId;
  readonly promptVersion?: string;
  readonly initial?: State;
}

export interface App {
  readonly boundary: Boundary<State>;
  readonly controller: Controller<State, AppView>;
  readonly registry: Registry<State>;
  readonly bus: Bus;
  readonly dispatchers: typeof dispatchers;
  readonly initial: State;
}

// ── 11.4 — the registry allowlist, declared once at the root ───────────────
// A second tier is OPTIONAL. These three lists are the only place in the system
// that says which agents are permitted to exist; the blocks themselves know
// nothing about tiers, and neither does the spine.

export const ALL_BLOCKS: readonly BlockRegistration<State>[] = [
  triage.register<State>(),
  escalation.register<State>((s) => s.escalation),
  consoleBlock.register<State>(),
  artifact.register<State>((s) => s.artifact),
  analysis.register<State>("both"),
  inbox.register<State>(),
];

/** the hot loop: it may RECALL a peer's conclusion, never publish one */
export const FAST_TIER: readonly BlockRegistration<State>[] = [
  triage.register<State>(),
  escalation.register<State>((s) => s.escalation),
  consoleBlock.register<State>(),
  artifact.register<State>((s) => s.artifact),
  analysis.register<State>("fast"),
  inbox.register<State>(),
];

/** the deep tier: it may PUBLISH, and it holds no handle to the fast tier */
export const DEEP_TIER: readonly BlockRegistration<State>[] = [
  analysis.register<State>("deep"),
  inbox.register<State>(),
];

export function wireApp(env: Env): App {
  // ONE registration line per block. This is the plug (L1).
  const registry = registryOf<State>((env.verbs ?? ALL_BLOCKS).flatMap((r) => r.verbs));

  const bus = env.bus ?? new InMemoryBus();
  const initial = env.initial ?? initialState();
  const boundary = new Boundary<State>(
    {
      clock: env.clock,
      ids: env.ids ?? sequentialIds("cmd"),
      bus,
      sink: env.sink,
      authz: env.authz ?? authorization({ authorities: defaultAuthorities }),
      registry,
      session: env.session ?? "session-1",
      promptVersion: env.promptVersion ?? "prompt-v1",
      fold: dispatchers.fold,
      projectContext: dispatchers.projectContext,
    },
    initial,
  );

  return {
    boundary,
    controller: new Controller<State, AppView>(boundary, project),
    registry,
    bus,
    dispatchers,
    initial,
  };
}

/** The offline bindings: no keys, no network, no clients. */
export function offlinePorts(log: Emit, relay?: AnalysisRelay): Ports {
  return {
    oncall: livePager(log),
    delivery: liveDelivery(log),
    relay: relay ?? liveRelay((at, text) => log(`[relay] conclusion published @${at}: ${text}`)),
    log,
  };
}

// ── The barge-in consumer (12) — wired ONLY when a mailbox is supplied ──────
// Two mappings live here and only here, and both are L1-forced: the spine's
// `ConsumerEvent` and the inbox block's `DropReason` are separate closed sets,
// so something has to join them, and the composition root is the one place
// allowed to name both. Same for a Drain's finalization, which is the artifact
// block's business and not the consumer's.

export interface ConsumerEnv {
  readonly mailbox: Mailbox;
  readonly scheduler: Scheduler;
  /** injected, never imported — `spine/concurrency` never names the SDK */
  readonly turn: TurnRunner;
  readonly policies?: readonly InputPolicy[];
  readonly relay?: RelayRecall;
  readonly cancelDeadlineMs?: number;
  readonly drainDeadlineMs?: number;
  readonly recallDeadlineMs?: number;
}

/** ConsumerEvent → Actions. Every branch produces a real verb, so every dropped
 *  input travels the ONE existing path: resolveAction → gate → fold → commit →
 *  signed Command. Nothing the consumer sheds is silent. */
export function reportActions(event: ConsumerEvent): readonly Action[] {
  switch (event.kind) {
    case "Conflated":
      return [
        {
          tool: "noteDrop",
          input: { reason: { kind: "Conflated", source: event.source, dropped: event.dropped } },
        },
      ];
    case "Duplicate":
      return [
        {
          tool: "noteDrop",
          input: { reason: { kind: "Duplicate", source: event.source, key: event.key } },
        },
      ];
    case "TurnFailed":
      return [{ tool: "noteFault", input: { source: event.source, fault: event.fault } }];
    case "CancelDeadlineExceeded":
      return [
        {
          tool: "noteFault",
          input: {
            source: event.source,
            fault: `cancel deadline exceeded after ${event.afterMs}ms — turn abandoned, its channel revoked`,
          },
        },
      ];
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

/** A Drain finalizes with the artifact block's seal REQUEST. It cannot confirm
 *  it — that needs a different principal, and the gate says so.
 *
 *  NAMED CONSEQUENCE of the spine stamp: the consumer signs its steps `Spine`, so
 *  this request is recorded under `spine:consumer` rather than `agent-run-7f`. The
 *  seal's `requestedBy` is now the spine, which makes the AGENT a legal confirmer
 *  of a drain-requested seal where it used to be the self-confirming requester the
 *  gate refused. `14.3 — the drain-requested seal and its confirmer` in
 *  test/spine/mailbox.test.ts pins that verdict, so a flip back is a red test
 *  rather than a discovery. */
export function finalizeActions(_message: DrainMessage): readonly Action[] {
  return [{ tool: "requestSeal", input: {} }];
}

export function wireConsumer(app: App, env: ConsumerEnv): SerialConsumer {
  return new SerialConsumer({
    mailbox: env.mailbox,
    scheduler: env.scheduler,
    seam: app.boundary,
    turn: env.turn,
    report: reportActions,
    finalize: finalizeActions,
    policies: env.policies,
    relay: env.relay,
    cancelDeadlineMs: env.cancelDeadlineMs,
    drainDeadlineMs: env.drainDeadlineMs,
    recallDeadlineMs: env.recallDeadlineMs,
    // Not opt-in: the dedupe scope is ALWAYS the timeline's. On a fresh bus
    // this is the empty set for free; after a crash it is what makes the
    // durable queue's redelivery refuse work that already committed (12.2).
    recovered: committedSourceKeys(app.bus.records()),
  });
}
