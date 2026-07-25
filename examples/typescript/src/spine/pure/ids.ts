// ── spine/pure/ids — value types (L2: the purity boundary is a folder) ──────
// ZERO I/O, zero logic. These are the names the whole system agrees on.
//
// NOTE (D3): `ToolName` is a bare alias, NOT a branded type. The tool name is
// the discriminant of both `ToolResult` and `Command`, and a branded type
// cannot be a discriminant — a literal `"setPriority"` would not be assignable
// to it. One name per verb, and that name is a plain string.

export type ToolName = string;
export type CommandId = string;
export type Timestamp = number;
export type StepIndex = number;
export type SessionId = string;

// The raw, undecoded payload that arrives from a surface or a model. It is the
// one OPEN input in the system (6.10); the boundary closes it via a Verb's
// declared schema before anything downstream sees it.
export type RawInput = unknown;

// Shared identifier vocabulary. These are strings, not entities; several blocks
// name the same ticket without any of them naming each other (L1).
export type TicketId = string;
export type PanelId = string;

// Where an off-bus input came from (12.2). It is the key conflation counts by,
// the scope dedupe runs in, and the attribution an Interrupt or a Drain carries
// — so it is a first-class name, not a label someone remembers to set.
export type SourceName = string;

// The identity of ONE item on a durable queue. A durable source dedupes on it;
// a perishable source ignores it. Never null, so there is no branch.
export type SourceKey = string;
