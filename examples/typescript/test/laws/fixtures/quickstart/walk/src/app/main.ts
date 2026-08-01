// ── app/main — the entry point, and the only file that touches the console ──
// Four beats: wire it, act on it, re-fold the committed bytes, compare.

import { movingClock, RecordingSink } from "@adr/spine/boundary/in-memory";
import { refold } from "@adr/spine/replay/replay";
import { project } from "./assemble";
import { effectSink, wireApp } from "./wire";

const said: string[] = [];
const say = (line: string): void => {
  said.push(line);
};

const performed = new RecordingSink(effectSink(say));
const app = wireApp({ clock: movingClock(1000, 10), sink: performed });

// A HUMAN action and an AGENT action are the same signed Command on one stream.
app.controller.onAction({ tool: "addNote", input: { text: "the refund never arrived" } });
// The CHANNEL decides the actor — the step carries no `by` field to forge.
app.boundary.agent.submit({
  staged: [],
  actions: [{ tool: "addNote", input: { text: "escalated to on-call" } }],
});

// THE REPLAY: re-fold ONLY the committed bytes and compare with the live run.
const replayed = refold(app.initial, app.bus.records(), app.dispatchers, app.licences);
const same =
  JSON.stringify(replayed.state) === JSON.stringify(app.boundary.state) &&
  JSON.stringify(replayed.effects) === JSON.stringify(performed.performed);

say(`[state]   ${project(app.boundary.state).notes.count} note(s) folded`);
say(`[bus]     ${app.bus.records().length} committed step(s)`);
say(`[replay]  state and full effect sequence re-derived from the bus: ${same}`);

for (const line of said) process.stdout.write(`${line}\n`);
