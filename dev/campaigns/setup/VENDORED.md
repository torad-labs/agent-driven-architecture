# Vendored harness — lineage

The campaign machinery in this repository is vendored from **compose-flow**
(`~/Documents/dev/infra/compose-flow/repo`) at commit `df57074`, on **2026-08-07**.

compose-flow is itself a consumer, not the origin: it vendored from **eli-operator** at `81c22bb`
on 2026-07-27/28. So the lineage is `eli-operator → compose-flow → agent-driven-architecture`.

**Why compose-flow rather than torad-fleet.** The operating doctrine names the torad-fleet copy as
the one that leads, "carrying `laws`/`packet`/`claim`/`release-stale`/`amend-header`". Measured at
vendoring, the compose-flow copy carries all five of those AND `add-law`, `amend`, `remedy`,
`require`, `depends`, plus the whole earn plane (`earn-core.ts`, `ledger-earn.ts`,
`matrix-earn.ts`, `hydrate.ts`, `review.ts`). Its ledger selftest is 28/28 against the 24/24
compose-flow recorded at its own vendoring. That parenthetical is stale; this copy leads.

It was **ported, not copied**: every repository-specific constant was found and changed, and every
selftest was run against the result.

## Verification performed at vendoring

```
ledger selftest        28/28        matrix selftest       25/25
manifest selftest      19/19        hook selftest         79/79
ratchet-selftest        9/9         deletion-guard        13/13
grant-path-wall          7/7        cli witness           23/23
ratchet                 33 synthetic violations all refused
lattice                 clean · 9 units, 9 rows
ci-hygiene              clean · 2 workflows, 4 jobs
ledger validate         dev/campaigns/sdk.toml: valid · 11 items
matrix validate         dev/matrix.toml: valid · 9 rows
manifest validate       dev/manifests/agent-driven-architecture.toml: valid · 9 units
bun run gate            exit 0
```

## What came across, unchanged in logic

| Path | What it is |
|---|---|
| `dev/campaigns/ledger-core.ts` | Lock, line-surgical writes, validate-and-rollback |
| `dev/campaigns/ledger.ts` | The campaign CLI — the only channel to ledger state |
| `dev/campaigns/{earn-core,ledger-earn,matrix-earn,hydrate,review}.ts` | The earn plane |
| `dev/matrix.ts`, `dev/manifest.ts` | Fail-closed readiness matrix and manifest CLIs |
| `dev/gates/{lattice,ratchet,ratchet-selftest,staged,deletion-guard}.ts` | Cross-check, corpus ratchet, commit gate |
| `dev/gates/{grant-path-wall,grant-status,hookpath,cli-selftest,ci-hygiene,beacon-check}.ts` | The rest of the gate chain |
| `.claude/hooks/**` | Runner, registry, types, selftest, grant store, 8 of 10 modules |
| `.claude/commands/grant.md` | The operator-only grant command |
| `dev/githooks/pre-commit` | The staged gate, installed via `core.hooksPath` |

## What did NOT come across, and why

**`01-no-python` + `dev/gates/no-python.ts`.** compose-flow's OPERATOR LAW ("I want no python in
this codebase at all", its repo kickoff). This repository's own enforcement layer is currently
Python — `.claude/hooks/orchestrator/*.py` and `.claude/hooks/modules/pretooluse/*.py`, 651 lines —
so importing the law would have made the host repo's own walls its first permanent violation.
Precedent is compose-flow's own: it declined to port eli-operator's decision book because
"Different product, different decisions." A product law travels no better than a book.

**`04-ast-grep-walls` + `dev/gates/ast-grep-walls.ts`.** Hardwired to `compose-flow-core/` path
shaping and that repo's `.yml` ruleDirs. This tree's `.rules` are `.yaml` under a `registry.json`
with a different rule set entirely. Machinery in shape, product-bound in constants.

**`dev/gates/module-graph.ts`.** Entirely compose-flow's Gradle module graph — nine
`compose-flow-*` projects, `gradle` invocations, `.kt` probe files. There is no Gradle in this
repository's harness.

Removing two modules meant editing `registry.ts` (the chain) and `selftest.ts` (the roster
assertion). **The roster literal is the thing that keeps their absence deliberate** rather than a
vendoring that quietly dropped two walls — it is asserted, so re-adding them without their checks
goes red.

## What changed, and why

**`.claude/hooks/repo.ts`** — the three constants: `LEDGER = dev/campaigns/sdk.toml`,
`MATRIX = dev/matrix.toml`, `REPO_NAME = agent-driven-architecture`.

**`dev/campaigns/review.ts` — A REAL BUG, worth promoting upstream.** `defaultLedger()` and
`defaultMatrix()` re-spelled `dev/campaigns/setup.toml` and `dev/matrix.toml` as string literals
instead of reading `repo.ts`. That is precisely the duplicated-constant failure `repo.ts` was
extracted to kill, and it fails SILENTLY: a default resolving to a file which is not the campaign
reports an empty review rather than an error. Now imports `LEDGER` / `MATRIX`.

**`dev/walls/corpus.toml` — 66 entries → 33.** Every entry naming `01-no-python` (17) or
`04-ast-grep-walls` (16) was removed, because a corpus entry for a wall that is not in the registry
is not a wall that stopped working — it is a fixture with no wall. Pruned BEFORE the first commit
deliberately: `ratchet.ts:121` treats a missing baseline as non-failure, so the first commit here
sets the count. Committing 66 and shrinking afterwards would have tripped the shrink ratchet
permanently.

One surviving entry, `GRANT-checker`, pointed at `dev/gates/no-python.ts` and had to be retargeted.
**The first retarget was wrong and the ratchet caught it**: `dev/campaigns/earn-core.ts` is not in
the guarded set (only `ledger.ts` and `ledger-core.ts` are), so the gate correctly did not refuse
it. Every `dev/gates/*.ts` was already covered by another entry, so it now names `package.json` —
guarded, previously uncovered, and labelled "the gate chain" in `grant-store.ts`.

**`dev/gates/ratchet-selftest.ts`** — its probe fixtures used `01-no-python` with `.py` paths.
Re-expressed against `02-ledger-channel` over the three paths that wall guards. The ratchet does
not care which wall a fixture names, only that it is registered and still refuses.

**`.claude/hooks/selftest.ts`** — the two removed walls' check blocks deleted; the grant-gate
"free: an existing wall module" fixture retargeted from `01-no-python.ts` to `02-ledger-channel.ts`;
the two law-injection assertions renamed from `make-drift-not-compile` / no-python to laws that are
actually in this ledger's header. Those checks assert "the text came from the ledger, not a
hardcoded copy", which is only meaningful when the string is one no hook would plausibly hardcode.

**`package.json` is new at the repository root.** The TypeScript port has its own under
`examples/typescript`; this one carries only the gate chain, hence `-harness`. `gate:walls` and
`gate:module-graph` are absent from the chain for the reasons above.

**`.github/workflows/ci.yml`** — `ci-hygiene` immediately found three real defects in the host
repo's existing workflow: no `timeout-minutes` on either job, and no `concurrency` block. Fixed
(15m / 30m, and cancel-in-progress everywhere except `main`). The gate paid for itself before it
was finished being installed.

## Outstanding — NOT resolved by this vendoring

**The hook chain is INERT.** `.claude/settings.json` still routes all five lifecycle events to the
Python orchestrator; the vendored bun runner is registered nowhere. Until that is decided,
`02-ledger-channel` does NOT block raw ledger edits and "the CLI is the only channel" is
documentation rather than enforcement. Two chains must never both own an event. Campaign item
`SDK-10` holds the decision and the measurement that `04-ast-grep-walls` supersedes both Python
rule modules.

**90 violations of this repo's own TypeScript ast-grep rules** across the vendored tree
(`no-magic-strings` 39, `no-non-null-assertion` 16, `no-any` 12, `prefer-readonly-array` 10,
`no-module-state` 8, `exhaustive-switch` 3, `async-stream-pattern` 2). Fixing them locally is a
hand-fork and would make the next re-vendoring a merge conflict per file. The divergence policy
says the exemption is the correct instrument, scoped and commented. Campaign item `SDK-11`.

## Divergence policy

Per the multi-session orchestration doctrine: **never hand-fork divergent logic.** If a bug is
found in the ledger CLI here, fix it here, then promote the fix to compose-flow and eli-operator.
If any two disagree on behaviour, that is a defect in the vendoring, not a local adaptation. Two
corrections above are marked for promotion: the `review.ts` constant duplication, and this file's
observation that the leading-copy note in the operating doctrine is stale.

Run `selftest` at every re-vendoring. A ledger CLI nobody has watched preserve a comment is a
ledger CLI that will one day eat the memory.

## Removed after vendoring — THE GRANT SYSTEM (operator ruling, 2026-08-13)

**"The grant system is dead."** Deleted from this tree on that ruling:

- `.claude/hooks/modules/03-grant-gate.ts` — the PreToolUse gate
- `.claude/hooks/grant-store.ts` — the guarded set, the token store, `liveGrant()`
- `.claude/hooks/modules/20-grant-issue.ts` — `/grant` issuance
- `.claude/commands/grant.md` — the operator command
- `dev/gates/grant-status.ts` and `dev/gates/grant-path-wall.ts` — the status card and the
  token-path backstop

**Measured at deletion, for the record.** The gate WAS armed here: a synthetic Edit payload
against `dev/matrix.ts` replayed through the vendored runner exited 2 that same morning. But the
issuance channel was never wired in this repo — `userpromptsubmit.py` dispatches to a
`modules/userpromptsubmit/` directory that does not exist, so no `/grant` could ever have issued
a token here. A gate that fires but can never open is not a control; it is a trap. That
measurement belongs to SDK-10's hook-chain decision and is noted on that item.

**What replaced it, mechanically:**

- `dev/walls/corpus.toml` gained the **`retired` channel** in `dev/gates/ratchet.ts`: the corpus
  may still only grow, and the one lawful shrink is moving an id to `retired` with the dated
  ruling — before this, ANY corpus shrink was red forever, which made an operator-ordered wall
  retirement unlandable. 28 of 33 entries retired with the wall; 5 (`02-ledger-channel`) remain.
- `dev/gates/deletion-guard.ts` inlined the guarded list. The escape is no longer a grant but a
  same-commit list edit: remove the path from GUARDED in the commit that deletes it, so the
  policy change and the deletion are one diff. This is enforcement by visibility, and it IS
  weaker than an operator-only door — that is the trade the ruling implies, stated here rather
  than discovered later.
- `ledger.ts` `add-law` / `amend-header` / `amend` are ordinary commands again. Amend still
  preserves every old value as a dated note — that note was always the real audit trail.

**Divergence this creates, deliberately:** compose-flow and eli-operator still carry the grant
system. Whether it dies there too is the operator's call, not this file's.

**And one that landed by accident, now flagged:** compose-flow executed the same ruling hours
earlier in a parallel seat, and its ratchet solves the corpus-shrink problem with a per-entry
`retired: boolean` flag where this repo's uses a separate `retired` list with
fresh/recorded/dropped rules. Same problem, two shapes, both committed — a reconciliation
decision for the operator, not something either seat should silently "fix".

## Changed after vendoring — the matrix `verified` derivation (2026-08-13)

`dev/matrix.ts` replaced the `verified` rung's permission model (`MATRIX_ORCHESTRATOR=1` —
ambient authority guarding a write) with a DERIVATION computed at query time: `verified` is no
longer a stored status but a verdict over `status == ready` ∧ ≥1 recorded `path+token` edge and
every edge resolving in the current tree ∧ the latest completed `ci` run on main being green ∧
that run having tested what main currently is (two just-fetched values — the run's head tree and
the tip's tree — compared and discarded; nothing sha-shaped is stored, so force-pushes and
squash-merges cannot flip a verdict) ∧ a shape-valid review pointer. New commands
`edge` / `review` / `verified` / `migrate`; `set <ID> verified` is a hard error naming the
replacements; `target_proof`, `prove --target`, and `ORCHESTRATOR_ENV` are gone; `unproven` is
derivation-based (offline the run leg is *unchecked*, and unchecked is unproven). `validate`
refuses a stored `verified` and a stray `target_proof` — same checkers at both doors.

This lands with the ratchet `retired` channel as one promotion unit to compose-flow and
eli-operator per the divergence policy, with `selftest` run at each vendoring.
