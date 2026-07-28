// VIOLATION: 12.4 — a per-item rejection hijacking the session banner.
import { degraded } from "../../spine/pure/run-status";
export const boom = degraded("unknown ticket");
