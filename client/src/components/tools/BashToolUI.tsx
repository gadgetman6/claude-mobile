import { makeAssistantToolUI } from "@assistant-ui/react";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type BashArgs = {
  command?: string;
  description?: string;
};

export const BashToolUI = makeAssistantToolUI<BashArgs, string>({
  toolName: "Bash",
  render: ({ args, result, status }) => {
    const command = args.command ?? "";
    const description = args.description;
    const isRunning = status.type === "running";
    const output = typeof result === "string" ? result : undefined;
    const lineCount = output ? output.split("\n").length : 0;
    const isLong = lineCount > 8;
    const [expanded, setExpanded] = useState(!isLong);

    return (
      <div className="tool-block">
        <div className="tool-header">
          <span className="tool-name">Bash</span>
          <span className={`tool-status ${isRunning ? "running" : "done"}`}>
            {isRunning ? "running" : "done"}
          </span>
        </div>
        <div className="tool-content">
          {description && <div className="bash-description">{description}</div>}
          {command && <div className="bash-command">{command}</div>}
          {isRunning && (
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <div className="spinner" />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Running...</span>
            </div>
          )}
        </div>
        {output && (
          <>
            <div
              onClick={() => setExpanded(!expanded)}
              style={{
                borderTop: "1px solid var(--border)",
                padding: "4px 10px",
                fontSize: 10,
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                userSelect: "none",
              }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? "Output" : `Output (${lineCount} lines)`}
            </div>
            {expanded && (
              <div
                className="tool-content"
                style={{
                  borderTop: "1px solid var(--border)",
                  maxHeight: 300,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                {output.length > 3000 ? output.slice(0, 3000) + "\n..." : output}
              </div>
            )}
          </>
        )}
      </div>
    );
  },
});
