import { makeAssistantToolUI } from "@assistant-ui/react";

type WriteArgs = {
  file_path?: string;
  content?: string;
};

export const WriteToolUI = makeAssistantToolUI<WriteArgs, string>({
  toolName: "Write",
  render: ({ args, status }) => {
    const filePath = args.file_path ?? "";
    const content = args.content ?? "";
    const preview =
      content.length > 2000 ? content.slice(0, 2000) + "\n..." : content;
    const isRunning = status.type === "running";

    return (
      <div className="tool-block">
        <div className="tool-header">
          <span className="tool-name">Write</span>
          <span className={`tool-status ${isRunning ? "running" : "done"}`}>
            {isRunning ? "running" : "done"}
          </span>
        </div>
        {filePath && <div className="file-path">{filePath}</div>}
        <div className="diff-container">
          <div
            className="tool-content"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
          >
            {preview || (isRunning ? <div className="spinner" /> : null)}
          </div>
        </div>
      </div>
    );
  },
});
