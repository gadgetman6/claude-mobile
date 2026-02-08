import { makeAssistantToolUI } from "@assistant-ui/react";

type ReadArgs = {
  file_path?: string;
};

export const ReadToolUI = makeAssistantToolUI<ReadArgs, string>({
  toolName: "Read",
  render: ({ args, status }) => {
    const filePath = args.file_path ?? "";
    const isRunning = status.type === "running";

    return (
      <div className="tool-block">
        <div className="tool-header">
          <span className="tool-name">Read</span>
          <span className={`tool-status ${isRunning ? "running" : "done"}`}>
            {isRunning ? "running" : "done"}
          </span>
        </div>
        {filePath && <div className="file-path">{filePath}</div>}
        {isRunning && (
          <div className="tool-content">
            <div className="spinner" />
          </div>
        )}
      </div>
    );
  },
});
