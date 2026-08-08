#!/usr/bin/env bun
/**
 * THE HOOK RUNNER — one entry point, dispatched by lifecycle event.
 *
 * Claude Code invokes this once per event with the payload on stdin. The runner loads every
 * module registered for that event in `order` sequence and returns the FIRST block it gets;
 * `context` verdicts all accumulate, because injecting two facts is not a conflict.
 *
 * FAIL-CLOSED ON THE WRITE PATH (concept #957, Law stratum): if a module throws while judging a
 * PreToolUse, the write is REFUSED. No verdict means no edit. A crashing guard that waves writes
 * through is worse than no guard, because the tree looks protected and is not. On every other
 * event a crash degrades to silence — a broken digest must not brick the session.
 */

import { registry } from "./registry.ts";
import type { HookEvent, HookPayload, HookVerdict } from "./types.ts";

const WRITE_PATH_EVENTS: ReadonlySet<HookEvent> = new Set(["PreToolUse"]);

async function readPayload(): Promise<HookPayload> {
  const raw = await Bun.stdin.text();
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw) as HookPayload;
  } catch {
    return {};
  }
}

function emitBlock(reason: string): never {
  // exit 2 + stderr is Claude Code's deny channel for PreToolUse.
  console.error(reason);
  process.exit(2);
}

function emitContext(chunks: readonly string[]): never {
  if (chunks.length > 0) console.log(chunks.join("\n\n"));
  process.exit(0);
}

const event = (Bun.argv[2] ?? "") as HookEvent;
const payload = await readPayload();
const isWritePath = WRITE_PATH_EVENTS.has(event);

const applicable = registry
  .filter((candidate) => candidate.events.includes(event))
  .sort((left, right) => left.order - right.order);

const contextChunks: string[] = [];

for (const hookModule of applicable) {
  let verdict: HookVerdict;
  try {
    verdict = await hookModule.run(payload);
  } catch (error) {
    if (isWritePath) {
      emitBlock(
        `Hook module ${hookModule.name} failed while judging this write, so the write is ` +
          `refused. No verdict means no edit — a guard that crashes open protects nothing.\n\n` +
          `${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
    }
    continue;
  }

  if (verdict === null) continue;
  if (verdict.kind === "block") {
    if (isWritePath) emitBlock(verdict.reason);
    continue;
  }
  contextChunks.push(verdict.text);
}

emitContext(contextChunks);
