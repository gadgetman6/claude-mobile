import { BashToolUI } from "./BashToolUI";
import { EditToolUI } from "./EditToolUI";
import { WriteToolUI } from "./WriteToolUI";
import { ReadToolUI } from "./ReadToolUI";
import { GlobToolUI, GrepToolUI } from "./SearchToolUI";
import { TaskToolUI } from "./TaskToolUI";
import { TodoToolUI } from "./TodoToolUI";
import { GenericToolUI } from "./GenericToolUI";

/**
 * All makeAssistantToolUI registrations.
 * Render these as children of <AssistantRuntimeProvider> to register them.
 * The GenericToolUI is a plain component used as the fallback —
 * pass it to Thread's assistantMessage.components.ToolFallback.
 */
export const toolUIs = [
  BashToolUI,
  EditToolUI,
  WriteToolUI,
  ReadToolUI,
  GlobToolUI,
  GrepToolUI,
  TaskToolUI,
  TodoToolUI,
] as const;

export {
  BashToolUI,
  EditToolUI,
  WriteToolUI,
  ReadToolUI,
  GlobToolUI,
  GrepToolUI,
  TaskToolUI,
  TodoToolUI,
  GenericToolUI,
};
