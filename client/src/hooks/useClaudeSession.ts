import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ModelInfo,
  PermissionMode,
  PermissionRequest,
  ServerMessage,
  TokenUsage,
  SDKPartialMessage,
  SDKAssistantMessage,
  ContentBlock,
} from "../types";
import type { ThreadMessageLike } from "@assistant-ui/react";

// --- Session persistence ---

const STORAGE_KEY = "claude-mobile-session";

type SavedSession = {
  sessionId: string;
  cwd: string;
  model: string;
  permissionMode: PermissionMode;
};

function saveSession(session: SavedSession) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch {}
}

function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearSavedSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function getSavedSession(): SavedSession | null {
  return loadSavedSession();
}

// --- Context for nested content (TaskToolUI) ---

export type ClaudeSessionContextType = {
  nestedContentMap: Map<string, ThreadMessageLike[]>;
  nestedContentVersion: number;
};

export const ClaudeSessionContext = createContext<ClaudeSessionContextType>({
  nestedContentMap: new Map(),
  nestedContentVersion: 0,
});

export function useClaudeSessionContext() {
  return useContext(ClaudeSessionContext);
}

// --- Connection state ---

export type ConnectionState = "connecting" | "connected" | "disconnected";

// --- Internal streaming block types ---

type StreamBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      inputJson: string;
      result?: string;
      isRunning: boolean;
    };

// --- Empty usage ---

const emptyUsage: TokenUsage = {
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
  cacheCreationTokens: 0, costUsd: 0, contextWindow: 0, maxOutputTokens: 0,
};

// --- Hook ---

export function useClaudeSession() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [usage, setUsage] = useState<TokenUsage>({ ...emptyUsage });
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("default");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [gitStatus, setGitStatus] = useState<{ status: string; diff: string; branch: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [maxThinkingTokens, setMaxThinkingTokens] = useState<number | null>(null);
  const nestedContentMapRef = useRef(new Map<string, ThreadMessageLike[]>());
  const [nestedContentVersion, setNestedContentVersion] = useState(0);

  // Streaming accumulation refs (mutable for performance)
  const streamingBlocksRef = useRef<StreamBlock[]>([]);
  const streamingUuidRef = useRef<string>("");
  const partialJsonRef = useRef<Map<number, string>>(new Map());
  const activeTaskIdRef = useRef<string | null>(null);

  // Socket ref
  const socketRef = useRef<Socket | null>(null);

  // --- Convert StreamBlock[] to ThreadMessageLike content parts ---

  const blocksToContent = useCallback((blocks: StreamBlock[]): ThreadMessageLike["content"] => {
    const parts: ThreadMessageLike["content"] & unknown[] = [];
    for (const b of blocks) {
      if (b.type === "text" && b.text) {
        parts.push({ type: "text" as const, text: b.text });
      } else if (b.type === "thinking" && b.thinking) {
        parts.push({ type: "reasoning" as const, text: b.thinking });
      } else if (b.type === "tool_use") {
        parts.push({
          type: "tool-call" as const,
          toolCallId: b.id,
          toolName: b.name,
          args: b.input as any,
          argsText: b.inputJson,
          result: b.result,
        });
      }
    }
    return parts;
  }, []);

  // --- Convert ContentBlock[] from SDK assistant message ---

  const contentBlocksToContent = useCallback((content: ContentBlock[]): ThreadMessageLike["content"] => {
    const parts: ThreadMessageLike["content"] & unknown[] = [];
    for (const block of content) {
      if (block.type === "text" && block.text) {
        parts.push({ type: "text" as const, text: block.text });
      } else if (block.type === "thinking" && block.thinking) {
        parts.push({ type: "reasoning" as const, text: block.thinking });
      } else if (block.type === "tool_use") {
        parts.push({
          type: "tool-call" as const,
          toolCallId: block.id,
          toolName: block.name,
          args: block.input as any,
          argsText: JSON.stringify(block.input, null, 2),
        });
      }
    }
    return parts;
  }, []);

  // --- SDK message handler ---

  const handleSdkMessage = useCallback((msg: Record<string, unknown>) => {
    if (!msg?.type) return;

    switch (msg.type as string) {
      case "system": {
        const subtype = msg.subtype as string;
        if (subtype === "init") {
          const model = (msg.model as string) ?? "";
          const mode = (msg.permissionMode as PermissionMode) ?? "default";
          setCurrentModel(model);
          setPermissionMode(mode);
          if (msg.session_id) {
            setSessionId(msg.session_id as string);
            saveSession({
              sessionId: msg.session_id as string,
              cwd: (msg.cwd as string) ?? "",
              model,
              permissionMode: mode,
            });
          }
          setMessages((prev) => {
            if (prev.some((m) => m.role === "system")) return prev;
            return [...prev, { role: "system" as const, content: `Session initialized. Model: ${model}` }];
          });
        } else if (subtype === "status") {
          const status = msg.status as string | null;
          setIsCompacting(status === "compacting");
          if (status === "compacting") {
            setMessages((prev) => [...prev, { role: "system" as const, content: "Compacting conversation..." }]);
          }
        } else if (subtype === "compact_boundary") {
          setIsCompacting(false);
          setMessages((prev) => [...prev, { role: "system" as const, content: "Context compacted" }]);
        }
        break;
      }

      case "user": {
        const parentId = msg.parent_tool_use_id as string | null;
        if (parentId) break; // Skip subagent user messages
        if (msg.isReplay) {
          const raw = (msg.message as Record<string, unknown>)?.content;
          const content = typeof raw === "string"
            ? raw
            : Array.isArray(raw)
              ? raw.filter((b: Record<string, unknown>) => b.type === "text").map((b: Record<string, unknown>) => b.text).join("\n") || ""
              : "";
          if (content) {
            setMessages((prev) => [...prev, { role: "user" as const, content }]);
          }
        }
        break;
      }

      case "assistant": {
        const aMsg = msg as unknown as SDKAssistantMessage;
        const parentId = aMsg.parent_tool_use_id;
        const content = contentBlocksToContent(aMsg.message.content);
        if ((content as unknown[]).length === 0) break;

        if (parentId) {
          // Subagent response — store in nested content map for TaskToolUI
          const existing = nestedContentMapRef.current.get(parentId) ?? [];
          nestedContentMapRef.current.set(parentId, [
            ...existing,
            { role: "assistant" as const, id: aMsg.uuid, content },
          ]);
          setNestedContentVersion((v) => v + 1);
        } else if (!streamingBlocksRef.current.length) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant" as const, id: aMsg.uuid, content },
          ]);
        }
        break;
      }

      case "stream_event": {
        const parentId = (msg as any).parent_tool_use_id as string | null;
        if (parentId) {
          // Subagent stream event — skip main streaming, handled via assistant messages
          break;
        }
        setIsStreaming(true);
        handleStreamEvent(msg as unknown as SDKPartialMessage);
        break;
      }

      case "result": {
        setIsStreaming(false);
        const result = msg.result as string | undefined;
        const cost = msg.total_cost_usd as number | undefined;
        const duration = msg.duration_ms as number | undefined;
        const turns = msg.num_turns as number | undefined;
        const errors = msg.errors as string[] | undefined;
        const parts: string[] = [];
        if (result) parts.push(result);
        if (cost) parts.push(`Cost: $${cost.toFixed(4)}`);
        if (duration) parts.push(`Duration: ${(duration / 1000).toFixed(1)}s`);
        if (turns) parts.push(`Turns: ${turns}`);
        if (errors?.length) parts.push(`Errors: ${errors.join(", ")}`);
        setMessages((prev) => [
          ...prev,
          { role: "system" as const, content: parts.join(" · ") || "Done" },
        ]);
        break;
      }
    }
  }, [contentBlocksToContent]);

  // --- Stream event handler ---

  const handleStreamEvent = useCallback((msg: SDKPartialMessage) => {
    const event = msg.event as Record<string, unknown>;
    if (!event) return;
    const eventType = event.type as string;

    if (eventType === "message_start") {
      streamingUuidRef.current = msg.uuid ?? crypto.randomUUID();
      streamingBlocksRef.current = [];
      partialJsonRef.current.clear();
      activeTaskIdRef.current = null;
      setMessages((prev) => [
        ...prev,
        { role: "assistant" as const, id: streamingUuidRef.current, content: [] },
      ]);
    } else if (eventType === "content_block_start") {
      const block = event.content_block as Record<string, unknown>;
      const blockType = block?.type as string;
      const index = event.index as number;

      if (blockType === "text") {
        streamingBlocksRef.current.push({ type: "text", text: (block.text as string) ?? "" });
      } else if (blockType === "thinking") {
        streamingBlocksRef.current.push({ type: "thinking", thinking: (block.thinking as string) ?? "" });
      } else if (blockType === "tool_use") {
        partialJsonRef.current.set(index, "");
        const toolId = (block.id as string) ?? "";
        const toolName = (block.name as string) ?? "";
        streamingBlocksRef.current.push({
          type: "tool_use",
          id: toolId,
          name: toolName,
          input: (block.input as Record<string, unknown>) ?? {},
          inputJson: "",
          isRunning: true,
        });
        if (toolName === "Task") {
          activeTaskIdRef.current = toolId;
        }
      }
      updateStreamingUI();
    } else if (eventType === "content_block_delta") {
      const delta = event.delta as Record<string, unknown>;
      const idx = event.index as number;
      const deltaType = delta?.type as string;

      const allBlocks = streamingBlocksRef.current;
      if (idx < allBlocks.length) {
        const block = allBlocks[idx];
        if (deltaType === "text_delta" && block.type === "text") {
          block.text += (delta.text as string) ?? "";
        } else if (deltaType === "thinking_delta" && block.type === "thinking") {
          block.thinking += (delta.thinking as string) ?? "";
        } else if (deltaType === "input_json_delta" && block.type === "tool_use") {
          const current = partialJsonRef.current.get(idx) ?? "";
          const updated = current + ((delta.partial_json as string) ?? "");
          partialJsonRef.current.set(idx, updated);
          block.inputJson = updated;
          try { block.input = JSON.parse(updated); } catch {}
        }
      }
      updateStreamingUI();
    } else if (eventType === "content_block_stop") {
      const idx = event.index as number;
      const allBlocks = streamingBlocksRef.current;
      if (idx < allBlocks.length) {
        const block = allBlocks[idx];
        if (block.type === "tool_use" && block.name !== "Task") {
          block.isRunning = false;
        }
      }
      updateStreamingUI();
    } else if (eventType === "message_stop") {
      setIsStreaming(false);
      activeTaskIdRef.current = null;
      const finalBlocks = streamingBlocksRef.current.map((b) => ({ ...b }));
      streamingBlocksRef.current = [];
      partialJsonRef.current.clear();
      const content = blocksToContent(finalBlocks);
      const uuid = streamingUuidRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" && m.id === uuid
            ? { ...m, content, status: { type: "complete" as const, reason: "stop" as const } }
            : m
        )
      );
    }
  }, [blocksToContent]);

  const updateStreamingUI = useCallback(() => {
    const uuid = streamingUuidRef.current;
    const content = blocksToContent(
      streamingBlocksRef.current.map((b) => ({ ...b }))
    );
    setMessages((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant" && prev[i].id === uuid) {
          idx = i;
          break;
        }
      }
      const newMsg: ThreadMessageLike = {
        role: "assistant",
        id: uuid,
        content,
        status: { type: "running" },
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = newMsg;
        return next;
      }
      return [...prev, newMsg];
    });
  }, [blocksToContent]);

  // --- Handle server message ---

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "sdk_message":
        handleSdkMessage(msg.message as Record<string, unknown>);
        break;
      case "permission_request":
        setPendingPermission({
          toolUseId: msg.toolUseId,
          toolName: msg.toolName,
          input: msg.input,
          description: msg.description,
          decisionReason: msg.decisionReason,
        });
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          new Notification("Claude needs your input", {
            body: `Permission requested for: ${msg.toolName}`,
            tag: "permission-request",
          });
        }
        break;
      case "token_usage":
        setUsage(msg.usage);
        break;
      case "models":
        setModels(msg.models);
        break;
      case "git_status":
        setGitStatus({ status: msg.status, diff: msg.diff, branch: msg.branch });
        break;
      case "session_history": {
        // Convert server history entries to ThreadMessageLike[]
        const entries = (msg as any).messages as Array<any>;
        const converted: ThreadMessageLike[] = entries.map((entry: any) => {
          if (entry.role === "user") {
            return { role: "user" as const, content: entry.content };
          }
          if (entry.role === "assistant") {
            // content is already in the right shape: text/reasoning/tool-call parts
            return { role: "assistant" as const, id: crypto.randomUUID(), content: entry.content };
          }
          // system
          return { role: "system" as const, content: entry.content };
        });
        setMessages(converted);
        break;
      }
      case "session_state": {
        setSessionId(msg.sessionId);
        setCurrentModel(msg.model);
        setPermissionMode(msg.permissionMode as PermissionMode);
        setIsStreaming(msg.isStreaming);
        saveSession({
          sessionId: msg.sessionId,
          cwd: msg.cwd,
          model: msg.model,
          permissionMode: msg.permissionMode as PermissionMode,
        });
        break;
      }
      case "session_started":
        setSessionId(msg.sessionId);
        setError(null);
        break;
      case "session_ended":
        setIsStreaming(false);
        setSessionId(null);
        break;
      case "error":
        setError(msg.message);
        break;
    }
  }, [handleSdkMessage]);

  // Stable ref for handleMessage so Socket.IO listener doesn't re-register
  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  // --- Socket.IO connection ---

  useEffect(() => {
    setConnectionState("connecting");
    console.log("[socket] Creating connection to", window.location.origin);
    const socket = io(window.location.origin, {
      path: "/engine.io/",
      transports: ["polling", "websocket"],
      autoConnect: true,
      forceNew: true,
    });
    socketRef.current = socket;

    socket.io.on("error", (err: Error) => {
      console.error("[socket] Engine error:", err.message);
    });

    socket.on("connect", () => {
      console.log("[socket] Connected! id:", socket.id);
      setConnectionState("connected");
      // Auto-reconnect to existing session
      const saved = loadSavedSession();
      if (saved) {
        socket.emit("reconnect_request");
      }
    });

    socket.on("disconnect", () => {
      setConnectionState("disconnected");
    });

    socket.on("connect_error", (err: Error) => {
      console.error("[socket] Connect error:", err.message);
      setConnectionState("disconnected");
    });

    socket.on("message", (msg: ServerMessage) => {
      handleMessageRef.current(msg);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // --- Emit helpers ---

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  // --- Actions ---

  const startSession = useCallback(
    (cwd: string, model?: string, mode?: PermissionMode, enable1m?: boolean, resume?: string) => {
      setMessages([]);
      setUsage({ ...emptyUsage });
      nestedContentMapRef.current.clear();
      setNestedContentVersion(0);
      emit("start_session", { cwd, model, permissionMode: mode, enable1mContext: enable1m, resume });
    },
    [emit]
  );

  const sendMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [...prev, { role: "user" as const, content }]);
      emit("user_message", { content });
    },
    [emit]
  );

  const respondPermission = useCallback(
    (toolUseId: string, allow: boolean, denyMessage?: string) => {
      emit("permission_response", { toolUseId, allow, denyMessage });
      setPendingPermission(null);
    },
    [emit]
  );

  const respondAskQuestion = useCallback(
    (toolUseId: string, questions: unknown[], answers: Record<string, string>) => {
      emit("ask_question_response", { toolUseId, questions, answers });
      setPendingPermission(null);
    },
    [emit]
  );

  const interrupt = useCallback(() => { emit("interrupt"); }, [emit]);

  const changeModel = useCallback(
    (model: string) => { emit("set_model", { model }); setCurrentModel(model); },
    [emit]
  );

  const changePermissionMode = useCallback(
    (mode: PermissionMode) => {
      emit("set_permission_mode", { mode });
      setPermissionMode(mode);
      const saved = loadSavedSession();
      if (saved) saveSession({ ...saved, permissionMode: mode });
    },
    [emit]
  );

  const changeThinkingTokens = useCallback(
    (tokens: number | null) => {
      emit("set_thinking_tokens", { tokens });
      setMaxThinkingTokens(tokens);
    },
    [emit]
  );

  const fetchGitStatus = useCallback((cwd?: string) => { emit("get_git_status", { cwd }); }, [emit]);
  const fetchModels = useCallback(() => { emit("get_models"); }, [emit]);

  return {
    connectionState,
    sessionId,
    isStreaming,
    isCompacting,
    messages,
    usage,
    models,
    currentModel,
    permissionMode,
    pendingPermission,
    error,
    gitStatus,
    maxThinkingTokens,
    nestedContentMap: nestedContentMapRef.current,
    nestedContentVersion,
    startSession,
    sendMessage,
    respondPermission,
    respondAskQuestion,
    interrupt,
    changeModel,
    changePermissionMode,
    changeThinkingTokens,
    fetchGitStatus,
    fetchModels,
  };
}
