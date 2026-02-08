import { makeAssistantToolUI } from "@assistant-ui/react";

type GlobArgs = {
  pattern?: string;
  path?: string;
};

type GrepArgs = {
  pattern?: string;
  path?: string;
};

export const GlobToolUI = makeAssistantToolUI<GlobArgs, string>({
  toolName: "Glob",
  render: ({ args, status }) => {
    const isRunning = status.type === "running";
    return (
      <div className="tool-block">
        <div className="tool-header">
          <span className="tool-name">Glob</span>
          <span className={`tool-status ${isRunning ? "running" : "done"}`}>
            {isRunning ? "running" : "done"}
          </span>
        </div>
        <div className="tool-content" style={{ color: "var(--text-secondary)" }}>
          {args.pattern ?? ""}
          {args.path ? ` in ${args.path}` : ""}
        </div>
        {isRunning && (
          <div className="tool-content" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="spinner" />
          </div>
        )}
      </div>
    );
  },
});

export const GrepToolUI = makeAssistantToolUI<GrepArgs, string>({
  toolName: "Grep",
  render: ({ args, status }) => {
    const isRunning = status.type === "running";
    return (
      <div className="tool-block">
        <div className="tool-header">
          <span className="tool-name">Grep</span>
          <span className={`tool-status ${isRunning ? "running" : "done"}`}>
            {isRunning ? "running" : "done"}
          </span>
        </div>
        <div className="tool-content" style={{ color: "var(--text-secondary)" }}>
          /{args.pattern ?? ""}/
          {args.path ? ` in ${args.path}` : ""}
        </div>
        {isRunning && (
          <div className="tool-content" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="spinner" />
          </div>
        )}
      </div>
    );
  },
});
