import { makeAssistantToolUI } from "@assistant-ui/react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

type Todo = {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
};

type TodoWriteArgs = {
  todos?: Todo[];
};

const statusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} style={{ color: "#86efac", flexShrink: 0 }} />;
    case "in_progress":
      return <Loader2 size={14} style={{ color: "var(--warning)", flexShrink: 0, animation: "spin 1s linear infinite" }} />;
    default:
      return <Circle size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />;
  }
};

export const TodoToolUI = makeAssistantToolUI<TodoWriteArgs, string>({
  toolName: "TodoWrite",
  render: ({ args, status }) => {
    const todos = args.todos ?? [];
    const isRunning = status.type === "running";
    const completed = todos.filter((t) => t.status === "completed").length;

    return (
      <div className="tool-block">
        <div className="tool-header">
          <span className="tool-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Tasks
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
              {completed}/{todos.length}
            </span>
          </span>
          <span className={`tool-status ${isRunning ? "running" : "done"}`}>
            {isRunning ? "updating" : completed === todos.length ? "done" : "in progress"}
          </span>
        </div>
        <div style={{ padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {todos.map((todo, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 0",
                opacity: todo.status === "completed" ? 0.6 : 1,
              }}
            >
              {statusIcon(todo.status)}
              <span
                style={{
                  fontSize: 12,
                  color: todo.status === "completed" ? "var(--text-muted)" : "var(--text-primary)",
                  textDecoration: todo.status === "completed" ? "line-through" : "none",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                }}
              >
                {todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  },
});
