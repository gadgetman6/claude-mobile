import { ArrowLeft } from "lucide-react";
import { SyntaxHighlight, getLangFromPath } from "@/components/SyntaxHighlight";

export function FileViewer({ filePath, content, onClose }: { filePath: string; content: string; onClose: () => void }) {
  const lang = getLangFromPath(filePath);
  const lineCount = content.split("\n").length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-primary)",
            cursor: "pointer",
            padding: 4,
            display: "flex",
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {filePath.split("/").pop()}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {filePath}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{lineCount} lines</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 6px", background: "var(--bg-tertiary)", borderRadius: 4 }}>
            {lang}
          </span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", WebkitOverflowScrolling: "touch" }}>
        <SyntaxHighlight code={content} filePath={filePath} fontSize={12} />
      </div>
    </div>
  );
}
