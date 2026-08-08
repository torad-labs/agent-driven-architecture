/**
 * The hook contract, typed once.
 *
 * Every lifecycle module in `modules/` is a `HookModule`. The runner dispatches by event and
 * returns the first block it gets. Modules are pure functions of their payload wherever possible
 * so the selftest can drive them directly without spawning Claude Code.
 */

export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"
  | "SessionStart"
  | "PreCompact"
  | "Stop";

export type HookPayload = {
  readonly hook_event_name?: string;
  readonly tool_name?: string;
  readonly tool_input?: Record<string, unknown>;
  readonly session_id?: string;
  readonly source?: string;
  readonly prompt?: string;
  readonly cwd?: string;
};

/**
 * `block` refuses the action and shows `reason` to the agent. `context` injects text into the
 * session without refusing anything — the mechanism the law-injection and re-anchor modules ride.
 * `null` is the silent path and MUST cost zero bytes: a module with nothing to say says nothing,
 * because an always-on injection is a per-turn tax on every future turn.
 */
export type HookVerdict =
  | { readonly kind: "block"; readonly reason: string }
  | { readonly kind: "context"; readonly text: string }
  | null;

/**
 * Whether a wall can meaningfully re-run against staged content at commit time.
 *
 *   "recheck"           the wall judges WHAT MAY EXIST in the tree. Re-running it on a staged
 *                       blob is exactly as valid as running it at the keyboard, and doing so is
 *                       what catches content that arrived by some route PreToolUse never saw.
 *
 *   "write-time-only"   the wall judges HOW A SEAT MAY EDIT — the channel, the authorisation.
 *                       The resulting file is perfectly legitimate; only the manner of producing
 *                       it was in question. Re-running it at commit time would refuse the normal
 *                       state of the repo. The ledger is the clean example: it is checked in and
 *                       changes constantly, and the wall's whole point is that a SEAT must go
 *                       through the CLI — a committed ledger diff is not a violation of anything.
 *
 * Required on every PreToolUse module, and dev/gates/staged.ts THROWS if it is missing rather
 * than guessing. Guessing wrong in the "recheck" direction blocks every legitimate commit;
 * guessing wrong in the other direction silently drops a wall from the commit gate, which is the
 * failure the gate exists to prevent. Neither default is safe, so there is no default.
 */
export type StagedScope = "recheck" | "write-time-only";

export type HookModule = {
  /** Ordering prefix, mirrored in the filename so the directory listing reads as the chain. */
  readonly order: number;
  readonly name: string;
  readonly events: readonly HookEvent[];
  /** Required for PreToolUse modules. See StagedScope — there is deliberately no default. */
  readonly staged?: StagedScope;
  run(payload: HookPayload): HookVerdict | Promise<HookVerdict>;
};

/**
 * The file path a write-class tool is aimed at.
 *
 * `notebook_path` is not decoration: NotebookEdit carries its target under that key, not
 * `file_path`. Reading only `file_path` meant NotebookEdit sailed past every wall while a Write to
 * the identical path was refused — proven live, `dev/evil.ipynb` exit 0 versus exit 2. A tool in
 * the matcher that no wall can see is worse than one that is absent, because the matcher implies
 * coverage. Any new write-class tool must have its path key added HERE, which is why every wall
 * goes through this function rather than reaching into `tool_input` itself.
 */
export function targetPath(payload: HookPayload): string | null {
  for (const key of ["file_path", "notebook_path", "path"]) {
    const raw = payload.tool_input?.[key];
    if (typeof raw === "string") return raw;
  }
  return null;
}

/**
 * Everything this tool call is about to put INTO the file, concatenated.
 *
 * Not just `content` (Write). Edit carries `new_string` and MultiEdit carries `edits[].new_string`,
 * so a content-shaped wall — the python-shebang check is the one that matters — never saw a line
 * introduced by an Edit. The sweep caught it afterwards, which is detection rather than refusal.
 *
 * Concatenation is deliberate. A wall asking "does this introduce a python shebang" wants to see
 * every incoming fragment; it does not need them reassembled into the resulting file, and
 * pretending to reconstruct that from a diff would be a worse lie than joining the pieces.
 */
export function pendingContent(payload: HookPayload): string | null {
  const parts: string[] = [];

  // EMPTY FRAGMENTS ARE SKIPPED, and that is not tidiness. Joining an empty `content` ahead of a
  // real fragment prepends a newline, which pushes a shebang off line one and makes it invisible
  // to any first-line check. Caught by the ratchet the moment a MultiEdit case was expressible —
  // which is the argument for the corpus being able to describe every tool shape.
  const push = (value: unknown): void => {
    if (typeof value === "string" && value !== "") parts.push(value);
  };

  push(payload.tool_input?.["content"]);
  push(payload.tool_input?.["new_string"]);
  push(payload.tool_input?.["new_source"]);

  const edits = payload.tool_input?.["edits"];
  if (Array.isArray(edits)) {
    for (const edit of edits) push((edit as Record<string, unknown> | null)?.["new_string"]);
  }

  return parts.length === 0 ? null : parts.join("\n");
}

/**
 * Resolve a tool-supplied path to a repo-relative one, or null when it lands outside the repo.
 *
 * Walls used to match on the raw string, which is two bugs at once. A symlink hop
 * (`ln -s .claude/hooks l` then write `l/registry.ts`) walks straight through every pattern; and a
 * path merely CONTAINING `dev/campaigns/setup.toml` — say under /tmp — was refused although it
 * is harmless. Resolving first and then requiring containment fixes both directions.
 *
 * Claude Code sends absolute paths today. That is a convention, not a guarantee, and these modules
 * are the reference implementation for an agent harness — they will be reused where it does not
 * hold.
 */
export function repoRelative(rawPath: string, cwd: string | undefined): string | null {
  const root = cwd ?? process.cwd();

  const absolute = rawPath.startsWith("/") ? rawPath : `${root}/${rawPath}`;

  // Resolve symlinks in the directory chain. The file itself often does not exist yet — it is
  // about to be written — so resolve the deepest existing ancestor and re-append the remainder.
  const segments = absolute.split("/");
  const tail: string[] = [];
  let resolvedHead: string | null = null;

  for (let index = segments.length; index > 0; index -= 1) {
    const candidate = segments.slice(0, index).join("/") || "/";
    try {
      resolvedHead = Bun.resolveSync(".", candidate);
      break;
    } catch {
      const segment = segments[index - 1];
      if (segment !== undefined) tail.unshift(segment);
    }
  }

  const resolved = resolvedHead === null ? absolute : [resolvedHead, ...tail].join("/");
  const resolvedRoot = (() => {
    try {
      return Bun.resolveSync(".", root);
    } catch {
      return root;
    }
  })();

  if (resolved === resolvedRoot) return "";
  if (!resolved.startsWith(`${resolvedRoot}/`)) return null;
  return resolved.slice(resolvedRoot.length + 1);
}

/*
 * `bashCommand()` USED TO LIVE HERE AND HAS BEEN DELETED, DELIBERATELY.
 *
 * It was written in anticipation of a Bash wall that never landed: nothing in the registry ever
 * called it. An external review flagged it correctly — dead enforcement code reads as coverage. A
 * later reader finds a helper for inspecting Bash commands and reasonably infers that Bash commands
 * are inspected. They are not. `.claude/settings.json` matches only the write-class tools.
 *
 * That inference is the danger, so the helper goes rather than sitting here looking reassuring.
 *
 * THE STANCE ON BASH, stated so its absence is a decision rather than an oversight: this host
 * grants `(ALL) NOPASSWD: ALL`. An agent with Bash has root, so no PreToolUse pattern-match on
 * command strings is a wall — it is a speed bump over an unbounded space of spellings, which is
 * exactly what concept #924 says not to mistake for enforcement. The defence that actually holds
 * is `dev/gates/ratchet.ts`: it checks whether the walls still WORK, whatever route was taken to
 * change them, and it runs in CI on a branch that cannot be force-pushed.
 *
 * If a Bash observer is ever wanted, the honest shape is a PostToolUse AUDIT LOG — a record, not a
 * gate — and it should say so in its own header.
 */
