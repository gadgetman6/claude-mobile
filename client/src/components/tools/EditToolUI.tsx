import { makeAssistantToolUI } from "@assistant-ui/react";
import ReactDiffViewer from "react-diff-viewer-continued";

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
  contentText: {
    fontSize: "12px",
    lineHeight: "1.4",
    fontFamily: '"SF Mono", "Fira Code", monospace',
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

export const EditToolUI = makeAssistantToolUI<EditArgs, string>({
  toolName: "Edit",
  render: ({ args, status }) => {
    const filePath = args.file_path ?? "";
    const oldStr = args.old_string ?? "";
    const newStr = args.new_string ?? "";
    const isRunning = status.type === "running";

    return (
      <div className="tool-block">
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
            />
          ) : isRunning ? (
            <div className="tool-content">
              <div className="spinner" />
            </div>
          ) : null}
        </div>
      </div>
    );
  },
});
