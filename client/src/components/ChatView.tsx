import { useEffect, useRef } from "react";
import type { AccumulatedMessage } from "../types";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolUseBlock } from "./ToolUseBlock";
import { TaskCard } from "./TaskCard";

export function ChatView({ messages }: { messages: AccumulatedMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-area">
      {messages.map((msg, i) => (
        <MessageItem key={i} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageItem({ message }: { message: AccumulatedMessage }) {
  switch (message.role) {
    case "user":
      return <div className="msg msg-user">{message.content}</div>;

    case "system":
      return <div className="msg msg-system">{message.text}</div>;

    case "result":
      return (
        <div className={`msg msg-result ${message.errors?.length ? "has-errors" : ""}`}>
          {message.errors?.length ? (
            <div style={{ color: "var(--danger)" }}>
              {message.errors.join(", ")}
            </div>
          ) : null}
          <div className="msg-result-meta">
            {message.cost != null && <span>${message.cost.toFixed(4)}</span>}
            {message.duration != null && <span>{(message.duration / 1000).toFixed(1)}s</span>}
            {message.turns != null && <span>{message.turns} turns</span>}
          </div>
        </div>
      );

    case "assistant":
      return (
        <div className="msg msg-assistant">
          {message.blocks.map((block, i) => {
            switch (block.type) {
              case "text":
                return (
                  <div
                    key={i}
                    className={`text-block ${message.isStreaming && i === message.blocks.length - 1 ? "streaming-cursor" : ""}`}
                  >
                    {block.text}
                  </div>
                );

              case "thinking":
                return (
                  <ThinkingBlock
                    key={i}
                    thinking={block.thinking}
                    defaultOpen={block.isOpen}
                  />
                );

              case "tool_use":
                return block.name === "Task" ? (
                  <TaskCard key={i} block={block} />
                ) : (
                  <ToolUseBlock key={i} block={block} />
                );

              default:
                return null;
            }
          })}
        </div>
      );
  }
}
