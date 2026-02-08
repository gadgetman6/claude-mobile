import type { ToolCallMessagePartProps } from "@assistant-ui/react";

export function GenericToolUI({
  toolName,
  args,
  result,
  status,
}: ToolCallMessagePartProps) {
  const isRunning = status.type === "running";
  const argsStr = JSON.stringify(args, null, 2);
  const resultStr =
    result != null
      ? typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2)
      : undefined;

  return (
    <div className="tool-block">
      <div className="tool-header">
        <span className="tool-name">{toolName}</span>
        <span className={`tool-status ${isRunning ? "running" : "done"}`}>
          {isRunning ? "running" : "done"}
        </span>
      </div>
      <div
        className="tool-content"
        style={{
          color: "var(--text-secondary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {argsStr.length > 1000 ? argsStr.slice(0, 1000) + "\n..." : argsStr}
      </div>
      {resultStr && (
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
          {resultStr.length > 2000
            ? resultStr.slice(0, 2000) + "\n..."
            : resultStr}
        </div>
      )}
      {isRunning && (
        <div
          className="tool-content"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
