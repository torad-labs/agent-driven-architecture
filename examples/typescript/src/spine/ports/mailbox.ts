// ── spine/ports/mailbox — the barge-in seam (12.2) ─────────────────────────
// INTERFACES ONLY (C11).
//
// `take()` LEASES. The message is not removed from the queue until `ack`, and
// `ack` is called ONLY AFTER THE COMMIT — so a crash between the take and the
// commit re-delivers rather than loses. That is the whole of 12.2's durable
// contract, and it is a property of this signature rather than of a convention
// someone remembers.
//
// `take()` returns a promise so that a consumer can RACE it against the turn it
// is already running. That race is the fix for the drain loop that cannot
// preempt: a blocking take at the top of a loop body is never reached while a
// turn is in flight, so every mid-turn guard downstream of it is dead code.

import type { Message } from "../pure/mailbox";

export interface Mailbox {
  post(message: Message): void;
  /** leases the next message; it stays in flight until `ack` */
  take(): Promise<Message>;
  /** called only after the commit — never before */
  ack(message: Message): void;
}
