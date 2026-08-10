---
name: grant
description: Open the load-bearing paths in compose-flow for a bounded window — sgconfig, rule definitions, settings.json, the registry, the grant gate, the shared checkers and the Gradle build files. Bare /grant status inspects without issuing.
argument-hint: "[duration] <why> | status | revoke"
disable-model-invocation: true
allowed-tools: Bash(bun dev/gates/grant-status.ts *)
---

The status below already executed deterministically and is current as of this message.
Relay it to the operator and take no further action — in particular, do not attempt to issue,
extend, or revoke a grant yourself. You cannot, and trying is a protocol violation.

!`bun dev/gates/grant-status.ts`

---

## Usage

| typed | effect |
| --- | --- |
| `/grant fixing the empty-file gap in the sweep` | 2h, reason recorded |
| `/grant 30m narrowing no-python-invocation` | 30 minutes |
| `/grant status` | inspect, issue nothing |
| `/grant revoke` | close it now |

A bare `<n>s` / `<n>m` / `<n>h` is the **duration**; everything else is the **reason**. The reason
is required — it is the only audit trail a later reader gets for why a wall was opened. Default 2
hours, clamped to 8, and the clamp is re-applied on read so a hand-edited expiry does not survive.

## What it opens

Only the paths whose weakening is **silent** — where breaking them produces no failure anywhere
else in the repository:

- `sgconfig.yml` — drop a ruleDir and every rule under it vanishes with nothing going red
- `.rules/<lang>/ast-grep/rules/**` — the rule definitions themselves
- `.claude/settings.json` — remove a hook entry and the chain is simply gone
- `.claude/hooks/registry.ts` — drop a module and the wall is gone
- `.claude/hooks/grant-store.ts` and `modules/03-grant-gate.ts` — the recursion closure
- `dev/gates/no-python.ts` — the checker both the hook and the sweep share
- `dev/gates/staged.ts` — the commit-time half of same-checker-twice
- `dev/matrix.ts` — holds the fail-closed rule; weakened, the matrix can lie
- `settings.gradle.kts`, `build.gradle.kts` — the module graph, the primary wall

**Nothing else is gated.** New hook modules, selftests, `ledger.ts` and `ledger-core.ts`,
`lattice.ts`, `book-laws.ts`, rule test fixtures, the book, the campaign ledger and every ordinary
source file are all free. Adding a wall is tightening, not weakening, and never needs permission.

The grant does not skip a gate. Every check still has to pass.

## Why issuing is not this script

`/grant …` is handled by the UserPromptSubmit module `.claude/hooks/modules/20-grant-issue.ts`,
which writes the token in-process. This file is only the menu surface — a UserPromptSubmit
interception never appears in `/` autocomplete on its own, because the menu indexes command files.

That split is the security property rather than an implementation detail. **A UserPromptSubmit
hook fires only on text a human typed into the prompt box; an assistant emits tool calls and
assistant messages and can never emit a user prompt.** So authorisation originates from a
principal the assistant cannot act as.

Which is why the `!` line above is **read-only**. `dev/gates/grant-status.ts` imports `liveGrant`
and nothing else — it has no path to `issue()` or `revoke()`. If it could issue, an assistant
could call it with Bash and the gate would be decorative. Do not add an issue mode to it.

## What this does not claim

**1 — Bash is root here.** This host grants `(ALL) NOPASSWD: ALL`. An assistant with Bash could
import `grant-store.ts` and call `issue()` directly, or simply write the token. No filesystem
arrangement prevents that. What the design buys is that the intended path is operator-only and
every other path is **conspicuous**.

**2 — "only a human can type into the prompt box" is false in this topology.** UserPromptSubmit
fires on whatever *lands* in the prompt box, and fleet builders are dispatched by injecting text
into a pane — `mcp__torad-fleet__sendMessage`. Any seat with fleet MCP access can therefore put
`/grant 8h …` into its own session, and the payload carries no provenance the hook could use to
tell that apart from a keystroke.

So the trust boundary is **the operator plus anything that can write to a seat's prompt line**,
which today includes the fleet channel. Named here the way Bash is named, rather than left as an
assumption the security story quietly rests on. Grants are session-bound (see below), so a seat
doing this opens only itself — not every concurrent builder — but it does open itself.

**3 — the grant is not the load-bearing defence, and should not be treated as one.** That is
`dev/gates/ratchet.ts`: 37 synthetic violations that must stay refused, checked in CI, on a branch
that cannot be force-pushed. Detection you cannot erase beats prevention you cannot enforce. The
grant's real job is the audit trail — *why* was this wall opened, and by whom.

All three are stated because the first version of this gate claimed *"a seat never widens its own
walls"* while delivering friction, and a claim outrunning its implementation is precisely what the
`honesty-as-control-flow` law forbids.

## Session binding

A grant records the session that requested it and opens only that session. Without this, one grant
taken by the orchestrator would open every concurrent builder for its whole window — the session
id was being recorded and never compared, which is a field that reads as a control and is not.

## Why a grant instead of a hard ban

The `no-python` wall has no exemption path at all, and that absence is the substance of the rule.
Walls are different: sometimes a wall is genuinely wrong and fixing it is the correct move. This
grant exists so that case has a bounded, self-closing door instead of someone disabling the guard
— because a guard you disable to get work done is a guard that stays disabled.
