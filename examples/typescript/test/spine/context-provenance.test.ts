// ── SDK-21 / CONTEXT-PROVENANCE — the digest must be text the model RECEIVED ──
// spine/pure/context.ts:9 documents `render(context) -> Text` as "The exact text
// the model saw." Before this test existed, it was not: `render` had two
// production call sites — boundary.ts (which COMMITS the digest onto every
// StepRecord) and replay.ts (which re-derives it) — and `runTurn` sent the model
// `prompt` and nothing else. `projectContext` reached the model call only via
// `buildTools`, where it is handed to TOOL BODIES.
//
// So every committed record carried a provenance claim that was false, and the
// replay check verified a digest of text nobody read. G15's own justification is
// that "why did the agent decide this?" is unanswerable without the text the
// model actually read — which is precisely what that gap broke.
//
// WHY THE ASSERTION IS "RECEIVED", NOT "PROJECTED". The pre-existing tests in
// context.test.ts already prove the digest is re-derivable from committed State.
// That is a check of the PROJECTION against itself: both sides call
// `projectContext`, so they agree no matter what the model was sent. The only
// assertion that can catch this class is one whose right-hand side is captured
// from the MODEL CALL.
//
// WHY IT CAN BE AN EXACT EQUALITY. State is identical at the two points that
// must agree: `prepareStep(N)` runs before the step, and `boundary.submit(N)`
// projects from `this.current` and appends the record BEFORE adopting
// `folded.state` (boundary.ts step 7 precedes step 8). No fold lands between
// them, so the same projection is reproducible at both — and anything less than
// equality would let the two drift by exactly the amount this bug was.

import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { runTurn } from "../../src/spine/agent/loop";
import { perceived } from "../../src/spine/pure/staged";
import { harness } from "../harness";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** Everything the model was actually handed, flattened to text. The mock receives
 *  the provider-level prompt (an array of messages whose content is an array of
 *  parts), so the assertion reads the WIRE, not a convenience field the loop
 *  happened to populate.
 *
 *  IT JOINS TEXT PARTS RATHER THAN JSON.stringify-ing THE PROMPT, and that is not
 *  cosmetic: the rendered digest is newline-separated, and `JSON.stringify` emits
 *  those as the two characters backslash-n. A `toContain(digest)` against
 *  stringified JSON could therefore never match — the test would have been
 *  unfalsifiable-by-construction, red for a reason unrelated to the bug and
 *  incapable of ever going green. */
function textSentTo(prompt: unknown): string {
  if (!Array.isArray(prompt)) return "";
  return prompt
    .flatMap((message: { content?: unknown }) =>
      Array.isArray(message.content)
        ? message.content
            .filter((part: { type?: string }) => part.type === "text")
            .map((part: { text?: string }) => part.text ?? "")
        : typeof message.content === "string"
          ? [message.content]
          : [],
    )
    .join("\n");
}

function capturingModel(seen: string[]): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      seen.push(textSentTo(options.prompt));
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
          ],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
          warnings: [],
        };
      }
      return {
        content: [{ type: "text" as const, text: "done" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

describe("G15 — the committed digest is text the model RECEIVED", () => {
  it("sends the rendered context to the model, not only to the tool bodies", async () => {
    const h = harness();
    const seen: string[] = [];

    await runTurn({
      model: capturingModel(seen),
      prompt: "ticket 4118 looks urgent",
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      // A distinctive body: if this string reaches the model at all, it can only
      // have arrived through the projected context — nothing else carries it.
      staged: [perceived("inbox", "caller says the refund never arrived", "k1")],
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toContain("caller says the refund never arrived");
  });

  it("commits a digest EQUAL to what the first step sent — not merely re-derivable", async () => {
    const h = harness();
    const seen: string[] = [];

    await runTurn({
      model: capturingModel(seen),
      prompt: "ticket 4118 looks urgent",
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      staged: [perceived("inbox", "caller says the refund never arrived", "k1")],
    });

    const first = h.app.bus.records()[0];
    expect(first).toBeDefined();
    const digest = first?.context.digest ?? "";
    expect(digest).not.toBe("");

    // THE LOAD-BEARING LINE. The digest the record carries must appear verbatim
    // in what the model was handed for that step. A projection-vs-projection
    // check cannot fail here; only a received-vs-committed one can.
    expect(seen[0]).toContain(digest);
  });

  it("re-projects per step, so a later step's digest is also text that step sent", async () => {
    const h = harness();
    const seen: string[] = [];

    await runTurn({
      model: capturingModel(seen),
      prompt: "ticket 4118 looks urgent",
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      staged: [perceived("inbox", "caller says the refund never arrived", "k1")],
    });

    // Step 2 runs after step 1's fold, so its projection differs — the priority
    // is now set. A single turn-start injection would make this assertion fail
    // while the first one passed, which is exactly the difference between
    // "context was sent once" and "the digest is what THIS step read".
    const records = h.app.bus.records();
    expect(records.length).toBeGreaterThan(1);
    expect(seen.length).toBeGreaterThan(1);
    const second = records[1]?.context.digest ?? "";
    expect(second).not.toBe("");
    expect(seen[1]).toContain(second);
  });
});
