// BLOCK-TEST C5 (F7/G9) — a fold arm reaches for the idempotency key.
// 14.6 rests the whole recovery-path safety claim on "the effect's id is its
// idempotency key", and no port ever built one: the same confirm applied twice
// paged on-call TWICE. The fix is that the key is derived from the COMMITTED step
// index, so it does not exist until bus.append() has returned — an arm that can
// name KeyedEffect is an arm that can invent one before the commit.
package adr.blocks.escalation

import adr.spine.pure.EffectKey
import adr.spine.pure.KeyedEffect
import adr.spine.pure.StepIndex

fun escalationArm(): KeyedEffect? = null

fun guess(step: Int): EffectKey = EffectKey(StepIndex(step), 0)
