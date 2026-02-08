import { useState, useEffect } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";

type TaskArgs = {
  description?: string;
  prompt?: string;
  subagent_type?: string;
};

export const TaskToolUI = makeAssistantToolUI<TaskArgs, string>({
  toolName: "Task",
  render: ({ args, result, status }) => {
    const isRunning = status.type === "running";
    const description = args.description ?? "";
    const prompt = args.prompt ?? "";
    const agentType = args.subagent_type ?? "agent";
    const output = typeof result === "string" ? result : undefined;

    const [expanded, setExpanded] = useState(isRunning);

    // Auto-expand when the task starts running
    useEffect(() => {
      if (isRunning) setExpanded(true);
    }, [isRunning]);

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
            {isRunning ? (
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
            {isRunning && !output ? (
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
