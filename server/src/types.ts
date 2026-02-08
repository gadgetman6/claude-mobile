import type { PermissionMode, ModelInfo, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// Server → Client messages
export type ServerMessage =
  | { type: "sdk_message"; message: SDKMessage }
  | {
      type: "permission_request";
      toolUseId: string;
      toolName: string;
      input: Record<string, unknown>;
      description?: string;
      decisionReason?: string;
    }
  | {
      type: "token_usage";
      usage: TokenUsage;
    }
  | { type: "models"; models: ModelInfo[] }
  | {
      type: "git_status";
      status: string;
      diff: string;
      branch: string;
    }
  | { type: "error"; message: string }
  | { type: "session_started"; sessionId: string }
  | { type: "session_ended"; reason: string }
  | { type: "session_state"; sessionId: string; cwd: string; model: string; permissionMode: string; isStreaming: boolean }
  | { type: "session_history"; messages: HistoryEntry[] };

// Assembled conversation messages for reconnect replay
export type HistoryEntry =
  | { role: "user"; content: string }
  | { role: "assistant"; content: HistoryContentPart[] }
  | { role: "system"; content: string };

export type HistoryContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown>; result?: string };

// Content blocks for user messages (text + images)
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  contextWindow: number;
  maxOutputTokens: number;
};
