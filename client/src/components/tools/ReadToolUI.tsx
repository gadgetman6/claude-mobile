import { makeAssistantToolUI } from "@assistant-ui/react";
import { useState } from "react";
import { SyntaxHighlight } from "@/components/SyntaxHighlight";
import { FileViewer } from "./FileViewer";

type ReadArgs = {
  file_path?: string;
};

export const ReadToolUI = makeAssistantToolUI<ReadArgs, string>({
  toolName: "Read",
  render: ({ args, result, status }) => {
    const [showViewer, setShowViewer] = useState(false);
    const filePath = args.file_path ?? "";
    const isRunning = status.type === "running";
    const content = typeof result === "string" ? result : undefined;
    const lineCount = content ? content.split("\n").length : 0;

    return (
      <>
        <div className="tool-block" style={{ cursor: content ? "pointer" : undefined }} onClick={() => content && setShowViewer(true)}>
          <div className="tool-header">
            <span className="tool-name">Read</span>
            <span className={`tool-status ${isRunning ? "running" : "done"}`}>
              {isRunning ? "running" : "done"}
            </span>
          </div>
          {filePath && <div className="file-path">{filePath}</div>}
          {content ? (
            <>
              <div style={{ maxHeight: 200, overflow: "hidden" }}>
                <SyntaxHighlight
                  code={content.length > 2000 ? content.slice(0, 2000) + "\n..." : content}
                  filePath={filePath}
                  maxHeight={200}
                />
              </div>
              <div style={{ padding: "4px 10px", fontSize: 10, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
                {lineCount} lines · tap to view full file
              </div>
            </>
          ) : isRunning ? (
            <div className="tool-content">
              <div className="spinner" />
            </div>
          ) : null}
        </div>
        {showViewer && content && <FileViewer filePath={filePath} content={content} onClose={() => setShowViewer(false)} />}
      </>
    );
  },
});
