#!/usr/bin/env python3
"""Bridge the VENDORED write-path walls into this repo's existing hook chain.

WHY A BRIDGE AND NOT A SECOND CHAIN
The campaign machinery vendored from compose-flow ships its own Bun hook runner
(`.claude/hooks/runner.ts`). Registering it in settings.json alongside this
Python orchestrator would put TWO chains on one lifecycle event — which is the
hostshield failure mode exactly: two daemons, one shared state file, and a
TERM->KILL grace window that silently collapsed from 30s to ~2s because neither
knew about the other. So one chain owns PreToolUse, and it is this one.

WHY A BRIDGE AND NOT A PORT
Reimplementing `02-ledger-channel` in Python would be a hand-fork of vendored
logic, which the divergence policy in dev/campaigns/setup/VENDORED.md forbids:
"If the two ever disagree on behaviour, that is a defect in the vendoring, not a
local adaptation." This module holds NO rule of its own. It shells out to the
vendored runner and relays its verdict, so there is exactly ONE checker source
and a re-vendoring updates the behaviour here for free.

WHAT IT ACTUALLY BUYS
Until this existed, `bun run gate` was green and the CLI-only law was
DOCUMENTATION: nothing stopped a raw Edit to dev/campaigns/sdk.toml, which skips
the lock, skips validate-and-rollback, and can strip the `#` notes that are the
campaign's memory. On PreToolUse the vendored chain runs 02-ledger-channel (the
CLI-only channel guard); the rest of its modules are bound to other events and
do not fire here. (It also ran 03-grant-gate until 2026-08-13, when the grant
system was deleted on an operator ruling — see dev/campaigns/setup/VENDORED.md.)

FAIL-CLOSED, and deliberately so. A missing `bun`, a crashed runner, or a
timeout REFUSES the write. A guard that cannot answer must not wave writes
through — the same rule the vendored settings.json states for its own runner,
and the same one the orchestrator above applies to a module that raises.
"""
import json
import shutil
import subprocess
from pathlib import Path

# parents[4], not [3]. The first draft used [3], which resolves to `.claude/`, so
# RUNNER pointed at `.claude/.claude/hooks/runner.ts`, `applies()` returned False,
# and the wall SILENTLY did nothing while the chain reported success. That is the
# exact failure class `.claude/hooks/repo.ts` was extracted upstream to kill — a
# guard that cannot find its target reads identically to a guard that found
# nothing. Caught only because the landing test asserted a REFUSAL and got an
# allow; a smoke test that merely ran the hook would have passed.
REPO = Path(__file__).resolve().parents[4]
RUNNER = REPO / ".claude" / "hooks" / "runner.ts"

WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}


def applies(data: dict) -> bool:
    """Only write tools, and only when the vendored chain is actually present."""
    return data.get("tool_name", "") in WRITE_TOOLS and RUNNER.exists()


def run(data: dict) -> dict:
    bun = shutil.which("bun")
    if bun is None:
        return {
            "continue": True,
            "decision": "block",
            "message": (
                "[vendored-write-walls] `bun` is not on PATH, so the vendored ledger-channel "
                "and grant-gate walls could not run. Refusing the write rather than proceeding "
                "unguarded. Install bun, or remove this module deliberately."
            ),
        }

    try:
        proc = subprocess.run(
            [bun, str(RUNNER), "PreToolUse"],
            input=json.dumps(data),
            capture_output=True,
            text=True,
            timeout=10,
            cwd=str(REPO),
        )
    except subprocess.TimeoutExpired:
        return {
            "continue": True,
            "decision": "block",
            "message": (
                "[vendored-write-walls] the vendored hook runner timed out. Refusing the write "
                "rather than proceeding unguarded."
            ),
        }

    # The vendored runner's contract: exit 2 means REFUSED, and the reason is on
    # stderr. Exit 0 means it had nothing to say. Anything else is a broken
    # chain, which is not the same as permission.
    if proc.returncode == 2:
        return {
            "continue": True,
            "decision": "block",
            "message": proc.stderr.strip() or "[vendored-write-walls] refused (no reason given).",
        }

    if proc.returncode != 0:
        return {
            "continue": True,
            "decision": "block",
            "message": (
                f"[vendored-write-walls] the vendored hook runner failed to run "
                f"(exit {proc.returncode}). Refusing the write rather than proceeding "
                f"unguarded. Run: bun .claude/hooks/selftest.ts\n{proc.stderr.strip()}"
            ),
        }

    return {"continue": True}
