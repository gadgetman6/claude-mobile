import { useState, useEffect } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useClaudeSessionContext } from "@/hooks/useClaudeSession";
import type { ThreadMessageLike } from "@assistant-ui/react";

type TaskArgs = {
  description?: string;
  prompt?: string;
  subagent_type?: string;
};

export const TaskToolUI = makeAssistantToolUI<TaskArgs, string>({
  toolName: "Task",
  render: ({ toolCallId, args, result, status }) => {
    const isRunning = status.type === "running";
    const description = args.description ?? "";
    const prompt = args.prompt ?? "";
    const agentType = args.subagent_type ?? "agent";
    const output = typeof result === "string" ? result : undefined;

    const { nestedContentMap } = useClaudeSessionContext();
    const nested = nestedContentMap.get(toolCallId) ?? [];

    const [expanded, setExpanded] = useState(isRunning);

    useEffect(() => {
      if (isRunning || nested.length > 0) setExpanded(true);
    }, [isRunning, nested.length]);

    const toolCount = nested.reduce((count, msg) => {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) return count;
      return count + (msg.content as any[]).filter((p: any) => p.type === "tool-call").length;
    }, 0);

    return (
      <div className="task-card">
        <div className="task-header" onClick={() => setExpanded(!expanded)}>
          <div className="task-header-left">
            <span className={`thinking-chevron ${expanded ? "open" : ""}`}>
              &#9654;
            </span>
            <span className="task-icon">&#9881;</span>
            <div className="task-info">
              <span className="task-label">Task</span>
              <span className="task-description">
                {description || prompt.slice(0, 60)}
              </span>
            </div>
          </div>
          <div className="task-header-right">
            {agentType !== "agent" && (
              <span className="task-badge">{agentType}</span>
            )}
            {toolCount > 0 && (
              <span className="task-badge">{toolCount} tools</span>
            )}
            {isRunning ? (
              <div className="spinner" style={{ width: 12, height: 12 }} />
            ) : (
              <span className="task-done">&#10003;</span>
            )}
          </div>
        </div>

        {expanded && (
          <div className="task-content">
            {nested.length > 0 ? (
              <div className="task-nested">
                {nested.map((msg, i) => (
                  <NestedMessage key={i} message={msg} />
                ))}
              </div>
            ) : isRunning ? (
              <div className="task-loading">
                <div className="spinner" />
                <span>Working...</span>
              </div>
            ) : null}
            {output && (
              <div className="task-result">
                {output.length > 1000
                  ? output.slice(0, 1000) + "..."
                  : output}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
});

function NestedMessage({ message }: { message: ThreadMessageLike }) {
  if (message.role !== "assistant" || !Array.isArray(message.content)) return null;

  return (
    <>
      {(message.content as any[]).map((part: any, i: number) => {
        if (part.type === "text" && part.text) {
          return (
            <div key={i} className="text-sm text-foreground" style={{ fontSize: 12 }}>
              {part.text}
            </div>
          );
        }
        if (part.type === "reasoning" && part.text) {
          return (
            <div key={i} className="thinking-block" style={{ fontSize: 11 }}>
              <details>
                <summary className="thinking-header" style={{ cursor: "pointer" }}>
                  Thinking ({part.text.length} chars)
                </summary>
                <div className="thinking-content">{part.text}</div>
              </details>
            </div>
          );
        }
        if (part.type === "tool-call") {
          return (
            <div key={i} className="tool-block" style={{ fontSize: 12 }}>
              <div className="tool-header">
                <span className="tool-name">{part.toolName}</span>
                <span className={`tool-status ${part.result != null ? "done" : "running"}`}>
                  {part.result != null ? "done" : "running"}
                </span>
              </div>
              {part.toolName === "Bash" && part.args?.command && (
                <div className="tool-content">
                  {part.args.description && <div className="bash-description">{part.args.description}</div>}
                  <div className="bash-command">{part.args.command}</div>
                </div>
              )}
              {part.toolName === "Read" && part.args?.file_path && (
                <div className="file-path">{part.args.file_path}</div>
              )}
              {part.toolName === "Glob" && (
                <div className="tool-content" style={{ color: "var(--text-secondary)" }}>
                  {part.args?.pattern}{part.args?.path ? ` in ${part.args.path}` : ""}
                </div>
              )}
              {part.toolName === "Grep" && (
                <div className="tool-content" style={{ color: "var(--text-secondary)" }}>
                  /{part.args?.pattern}/{part.args?.path ? ` in ${part.args.path}` : ""}
                </div>
              )}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
