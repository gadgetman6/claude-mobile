import { useMemo } from "react";

// Simple inline diff viewer for Edit operations
// We show old_string → new_string as a unified diff
export function DiffViewer({
  input,
}: {
  input: Record<string, unknown>;
}) {
  const filePath = (input.file_path as string) ?? "";
  const oldStr = (input.old_string as string) ?? "";
  const newStr = (input.new_string as string) ?? "";

  const lines = useMemo(() => computeDiffLines(oldStr, newStr), [oldStr, newStr]);

  return (
    <>
      {filePath && <div className="file-path">{filePath}</div>}
      <div className="diff-container">
        <div className="tool-content" style={{ padding: 0 }}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                padding: "1px 10px",
                background:
                  line.type === "add"
                    ? "rgba(76, 175, 80, 0.1)"
                    : line.type === "remove"
                    ? "rgba(244, 67, 54, 0.1)"
                    : "transparent",
                color:
                  line.type === "add"
                    ? "#66bb6a"
                    : line.type === "remove"
                    ? "#ef5350"
                    : "var(--text-secondary)",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              <span style={{ userSelect: "none", width: 14, display: "inline-block" }}>
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </span>
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

type DiffLine = { type: "add" | "remove" | "same"; text: string };

function computeDiffLines(old: string, new_: string): DiffLine[] {
  const oldLines = old.split("\n");
  const newLines = new_.split("\n");
  const result: DiffLine[] = [];

  // Simple line-by-line diff
  const maxLen = Math.max(oldLines.length, newLines.length);

  if (old === "") {
    // Pure addition
    for (const line of newLines) {
      result.push({ type: "add", text: line });
    }
    return result;
  }

  if (new_ === "") {
    // Pure deletion
    for (const line of oldLines) {
      result.push({ type: "remove", text: line });
    }
    return result;
  }

  // Show removed lines then added lines (unified style)
  for (const line of oldLines) {
    result.push({ type: "remove", text: line });
  }
  for (const line of newLines) {
    result.push({ type: "add", text: line });
  }

  return result;
}

// Write tool viewer
export function WriteViewer({
  input,
}: {
  input: Record<string, unknown>;
}) {
  const filePath = (input.file_path as string) ?? "";
  const content = (input.content as string) ?? "";
  const preview = content.length > 2000 ? content.slice(0, 2000) + "\n..." : content;

  return (
    <>
      {filePath && <div className="file-path">{filePath}</div>}
      <div className="diff-container">
        <div className="tool-content" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {preview}
        </div>
      </div>
    </>
  );
}
