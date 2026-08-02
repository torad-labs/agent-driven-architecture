import type { Timestamp } from "../pure/ids";
export interface Clock {
  now(): Timestamp;
}
