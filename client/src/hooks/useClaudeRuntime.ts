import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { ThreadMessageLike } from "@assistant-ui/react";

type ClaudeRuntimeOptions = {
  messages: ThreadMessageLike[];
  isRunning: boolean;
  onNew: (content: string) => void;
  onCancel: () => void;
};

export function useClaudeRuntime({ messages, isRunning, onNew, onCancel }: ClaudeRuntimeOptions) {
  return useExternalStoreRuntime({
    messages,
    isRunning,
    convertMessage: (msg) => msg,
    onNew: async (message) => {
      // Extract text from the message content
      if (message.role !== "user") return;
      const text = message.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      if (text) onNew(text);
    },
    onCancel: async () => {
      onCancel();
    },
  });
}
