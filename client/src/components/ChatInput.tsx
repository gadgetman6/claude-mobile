import { useCallback, useRef, useState } from "react";

export function ChatInput({
  onSend,
  onInterrupt,
  isStreaming,
  disabled,
}: {
  onSend: (message: string) => void;
  onInterrupt: () => void;
  isStreaming: boolean;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const msg = text.trim();
    if (!msg || disabled) return;
    onSend(msg);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) return;
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div className="chat-input-area">
      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="Message Claude..."
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />
        {isStreaming ? (
          <button className="send-btn interrupt" onClick={onInterrupt} title="Interrupt">
            &#9632;
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            title="Send"
          >
            &#9650;
          </button>
        )}
      </div>
    </div>
  );
}
