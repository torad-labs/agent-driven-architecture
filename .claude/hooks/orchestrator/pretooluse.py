#!/usr/bin/env python3
"""pretooluse lifecycle entry — dispatches to modules/pretooluse/*.py."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from orchestrator.runner import dispatch

if __name__ == "__main__":
    try:
        dispatch("pretooluse")
    except Exception as exc:  # fail CLOSED: a broken gate must not read as a clean one
        import json as _json, traceback, sys as _sys
        print(_json.dumps({
            "continue": True,   # deny the call; never kill the session
            "decision": "block",
            "reason": "HOOK POLICY INCOMPLETE - the PreToolUse orchestrator raised "
                       f"{type(exc).__name__}: {exc}. Refusing the write rather than "
                       "allowing it unchecked.",
        }))
        print(traceback.format_exc(), file=_sys.stderr)
