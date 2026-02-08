import { makeAssistantToolUI } from "@assistant-ui/react";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import ReactDiffViewer from "react-diff-viewer-continued";
import { useDiffHighlighter, getLangFromPath } from "@/components/SyntaxHighlight";

type EditArgs = {
  file_path?: string;
  old_string?: string;
  new_string?: string;
};

const diffStyles = {
  variables: {
    dark: {
      diffViewerBackground: "var(--tool-bg)",
      gutterBackground: "var(--bg-secondary)",
      addedBackground: "rgba(76, 175, 80, 0.12)",
      addedColor: "#66bb6a",
      removedBackground: "rgba(244, 67, 54, 0.12)",
      removedColor: "#ef5350",
      wordAddedBackground: "rgba(76, 175, 80, 0.25)",
      wordRemovedBackground: "rgba(244, 67, 54, 0.25)",
      addedGutterBackground: "rgba(76, 175, 80, 0.08)",
      removedGutterBackground: "rgba(244, 67, 54, 0.08)",
      gutterColor: "var(--text-muted)",
      codeFoldBackground: "var(--bg-tertiary)",
      codeFoldGutterBackground: "var(--bg-tertiary)",
      codeFoldContentColor: "var(--text-muted)",
      emptyLineBackground: "var(--tool-bg)",
    },
  },
  diffContainer: {
    tableLayout: "auto",
    width: "auto",
    minWidth: "100%",
    "& pre": {
      whiteSpace: "pre",
    },
  },
  lineContent: {
    overflow: "visible",
    width: "auto",
  },
  contentText: {
    fontSize: "12px",
    lineHeight: "1.4",
    fontFamily: '"SF Mono", "Fira Code", monospace',
    whiteSpace: "pre",
    lineBreak: "auto",
  },
  gutter: {
    minWidth: "28px",
    padding: "0 4px",
    fontSize: "10px",
  },
  line: {
    padding: "0 6px",
  },
};

function DiffViewer({ filePath, oldStr, newStr, onClose }: { filePath: string; oldStr: string; newStr: string; onClose: () => void }) {
  const renderContent = useDiffHighlighter(filePath);
  const lang = getLangFromPath(filePath);
  const addedLines = newStr.split("\n").filter((l, i) => !oldStr.split("\n").includes(l)).length;
  const removedLines = oldStr.split("\n").filter((l, i) => !newStr.split("\n").includes(l)).length;

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
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {addedLines > 0 && <span style={{ fontSize: 10, color: "#66bb6a" }}>+{addedLines}</span>}
          {removedLines > 0 && <span style={{ fontSize: 10, color: "#ef5350" }}>-{removedLines}</span>}
          <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 6px", background: "var(--bg-tertiary)", borderRadius: 4 }}>
            {lang}
          </span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", WebkitOverflowScrolling: "touch" }}>
        <ReactDiffViewer
          oldValue={oldStr}
          newValue={newStr}
          splitView={false}
          useDarkTheme={true}
          showDiffOnly={false}
          styles={diffStyles}
          hideLineNumbers={false}
          renderContent={renderContent}
        />
      </div>
    </div>
  );
}

export const EditToolUI = makeAssistantToolUI<EditArgs, string>({
  toolName: "Edit",
  render: ({ args, status }) => {
    const [showViewer, setShowViewer] = useState(false);
    const filePath = args.file_path ?? "";
    const oldStr = args.old_string ?? "";
    const newStr = args.new_string ?? "";
    const isRunning = status.type === "running";
    const renderContent = useDiffHighlighter(filePath);

    return (
      <>
        <div className="tool-block" style={{ cursor: oldStr || newStr ? "pointer" : undefined }} onClick={() => (oldStr || newStr) && setShowViewer(true)}>
          <div className="tool-header">
            <span className="tool-name">Edit</span>
            <span className={`tool-status ${isRunning ? "running" : "done"}`}>
              {isRunning ? "running" : "done"}
            </span>
          </div>
          {filePath && <div className="file-path">{filePath}</div>}
          <div className="diff-container">
            {oldStr || newStr ? (
              <ReactDiffViewer
                oldValue={oldStr}
                newValue={newStr}
                splitView={false}
                useDarkTheme={true}
                showDiffOnly={true}
                styles={diffStyles}
                hideLineNumbers={false}
                renderContent={renderContent}
              />
            ) : isRunning ? (
              <div className="tool-content">
                <div className="spinner" />
              </div>
            ) : null}
          </div>
          {(oldStr || newStr) && (
            <div style={{ padding: "4px 10px", fontSize: 10, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
              tap to view full diff
            </div>
          )}
        </div>
        {showViewer && <DiffViewer filePath={filePath} oldStr={oldStr} newStr={newStr} onClose={() => setShowViewer(false)} />}
      </>
    );
  },
});
