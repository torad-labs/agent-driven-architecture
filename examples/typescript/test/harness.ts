// ── test/harness — the offline rig every test is built on ──────────────────
// A real Boundary, a real registry, a real InMemoryBus, a RecordingSink in
// front of the real effect sink, and a fake world behind it so a test can ask
// "did anything actually fire?" as well as "what descriptor crossed the seam?".

import type { Actor, Authority } from "../src/spine/pure/actor";
import { authority } from "../src/spine/pure/actor";
import type { Authorization } from "../src/spine/ports/authorization";
import { RecordingSink, movingClock } from "../src/spine/boundary/in-memory";
import type { State } from "../src/app/contract";
import { initialState } from "../src/app/contract";
import type { App, Ports } from "../src/app/wire";
import { effectSink, wireApp } from "../src/app/wire";

export interface World {
  readonly pages: string[];
  readonly deliveries: number[];
  readonly logs: string[];
  /** what the DEEP tier published, in order — the relay's write side (11.2) */
  readonly published: string[];
}

export function fakeWorld(): { world: World; ports: Ports } {
  const world: World = { pages: [], deliveries: [], logs: [], published: [] };
  return {
    world,
    ports: {
      oncall: { page: (ticket) => void world.pages.push(ticket) },
      delivery: { deliver: (lines) => void world.deliveries.push(lines.length) },
      relay: { publish: (_at, text) => void world.published.push(text) },
      log: (line) => void world.logs.push(line),
    },
  };
}

export const HOST = authority("host:marcos");
export const AGENT_RUN = authority("agent-run-7f");
export const POLICY_TIER = authority("policy-tier-v3");

/** An AuthorityResolver a test can move: the same Actor.Agent acting first as
 *  the run that raised a request, then as a policy tier that approves it. That
 *  is F3's unattended promotion, and it is only expressible because Authority
 *  and Actor are different types. */
export function switchableAuthz(start?: Partial<Record<Actor, Authority>>): {
  authz: Authorization<State>;
  actAs: (by: Actor, principal: Authority) => void;
} {
  let table: Record<Actor, Authority> = { Human: HOST, Agent: AGENT_RUN, ...start };
  return {
    authz: {
      authorityOf: (by) => table[by],
      mayConfirm: () => true,
    },
    actAs: (by, principal) => {
      table = { ...table, [by]: principal };
    },
  };
}

export interface Harness {
  readonly app: App;
  readonly sink: RecordingSink;
  readonly world: World;
  readonly actAs: (by: Actor, principal: Authority) => void;
}

export function harness(opts: { initial?: State; start?: number; step?: number } = {}): Harness {
  const { world, ports } = fakeWorld();
  const sink = new RecordingSink(effectSink(ports));
  const { authz, actAs } = switchableAuthz();
  const app = wireApp({
    clock: movingClock(opts.start ?? 1000, opts.step ?? 7),
    sink,
    authz,
    initial: opts.initial ?? initialState({ tickets: [{ id: "4118", body: "refund not received" }] }),
  });
  return { app, sink, world, actAs };
}

export function effectKinds(sink: RecordingSink): readonly string[] {
  return sink.performed.map((k) => k.effect.kind);
}
