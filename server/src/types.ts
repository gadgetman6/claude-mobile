import type { PermissionMode, ModelInfo, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// Client → Server messages
export type ClientMessage =
  | {
      type: "start_session";
      cwd: string;
      model?: string;
      permissionMode?: PermissionMode;
      enable1mContext?: boolean;
      resume?: string; // session ID to resume
    }
  | { type: "user_message"; content: string }
  | { type: "list_sessions"; cwd: string }
  | {
      type: "permission_response";
      toolUseId: string;
      allow: boolean;
      updatedInput?: Record<string, unknown>;
      denyMessage?: string;
    }
  | {
      type: "ask_question_response";
      toolUseId: string;
      questions: unknown[];
      answers: Record<string, string>;
    }
  | { type: "interrupt" }
  | { type: "set_model"; model: string }
  | { type: "set_permission_mode"; mode: PermissionMode }
  | { type: "set_1m_context"; enabled: boolean }
  | { type: "set_thinking_tokens"; tokens: number | null }
  | { type: "get_models" }
  | { type: "get_git_status"; cwd?: string }
  | { type: "reconnect" };

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
  | { type: "session_history"; messages: HistoryMessage[] }
  | { type: "session_state"; sessionId: string; cwd: string; model: string; permissionMode: string; isStreaming: boolean }
  | { type: "ping" };

export type HistoryMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; blocks: HistoryBlock[] };

export type HistoryBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown>; result?: string };

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  contextWindow: number;
  maxOutputTokens: number;
};
