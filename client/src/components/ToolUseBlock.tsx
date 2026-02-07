import type { AccumulatedBlock } from "../types";
import { BashToolUse } from "./BashToolUse";
import { DiffViewer, WriteViewer } from "./DiffViewer";

export function ToolUseBlock({
  block,
}: {
  block: Extract<AccumulatedBlock, { type: "tool_use" }>;
}) {
  const isSpecialized = ["Bash", "Edit", "Write"].includes(block.name);

  return (
    <div className="tool-block">
      <div className="tool-header">
        <span className="tool-name">{block.name}</span>
        <span className={`tool-status ${block.isRunning ? "running" : "done"}`}>
          {block.isRunning ? "running" : "done"}
        </span>
      </div>

      {block.name === "Bash" && (
        <BashToolUse input={block.input} isRunning={block.isRunning} />
      )}

      {block.name === "Edit" && (
        <DiffViewer input={block.input} />
      )}

      {block.name === "Write" && (
        <WriteViewer input={block.input} />
      )}

      {block.name === "Read" && (
        <>
          <div className="file-path">
            {(block.input.file_path as string) ?? ""}
          </div>
          {block.isRunning && (
            <div className="tool-content">
              <div className="spinner" />
            </div>
          )}
        </>
      )}

      {block.name === "Glob" && (
        <div className="tool-content" style={{ color: "var(--text-secondary)" }}>
          {(block.input.pattern as string) ?? ""}
          {block.input.path ? ` in ${block.input.path}` : ""}
        </div>
      )}

      {block.name === "Grep" && (
        <div className="tool-content" style={{ color: "var(--text-secondary)" }}>
          /{(block.input.pattern as string) ?? ""}/
          {block.input.path ? ` in ${block.input.path}` : ""}
        </div>
      )}

      {!isSpecialized &&
        block.name !== "Read" &&
        block.name !== "Glob" &&
        block.name !== "Grep" && (
          <div className="tool-content" style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {block.inputJson
              ? block.inputJson.slice(0, 1000)
              : JSON.stringify(block.input, null, 2).slice(0, 1000)}
          </div>
        )}

      {/* Tool result output */}
      {block.result && (
        <div className="tool-content" style={{
          borderTop: "1px solid var(--border)",
          maxHeight: 300,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontSize: 11,
          color: "var(--text-secondary)",
        }}>
          {block.result.length > 2000 ? block.result.slice(0, 2000) + "\n..." : block.result}
        </div>
      )}
    </div>
  );
}
