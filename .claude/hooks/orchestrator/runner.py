#!/usr/bin/env python3
"""Hook orchestrator - dispatches to modules/<lifecycle>/*.py."""
import importlib.util
import json
import sys
from pathlib import Path

HOOKS_DIR = Path(__file__).resolve().parent.parent


def dispatch(lifecycle: str) -> None:
    """Load and run all modules for a lifecycle."""
    modules_dir = HOOKS_DIR / "modules" / lifecycle
    if not modules_dir.exists():
        print(json.dumps({"continue": True}))
        return

    data = json.loads(sys.stdin.read()) if not sys.stdin.isatty() else {}

    results = []
    for module_file in sorted(modules_dir.glob("*.py")):
        if module_file.name.startswith("_"):
            continue

        spec = importlib.util.spec_from_file_location(module_file.stem, module_file)
        if spec is None or spec.loader is None:
            results.append({
                "continue": True, "decision": "block", "_module": module_file.name,
                "message": f"[{module_file.name}] could not be loaded (no import spec). "
                           "Refusing the write rather than allowing it unchecked.",
            })
            continue

        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)

            if hasattr(module, "applies") and not module.applies(data):
                continue

            if hasattr(module, "run"):
                result = module.run(data)
                if result:
                    result.setdefault("_module", module_file.name)
                    results.append(result)
        except Exception as exc:
            # FAIL CLOSED, and SAY SO. Swallowing the exception let a crashed policy
            # module read exactly like a policy that found nothing — the failure mode
            # this orchestrator's own entry point already guards against at the top
            # level, reproduced per-module one layer down.
            import traceback
            results.append({
                "continue": True, "decision": "block", "_module": module_file.name,
                "message": f"[{module_file.name}] raised {type(exc).__name__}: {exc}. "
                           "Refusing the write rather than allowing it unchecked.",
            })
            print(traceback.format_exc(), file=sys.stderr)

    # Merge results.
    #
    # DENY THE CALL, DO NOT HALT THE SESSION. `continue: false` is the protocol's
    # kill switch: it aborts the whole agent turn, so a single denied write ends the
    # run and whatever work was in flight stops mid-task. That is not what a lint gate
    # wants. The gate wants "this write is refused, here is why, try again" — which is
    # `permissionDecision: deny` plus a reason the model actually receives.
    #
    # Both halves of that were wrong here and they compounded: the turn died, AND the
    # explanation never arrived, because `message` is not the field that carries block
    # feedback back to the model. The result was a gate that looked like a crash.
    # `continue` is ALWAYS true. Every block is `decision: "block"` with a reason.
    blocked = [r for r in results if r.get("decision") == "block" or not r.get("continue", True)]
    reason = "\n".join(r["message"] for r in results if r.get("message"))

    final: dict = {"continue": True}

    if blocked:
        final["decision"] = "block"
        # NEVER emit a block with an empty reason. A refusal with no explanation is
        # indistinguishable from a crash, and the only thing the author can do with it
        # is guess or switch the gate off. Name the module so the silence is traceable.
        final["reason"] = reason or (
            "Blocked by PreToolUse module(s): "
            + ", ".join(sorted({r.get("_module", "unknown") for r in blocked}))
            + " — the module returned no message. That is a defect in the module: a "
            "blocking rule must say what it objected to."
        )
    elif reason:
        final["systemMessage"] = reason

    print(json.dumps(final))
