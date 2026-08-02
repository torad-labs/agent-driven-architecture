import type { ToolResultBase } from "@adr/spine/pure/tool-result";
export interface SetPriorityResult extends ToolResultBase {
  readonly tool: "setPriority";
}
