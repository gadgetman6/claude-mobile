import { useState } from "react";
import type { AccumulatedBlock } from "../types";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolUseBlock } from "./ToolUseBlock";

export function TaskCard({
  block,
}: {
  block: Extract<AccumulatedBlock, { type: "tool_use" }>;
}) {
  const [expanded, setExpanded] = useState(block.isRunning);
  const description = (block.input.description as string) ?? "";
  const prompt = (block.input.prompt as string) ?? "";
  const agentType = (block.input.subagent_type as string) ?? "agent";
  const nested = block.nestedBlocks ?? [];
  const toolCount = nested.filter((b) => b.type === "tool_use").length;

  return (
    <div className="task-card">
      <div className="task-header" onClick={() => setExpanded(!expanded)}>
        <div className="task-header-left">
          <span className={`thinking-chevron ${expanded ? "open" : ""}`}>&#9654;</span>
          <span className="task-icon">&#9881;</span>
          <div className="task-info">
            <span className="task-label">Task</span>
            <span className="task-description">{description || prompt.slice(0, 60)}</span>
          </div>
        </div>
        <div className="task-header-right">
          {toolCount > 0 && (
            <span className="task-badge">{toolCount} tools</span>
          )}
          {block.isRunning ? (
            <div className="spinner" style={{ width: 12, height: 12 }} />
          ) : (
            <span className="task-done">&#10003;</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="task-content">
          {agentType !== "agent" && (
            <div className="task-agent-type">{agentType}</div>
          )}
          {nested.length > 0 ? (
            <div className="task-nested">
              {nested.map((nestedBlock, i) => {
                switch (nestedBlock.type) {
                  case "text":
                    return nestedBlock.text ? (
                      <div key={i} className="text-block" style={{ fontSize: 12 }}>
                        {nestedBlock.text}
                      </div>
                    ) : null;
                  case "thinking":
                    return (
                      <ThinkingBlock
                        key={i}
                        thinking={nestedBlock.thinking}
                        defaultOpen={false}
                      />
                    );
                  case "tool_use":
                    return nestedBlock.name === "Task" ? (
                      <TaskCard key={i} block={nestedBlock} />
                    ) : (
                      <ToolUseBlock key={i} block={nestedBlock} />
                    );
                  default:
                    return null;
                }
              })}
            </div>
          ) : block.isRunning ? (
            <div className="task-loading">
              <div className="spinner" />
              <span>Working...</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>
              No nested content
            </div>
          )}

          {block.result && (
            <div className="task-result">
              {block.result.length > 1000 ? block.result.slice(0, 1000) + "..." : block.result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
