import { makeAssistantToolUI } from "@assistant-ui/react";

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
            {output.length > 2000 ? output.slice(0, 2000) + "\n..." : output}
          </div>
        )}
      </div>
    );
  },
});
