import { makeAssistantToolUI } from "@assistant-ui/react";
import { useState } from "react";
import { SyntaxHighlight } from "@/components/SyntaxHighlight";
import { FileViewer } from "./FileViewer";

type WriteArgs = {
  file_path?: string;
  content?: string;
};

export const WriteToolUI = makeAssistantToolUI<WriteArgs, string>({
  toolName: "Write",
  render: ({ args, status }) => {
    const [showViewer, setShowViewer] = useState(false);
    const filePath = args.file_path ?? "";
    const content = args.content ?? "";
    const isRunning = status.type === "running";
    const lineCount = content.split("\n").length;

    return (
      <>
        <div className="tool-block" style={{ cursor: content ? "pointer" : undefined }} onClick={() => content && setShowViewer(true)}>
          <div className="tool-header">
            <span className="tool-name">Write</span>
            <span className={`tool-status ${isRunning ? "running" : "done"}`}>
              {isRunning ? "running" : "done"}
            </span>
          </div>
          {filePath && <div className="file-path">{filePath}</div>}
          <div className="diff-container" style={{ maxHeight: 200 }}>
            {content ? (
              <SyntaxHighlight
                code={content.length > 2000 ? content.slice(0, 2000) + "\n..." : content}
                filePath={filePath}
                maxHeight={200}
              />
            ) : isRunning ? (
              <div className="tool-content"><div className="spinner" /></div>
            ) : null}
          </div>
          {content && (
            <div style={{ padding: "4px 10px", fontSize: 10, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
              {lineCount} lines · tap to view full file
            </div>
          )}
        </div>
        {showViewer && <FileViewer filePath={filePath} content={content} onClose={() => setShowViewer(false)} />}
      </>
    );
  },
});
