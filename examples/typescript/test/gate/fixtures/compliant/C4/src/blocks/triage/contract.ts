import type { ToolResultBase } from "../../spine/pure/tool-result";
export interface SetPriorityResult extends ToolResultBase {
  readonly tool: "setPriority";
}
