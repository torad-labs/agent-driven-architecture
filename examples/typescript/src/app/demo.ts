// ── app/demo — a runnable, offline end-to-end script (`npm run demo`) ──────
// No API keys, no network: a scripted model drives the real agent loop, the
// real boundary folds each step, the real gate holds, and the real replay
// harness re-derives the session from committed bytes alone.

import { runTurn } from "@adr/spine/agent/loop";
import { movingClock, RecordingSink } from "@adr/spine/boundary/in-memory";
import type { TurnContext } from "@adr/spine/concurrency/consumer";
import { InMemoryMailbox, InMemoryRelay, virtualScheduler } from "@adr/spine/concurrency/in-memory";
import { authority } from "@adr/spine/pure/actor";
import { input, interrupt, isInput } from "@adr/spine/pure/mailbox";
import { perceived } from "@adr/spine/pure/staged";
import { refold } from "@adr/spine/replay/replay";
import { MockLanguageModelV3 } from "ai/test";
import { liveRelay } from "../blocks/analysis/adapter/adapter";
import { project } from "./assemble";
import { initialState } from "./contract";
import type { Narrator } from "./narrator";
import {
  authorization,
  DEEP_TIER,
  defaultAuthorities,
  effectSink,
  FAST_TIER,
  offlinePorts,
  wireApp,
  wireConsumer,
} from "./wire";

/** drain the microtasks the consumer chained — nothing sleeps in this demo */
function settle(): Promise<void> {
  return new Promise<void>((resolve) => void setImmediate(resolve));
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function scriptedModel(): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      call += 1;
      if (call === 1) {
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "t1",
              toolName: "setPriority",
              input: JSON.stringify({ ticket: "4118", level: "High" }),
            },
            {
              // 6.8: a presentation verb travels the SAME path as a domain verb.
              type: "tool-call" as const,
              toolCallId: "t2",
              toolName: "setPanel",
              input: JSON.stringify({ panel: "escalation", visible: true }),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
          warnings: [],
        };
      }
      return {
        content: [
          { type: "text" as const, text: "Raised #4118 to High and opened the escalation panel." },
        ],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

export async function main(out: Narrator): Promise<void> {
  const performed = new RecordingSink(effectSink(offlinePorts((line) => out.say(line))));
  const app = wireApp({
    clock: movingClock(1000, 7),
    sink: performed,
    initial: initialState({ tickets: [{ id: "4118", body: "refund not received" }] }),
    authz: authorization({
      authorities: {
        Human: authority("host:marcos"),
        Agent: authority("agent-run-7f"),
        // DERIVED, not copied: `spine:consumer` has exactly one production
        // literal (wire.ts's `defaultAuthorities`), so a typo there is red
        // everywhere rather than only where a test happens to read it. `Human`
        // and `Agent` keep their literals — the demo teaches `host:marcos`,
        // which is NOT `defaultAuthorities.Human`.
        Spine: defaultAuthorities.Spine,
      },
    }),
  });

  // 1) An agent turn, scripted offline. The loop forwards ACTIONS; the boundary
  //    resolves them through the one name→ToolResult map and folds the result.
  const turn = await runTurn({
    model: scriptedModel(),
    prompt: "ticket 4118 looks urgent",
    boundary: app.boundary,
    registry: app.registry,
    dispatchers: app.dispatchers,
  });
  out.say(`\n[agent] ran ${turn.steps} steps, said: "${turn.text}"`);
  out.say("[state] triage:", project(app.boundary.state).triage.rows[0]);
  out.say("[state] panels:", project(app.boundary.state).console.panels);

  // 2) The agent requests escalation — reversible, so nothing pages.
  app.boundary.agent.submit({
    staged: [],
    actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
  });

  // 3) The AGENT tries to confirm its own request. Same Actor, and — the part
  //    that matters — the SAME AUTHORITY that raised the request. REFUSED at
  //    the boundary, before the fold, and the refusal is committed.
  app.boundary.agent.submit({
    staged: [],
    actions: [{ tool: "confirmEscalation", input: { ticket: "4118" } }],
  });
  out.say("\n[gate] agent self-confirm →", app.bus.records().at(-1)?.results.at(-1));

  // 4) The HOST confirms: a different principal. Granted; on-call is paged once.
  app.controller.onAction({ tool: "confirmEscalation", input: { ticket: "4118" } });
  out.say("[gate] host confirm     →", app.bus.records().at(-1)?.results.at(-1));

  // 5) The work product: folded lines, then ONE gated delivery at seal time.
  app.boundary.agent.submit({
    staged: [perceived("inbox", "customer says the refund never arrived", "inbox-1")],
    actions: [
      { tool: "recordFinding", input: { text: "customer reports a missing refund" } },
      { tool: "recordFinding", input: { text: "escalated to on-call" } },
      { tool: "requestSeal", input: {} },
    ],
  });
  app.controller.onAction({ tool: "confirmSeal", input: {} });

  // 6) Replay: re-fold ONLY the committed bytes and compare against the live run.
  const replayed = refold(app.initial, app.bus.records(), app.dispatchers, app.licences);
  const same =
    JSON.stringify(replayed.state) === JSON.stringify(app.boundary.state) &&
    JSON.stringify(replayed.effects) === JSON.stringify(performed.performed);
  out.say(
    "\n[effects] ",
    performed.performed.map((k) => `${k.key.step}:${k.key.index} ${k.effect.kind}`).join(" · "),
  );
  out.say("[replay]  state and full effect sequence re-derived from the bus:", same);
  out.say("[banner]  ", project(app.boundary.state).banner);
  out.say("[notices] ", project(app.boundary.state).notices);

  await tieringAndBargeIn(out);
}

// ── The two advanced rungs, run end to end (11 and 12) ─────────────────────
// Both are OPTIONAL, and this is what optional looks like: a separate wiring,
// two extra registration lists, and nothing above this line had to change.

async function tieringAndBargeIn(out: Narrator): Promise<void> {
  // ── 11 · TIERING. Two units of work, two buses, two clocks, ONE relay, and
  //    no handle between them. The deep tier publishes; the fast tier recalls.
  const store = new InMemoryRelay();
  const deep = wireApp({
    clock: movingClock(500, 5),
    sink: effectSink(
      offlinePorts(
        () => undefined,
        liveRelay((at, text) => store.publish(at, text)),
      ),
    ),
    session: "deep-1",
    verbs: DEEP_TIER,
  });
  deep.boundary.agent.submit({
    staged: [],
    actions: [{ tool: "publishAnalysis", input: { text: "root cause: expired card token" } }],
  });
  out.say("\n[tier]     deep tier published:", store.published);

  const fastSink = new RecordingSink(effectSink(offlinePorts(() => undefined)));
  const fast = wireApp({
    clock: movingClock(1000, 7),
    sink: fastSink,
    session: "fast-1",
    verbs: FAST_TIER,
    initial: initialState({ tickets: [{ id: "4118", body: "refund not received" }] }),
  });

  // ── 12 · BARGE-IN. The consumer SELECTS over { next message, running turn },
  //    so a message is observable WHILE a turn runs. Time is virtual: the long
  //    turn below would not finish until t=10 000, and nothing here sleeps.
  const mailbox = new InMemoryMailbox();
  const sched = virtualScheduler();
  const startedAt = new Map<string, number>();
  const consumer = wireConsumer(fast, {
    mailbox,
    scheduler: sched,
    relay: { read: store, source: "analysis" },
    turn: {
      run: async (message, ctx: TurnContext): Promise<void> => {
        startedAt.set(message.kind, sched.now());
        if (isInput(message)) {
          ctx.submit({
            staged: ctx.staged,
            actions: [
              { tool: "recallAnalysis", input: {} },
              { tool: "recordFinding", input: { text: message.staged.body } },
            ],
          });
          await sched.after(10_000, ctx.signal); // a LONG turn
          return;
        }
        ctx.submit({
          staged: ctx.staged,
          actions: [{ tool: "setPanel", input: { panel: "escalation", visible: true } }],
        });
      },
    },
  });
  void consumer.run();

  mailbox.post(input("tickets", perceived("tickets", "customer reports a failed charge", "t1")));
  await settle();
  out.say("[tier]     fast tier recalled:", fast.boundary.state.analysis.notes.at(-1)?.recall);

  sched.advance(100);
  await settle();
  mailbox.post(interrupt("operator", "the customer is on the phone"));
  await settle();

  out.say(
    `[barge-in] long turn started at t=${startedAt.get("Input")}, would finish at t=10000; ` +
      `interrupt handled at t=${startedAt.get("Interrupt")}`,
  );
  out.say(
    "[barge-in] committed:",
    fast.bus.records().flatMap((r) => r.commands.map((c) => c.tool)),
  );
  out.say(
    "[barge-in] cancelled turn's steps are still folded:",
    fast.boundary.state.artifact.lines.length,
    "line(s)\n",
  );
}

export { main as runDemo };
