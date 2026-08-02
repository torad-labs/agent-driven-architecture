// ── app/wire — the SINGLE composition root ────────────────────────────────
// Exactly one file knows what is real and what is faked. One registration line
// per block, one handler contribution per block, one effect sink, one boundary.

import { notes } from "@adr/block-notes/register";
import type { Registry } from "@adr/spine/boundary/action";
import { registryOf } from "@adr/spine/boundary/action";
import { Boundary } from "@adr/spine/boundary/boundary";
import { handlerSink, InMemoryBus, sequentialIds } from "@adr/spine/boundary/in-memory";
import type { Bus } from "@adr/spine/ports/bus";
import type { Clock } from "@adr/spine/ports/clock";
import type { Sink } from "@adr/spine/ports/sink";
import type { Actor, Authority } from "@adr/spine/pure/actor";
import { authority } from "@adr/spine/pure/actor";
import type { Diag, EffectHandler, Handlers, Licences } from "@adr/spine/pure/effect";
import { licencesOf } from "@adr/spine/pure/effect";
import type { SessionId } from "@adr/spine/pure/ids";
import { Controller } from "@adr/spine/surface/controller";
import { dispatchers, project } from "./assemble";
import type { AppView, Effect, State } from "./contract";
import { initialState } from "./contract";

function diagHandler(log: (line: string) => void): EffectHandler<Diag> {
  return (effect) => log(`[diag @${effect.at}] ${effect.note}`);
}

/** TOTALITY IS THE ANNOTATION: `Handlers<Effect>` is a mapped type over the
 *  union's discriminant, so an effect kind with no handler is a compile error
 *  here, before any test runs. */
export function effectSink(log: (line: string) => void): Sink {
  const handlers: Handlers<Effect> = { ...notes.handlers(log), Diag: diagHandler(log) };
  return handlerSink(handlers, diagHandler(log));
}

export const defaultAuthorities: Readonly<Record<Actor, Authority>> = {
  Human: authority("host:operator"),
  Agent: authority("agent-run-1"),
  Spine: authority("spine:consumer"),
};

export interface Env {
  readonly clock: Clock;
  readonly sink: Sink;
  readonly bus?: Bus;
  readonly session?: SessionId;
}

export interface App {
  readonly boundary: Boundary<State>;
  readonly controller: Controller<State, AppView>;
  readonly registry: Registry<State>;
  readonly licences: Licences;
  readonly bus: Bus;
  readonly dispatchers: typeof dispatchers;
  readonly initial: State;
  readonly reducerVersion: string;
}

export function wireApp(env: Env): App {
  const registry = registryOf<State>(notes.register<State>().verbs);
  const bus = env.bus ?? new InMemoryBus();
  const initial = initialState();
  const boundary = new Boundary<State>(
    {
      clock: env.clock,
      ids: sequentialIds("cmd"),
      bus,
      sink: env.sink,
      authz: {
        authorityOf: (by: Actor, _session: SessionId): Authority => defaultAuthorities[by],
        mayConfirm: () => true,
      },
      registry,
      session: env.session ?? "session-1",
      promptVersion: "prompt-v1",
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
    /** THE REDUCER VERSION — app-owned, and NOT the envelope's SCHEMA_VERSION
     *  and NOT the spine's SPINE_VERSION. Three questions, three answers. */
    reducerVersion: "fold-v1",
  };
}
