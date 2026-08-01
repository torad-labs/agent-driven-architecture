// ── app/wire — the SINGLE composition root (G7) ────────────────────────
// Exactly one file may know what is real and what is faked in a build. Removing
// it means a service locator, which G7 forbids.
//
// Plugging a block in is: its `register(...)` line here, its `handlers(...)`
// contribution to the dispatcher below, its slice field in app/contract, its
// three union memberships there, and its branch in each of app/assemble's three
// dispatchers. Pulling it out is the same list, subtracted, plus
// `rm -rf src/blocks/<X>/`. Every one of those is an APPEND to a closed set, and
// the compiler names each one you forget.
//
// THE HANDLER SPLIT: a NEW EFFECT KIND appended to a block's EXISTING effect
// union is not on that list any more. It costs its case in the owning block's
// contract and its handler in that block's registration — both inside the
// folder — and NOTHING here. A block growing its FIRST effect kind is the one
// exception: it also costs one compiler-named line in this file's dispatcher
// assembly, exactly the "handful of appends, every one compiler-named" headline
// the decisions record ratifies for the blast-radius table (docs/DECISIONS.md:125;
// review proved the universal zero with the console case). This
// file names exactly one effect kind, `Diag`, which is the spine's own and
// stays the root's to perform.
//
// RECEIPT, 2026-07-30, addressed to the blast-radius table the decisions record
// schedules for the book (theme 5). THREE PROSE SITES now state something this
// file has made false, and all three are that later entry's to rewrite, not this
// one's — a code landing does not edit the book ahead of its own phase:
//
//   · wiki §6.8, the "ADDING A TOOL IS A BOUNDED CHANGE" note — "the one listed
//     exception: a verb introducing a novel effect kind adds … one branch in the
//     composition root's effect sink … the only out-of-folder append in the system"
//   · wiki §16, the same claim restated, cross-referencing §6.8
//   · ADR-001 §1.3 Q1, the parenthetical "the one exception the book now lists
//     itself: a novel effect kind adds a compiler-named branch in the root's sink"
//
// THE MEASURED REPLACEMENT, stated as the set the real compiler names rather
// than as a bare zero. Appending a novel kind to an existing block's effect
// union costs, in this port:
//
//   · src/blocks/<owner>/contract.ts   the case          (in folder)
//   · src/blocks/<owner>/register.ts   the handler arm   (in folder, compiler-named)
//   · test/app/totality.test.ts        the GATE's own totality ledger,
//     `EXPECTED_EFFECTS` — out of folder, and maintained per effect case EXACTLY
//     as the pre-existing verb half already is: `Record<OkResult["tool"], true>`
//     sits in that same file, twelve entries, and pre-dates this landing, so a
//     new VERB has always cost that same out-of-folder edit.
//   · test/gate/fixtures/novel-effect-kind/patch.json, when the union line it
//     quotes is the one that changed — a hard, visible failure rather than a
//     silent one.
//
// So: out-of-folder PRODUCTION sites (anything under `src/`) = 0 for kinds on
// an existing union (a FIRST kind adds one dispatcher-assembly line here), in BOTH ports,
// earned by the real compiler — not 0 sites overall. The pin that keeps that
// honest rather than asserted is test/gate/exhaustiveness.test.ts, whose
// `novel-effect-kind` fixture compiles the gate's OWN program (`src` and `test`
// together) and asserts the out-of-folder error set as an EXACT equality; the
// Kotlin half is the test-tree census in its gate's GateTest.

import type { AnalysisRelay } from "@adr/block-analysis/register";
import { analysis } from "@adr/block-analysis/register";
import type { DeliveryPort } from "@adr/block-artifact/register";
import { artifact } from "@adr/block-artifact/register";
import { consoleBlock } from "@adr/block-console/register";
import type { OncallPort } from "@adr/block-escalation/register";
import { escalation } from "@adr/block-escalation/register";
import { inbox } from "@adr/block-inbox/register";
import { triage } from "@adr/block-triage/register";
import type { Action, Registry } from "@adr/spine/boundary/action";
import { registryOf } from "@adr/spine/boundary/action";
import { Boundary } from "@adr/spine/boundary/boundary";
import { handlerSink, InMemoryBus, sequentialIds } from "@adr/spine/boundary/in-memory";
import type { RelayRecall, TurnRunner } from "@adr/spine/concurrency/consumer";
import { SerialConsumer } from "@adr/spine/concurrency/consumer";
import type { Authorization } from "@adr/spine/ports/authorization";
import type { Bus } from "@adr/spine/ports/bus";
import type { Clock } from "@adr/spine/ports/clock";
import type { IdSource } from "@adr/spine/ports/id-source";
import type { Mailbox } from "@adr/spine/ports/mailbox";
import type { Scheduler } from "@adr/spine/ports/scheduler";
import type { Sink } from "@adr/spine/ports/sink";
import type { Actor, Authority } from "@adr/spine/pure/actor";
import { authority } from "@adr/spine/pure/actor";
import type { Diag, EffectHandler, Handlers, Licences } from "@adr/spine/pure/effect";
import { licencesOf } from "@adr/spine/pure/effect";
import type { Emit } from "@adr/spine/pure/emit";
import type { SessionId } from "@adr/spine/pure/ids";
import type { DrainMessage, InputPolicy } from "@adr/spine/pure/mailbox";
import type { ConsumerEvent } from "@adr/spine/pure/turn";
import type { BlockRegistration } from "@adr/spine/pure/verb";
import { committedSourceKeys } from "@adr/spine/replay/replay";
import { Controller } from "@adr/spine/surface/controller";
import { liveRelay } from "../blocks/analysis/adapter";
import { liveDelivery } from "../blocks/artifact/adapter";
import { livePager } from "../blocks/escalation/adapter";
import { dispatchers, project } from "./assemble";
import type { AppView, Effect, State } from "./contract";
import { initialState } from "./contract";

// ── The effect DISPATCHER: assembled here, registered by the blocks ────────
// The root's job at this seam is now assembly and binding, not branching. Each
// effect-bearing block contributes a `Handlers<XEffect>` table keyed on its own
// union's discriminant; this file spreads them into one `Handlers<Effect>` and
// adds the spine's own `Diag`.
//
// FOUR BLOCKS OF SIX contribute, and the count is a measurement rather than a
// preference — the same call `spine/pure/block` makes about `contextLines` (5/6)
// and `register` (5/6). `console` and `inbox` declare no effect cases at all, so
// a table from either would be `{}`; asking them for one would make two blocks
// pretend to a role they do not have. A block grows a handler the moment it
// grows an effect, and not before, because that is when its `Handlers<XEffect>`
// stops being satisfiable by an empty object.
//
// TOTALITY IS THE ANNOTATION. `Handlers<Effect>` is a mapped type over the
// union's own discriminant, so a kind with no handler is a compile error, here,
// before any test runs. It is checked against each block function's DECLARED
// return type, which is what keeps a NEW KIND'S error inside the block folder.
// The runtime floor in `performEffect` covers what the annotation cannot: a
// table thinned after assembly. C13's handler half watches both.
//
// REPLAY touches nothing (G9). RECOVERY re-drives; the deduping sink in front
// of it drops anything already acknowledged, keyed on the committed step index.

export interface Ports {
  readonly oncall: OncallPort;
  readonly delivery: DeliveryPort;
  /** the tier relay's WRITE half — the deep tier's only route to a peer (11.2) */
  readonly relay: AnalysisRelay;
  readonly log: (line: string) => void;
}

/** THE SPINE-OWNED `Diag` HANDLER, and the decision keeps it AT THE ROOT:
 *  `Diag` is the only effect case the spine declares for itself, no block owns it,
 *  and performing it is the root's business exactly as performing a domain effect
 *  is the owning block's. It doubles as the floor `performEffect` diagnoses an
 *  orphaned kind through, so "never silent" and "the root performs Diag" are one
 *  binding rather than two that could drift apart. */
function diagHandler(log: Emit): EffectHandler<Diag> {
  return (effect) => log(`[diag @${effect.at}] ${effect.note}`);
}

/** THE DISPATCHER ASSEMBLY. Exported because it is the thing under test: C13's
 *  handler half runs the SAME table the app runs, once whole and once
 *  deliberately thinned. */
export function effectHandlers(ports: Ports): Handlers<Effect> {
  return {
    ...triage.handlers(ports.log),
    ...escalation.handlers(ports.oncall),
    ...artifact.handlers(ports.delivery),
    ...analysis.handlers(ports.relay),
    Diag: diagHandler(ports.log),
  };
}

export function effectSink(ports: Ports): Sink {
  return handlerSink(effectHandlers(ports), diagHandler(ports.log));
}

// ── Authorization: the PRODUCT-OWNED seam (14.3, G6) ───────────────────────
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
  /** THE REDUCER VERSION (14.1) — what a snapshot's tag is checked against.
   *  App-owned for the same reason `promptVersion` is: the spine is generic in
   *  its State and cannot know which fold it was handed, so the only place that
   *  can name the reducer is the root that assembled it. It is its OWN number,
   *  never the record envelope's `SCHEMA_VERSION` (`spine/pure/step-record`) and
   *  never the spine's version marker `SPINE_VERSION` (`spine/pure/version`,
   *  which says which copy of the vendored template this tree is) — three
   *  independent questions, three independent answers, and the ratified record
   *  refuses to merge any two of them. Bump it when a fold arm changes what it
   *  derives, and every snapshot taken under the old one is refused instead of
   *  trusted. */
  readonly reducerVersion?: string;
  readonly initial?: State;
}

export interface App {
  readonly boundary: Boundary<State>;
  readonly controller: Controller<State, AppView>;
  readonly registry: Registry<State>;
  /** The admission licences, DERIVED from the same registry the gate reads
   *  (docs/DECISIONS.md:85). Published for the one reason `reducerVersion` is: a
   *  replay site that re-derived them from its own table would be witnessing its
   *  own copy, and the point of the rule is that the live path and every
   *  re-derivation read ONE fact. */
  readonly licences: Licences;
  readonly bus: Bus;
  readonly dispatchers: typeof dispatchers;
  readonly initial: State;
  /** Published so a resume site READS the root's version instead of minting its
   *  own — the same reason the harness reads the shipped authority table rather
   *  than re-spelling it. A copy corrupted here would leave every reader green. */
  readonly reducerVersion: string;
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
  // ONE registration line per block. This is the plug (G11).
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
    licences: licencesOf(registry.values()),
    bus,
    dispatchers,
    initial,
    reducerVersion: env.reducerVersion ?? "fold-v1",
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
// Two mappings live here and only here, and both are G11-forced: the spine's
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
