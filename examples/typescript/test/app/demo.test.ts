// ── demo smoke — the runnable script actually runs, offline ────────────────
// `npm run demo` is the first thing a reader executes. If it breaks, the
// ENTRY POINT is src/app/main.ts — demo.ts exports the walkthrough and binds nothing.
// reference is broken regardless of what the unit tests say.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");

describe("app/demo", () => {
  it("runs end to end with no keys and no network", () => {
    const out = execFileSync(
      join(ROOT, "node_modules", ".bin", "tsx"),
      [join(ROOT, "src", "app", "main.ts")],
      {
        encoding: "utf8",
        cwd: ROOT,
      },
    );

    expect(out).toContain("[agent] ran 2 steps");
    // the gate refuses the self-confirm and admits the host
    expect(out).toContain("self-confirm: the confirming authority is the requesting authority");
    expect(out).toContain("[pager] on-call paged for ticket 4118");
    // the artifact is delivered exactly once, at seal
    expect(out).toContain("[delivery] work product sealed, 2 line(s)");
    // and the whole session re-derives from the bus alone
    expect(out).toContain("re-derived from the bus: true");
    // a per-item refusal never reaches the session banner
    expect(out).toContain("[banner]   ok");
    // 11 — the deep tier published and the fast tier recalled it as TEXT
    expect(out).toContain("[tier]     deep tier published:");
    expect(out).toContain("kind: 'Fresh'");
    // 12 — the interrupt was handled at t=100, not at t=10000
    expect(out).toContain("would finish at t=10000; interrupt handled at t=100");
    expect(out).toContain("[barge-in] cancelled turn's steps are still folded: 1 line(s)");
  });
});
