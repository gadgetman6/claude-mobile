import { useState } from "react";

export function ThinkingBlock({
  thinking,
  defaultOpen,
}: {
  thinking: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="thinking-block">
      <div className="thinking-header" onClick={() => setOpen(!open)}>
        <span className={`thinking-chevron ${open ? "open" : ""}`}>
          &#9654;
        </span>
        <span>Thinking{thinking.length > 0 ? ` (${thinking.length} chars)` : "..."}</span>
      </div>
      {open && (
        <div className="thinking-content">{thinking || "..."}</div>
      )}
    </div>
  );
}
