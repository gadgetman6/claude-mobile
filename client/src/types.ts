// Mirrors server/src/types.ts but without SDK dependency
// We receive these as JSON over Socket.IO

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  contextWindow: number;
  maxOutputTokens: number;
  currentContextTokens: number;
};

export type ModelInfo = {
  value: string;
  displayName: string;
  description: string;
};

// SDK message types (simplified for client rendering)
export type SDKMessage =
  | SDKSystemMessage
  | SDKAssistantMessage
  | SDKPartialMessage
  | SDKResultMessage
  | SDKUserMessage
  | SDKStatusMessage
  | SDKToolProgressMessage
  | SDKGenericMessage;

export type SDKSystemMessage = {
  type: "system";
  subtype: "init" | "compact_boundary" | "status" | string;
  session_id: string;
  uuid: string;
  model?: string;
  permissionMode?: PermissionMode;
  tools?: string[];
  [key: string]: unknown;
};

export type SDKAssistantMessage = {
  type: "assistant";
  uuid: string;
  session_id: string;
  parent_tool_use_id: string | null;
  message: {
    role: "assistant";
    content: ContentBlock[];
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    [key: string]: unknown;
  };
};

export type SDKPartialMessage = {
  type: "stream_event";
  event: StreamEvent;
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
};

export type SDKResultMessage = {
  type: "result";
  subtype: "success" | string;
  uuid: string;
  session_id: string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  usage?: Record<string, number>;
  modelUsage?: Record<string, ModelUsageInfo>;
  errors?: string[];
};

export type SDKUserMessage = {
  type: "user";
  uuid: string;
  session_id: string;
  message: {
    role: "user";
    content: string | ContentBlock[];
  };
  [key: string]: unknown;
};

export type SDKStatusMessage = {
  type: "system";
  subtype: "status";
  status: "compacting" | null;
  uuid: string;
  session_id: string;
};

export type SDKToolProgressMessage = {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  elapsed_time_seconds: number;
  uuid: string;
  session_id: string;
};

export type SDKGenericMessage = {
  type: string;
  [key: string]: unknown;
};

export type ModelUsageInfo = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
  contextWindow: number;
  maxOutputTokens: number;
};

// Content block types from Anthropic API
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock;

export type TextBlock = {
  type: "text";
  text: string;
};

export type ThinkingBlock = {
  type: "thinking";
  thinking: string;
};

export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
};

// Stream event types
export type StreamEvent =
  | { type: "message_start"; message: { usage?: Record<string, number>; [key: string]: unknown } }
  | { type: "content_block_start"; index: number; content_block: ContentBlock }
  | { type: "content_block_delta"; index: number; delta: ContentDelta }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason?: string }; usage?: Record<string, number> }
  | { type: "message_stop" }
  | { type: string; [key: string]: unknown };

export type ContentDelta =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; thinking: string }
  | { type: "input_json_delta"; partial_json: string };

// Server messages (Socket.IO "message" event payload)
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
  | { type: "token_usage"; usage: TokenUsage }
  | { type: "models"; models: ModelInfo[] }
  | { type: "git_status"; status: string; diff: string; branch: string }
  | { type: "error"; message: string }
  | { type: "session_started"; sessionId: string }
  | { type: "session_ended"; reason: string }
  | { type: "session_state"; sessionId: string; cwd: string; model: string; permissionMode: string; isStreaming: boolean }
  | { type: "session_history"; messages: HistoryEntry[] };

export type HistoryEntry =
  | { role: "user"; content: string }
  | { role: "assistant"; content: HistoryContentPart[] }
  | { role: "system"; content: string };

export type HistoryContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown>; result?: string };

// Permission request for display
export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  description?: string;
  decisionReason?: string;
};
