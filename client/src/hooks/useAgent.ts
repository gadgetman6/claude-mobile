import { useCallback, useRef, useState } from "react";
import type {
  AccumulatedBlock,
  AccumulatedMessage,
  ModelInfo,
  PermissionMode,
  PermissionRequest,
  ServerMessage,
  TokenUsage,
  SDKPartialMessage,
  SDKAssistantMessage,
  ContentBlock,
} from "../types";
import { useWebSocket } from "./useWebSocket";

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

const emptyUsage: TokenUsage = {
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
  cacheCreationTokens: 0, costUsd: 0, contextWindow: 0, maxOutputTokens: 0,
};

export function useAgent() {
  const [messages, setMessages] = useState<AccumulatedMessage[]>([]);
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

  // Streaming state
  const streamingBlocksRef = useRef<AccumulatedBlock[]>([]);
  const streamingUuidRef = useRef<string>("");
  const partialJsonRef = useRef<Map<number, string>>(new Map());
  // Track parent_tool_use_id for subagent nesting
  const currentParentToolUseIdRef = useRef<string | null>(null);
  // Nested streaming blocks for subagents (keyed by parent tool_use_id)
  const nestedStreamingRef = useRef<AccumulatedBlock[]>([]);

  // --- Message handlers ---

  const parseHistoryBlocks = useCallback((rawBlocks: any[]): AccumulatedBlock[] => {
    return (rawBlocks ?? []).map((b: any): AccumulatedBlock => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "thinking") return { type: "thinking", thinking: b.thinking, isOpen: false };
      if (b.type === "tool_use") {
        return {
          type: "tool_use", id: "", name: b.name,
          input: b.input ?? {}, inputJson: JSON.stringify(b.input ?? {}, null, 2),
          result: b.result, isRunning: false,
        };
      }
      return { type: "text", text: "" };
    }).filter((b: AccumulatedBlock) => !(b.type === "text" && !b.text));
  }, []);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "sdk_message":
        handleSdkMessage(msg.message as any);
        break;
      case "permission_request":
        setPendingPermission({
          toolUseId: msg.toolUseId, toolName: msg.toolName,
          input: msg.input, description: msg.description, decisionReason: msg.decisionReason,
        });
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          new Notification("Claude needs your input", {
            body: `Permission requested for: ${msg.toolName}`, tag: "permission-request",
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
        const hist = (msg as any).messages as Array<any>;
        const converted = hist.map((m: any): AccumulatedMessage => {
          if (m.role === "user") return { role: "user", content: m.content };
          return {
            role: "assistant", uuid: crypto.randomUUID(),
            blocks: parseHistoryBlocks(m.blocks), isStreaming: false,
          };
        });
        setMessages(converted);
        break;
      }
      case "session_state": {
        const s = msg as any;
        setSessionId(s.sessionId);
        setCurrentModel(s.model);
        setPermissionMode(s.permissionMode);
        setIsStreaming(s.isStreaming);
        saveSession({ sessionId: s.sessionId, cwd: s.cwd, model: s.model, permissionMode: s.permissionMode });
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
  }, [parseHistoryBlocks]);

  const handleSdkMessage = useCallback((msg: any) => {
    if (!msg?.type) return;

    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init") {
          const model = msg.model ?? "";
          const mode = msg.permissionMode ?? "default";
          setCurrentModel(model);
          setPermissionMode(mode);
          if (msg.session_id) {
            setSessionId(msg.session_id);
            saveSession({ sessionId: msg.session_id, cwd: msg.cwd ?? "", model, permissionMode: mode });
          }
          setMessages((prev) => {
            if (prev.some((m) => m.role === "system")) return prev;
            return [...prev, { role: "system", text: `Session initialized. Model: ${model}` }];
          });
        } else if (msg.subtype === "status") {
          setIsCompacting(msg.status === "compacting");
          if (msg.status === "compacting") {
            setMessages((prev) => [...prev, { role: "system", text: "Compacting conversation..." }]);
          }
        } else if (msg.subtype === "compact_boundary") {
          setIsCompacting(false);
          setMessages((prev) => [...prev, { role: "system", text: "Context compacted" }]);
        }
        break;
      }

      case "user": {
        if (msg.isReplay) {
          const raw = msg.message?.content;
          const content = typeof raw === "string" ? raw
            : Array.isArray(raw)
              ? raw.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") || ""
              : "";
          if (content) setMessages((prev) => [...prev, { role: "user", content }]);
        }
        break;
      }

      case "assistant": {
        if (!streamingBlocksRef.current.length) {
          const aMsg = msg as SDKAssistantMessage;
          const blocks = parseContentBlocks(aMsg.message.content);
          if (blocks.length > 0) {
            setMessages((prev) => [
              ...prev, { role: "assistant", uuid: aMsg.uuid, blocks, isStreaming: false },
            ]);
          }
        }
        break;
      }

      case "stream_event": {
        setIsStreaming(true);
        handleStreamEvent(msg as SDKPartialMessage);
        break;
      }

      case "result": {
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          { role: "result", result: msg.result, cost: msg.total_cost_usd,
            duration: msg.duration_ms, turns: msg.num_turns, errors: msg.errors },
        ]);
        break;
      }
    }
  }, []);

  // --- Streaming ---

  const handleStreamEvent = useCallback((msg: SDKPartialMessage) => {
    const event = msg.event as Record<string, any>;
    if (!event) return;
    const eventType = event.type as string;
    const parentId = msg.parent_tool_use_id;

    // Determine if this is a subagent event
    const isNested = parentId != null;

    // Get the correct blocks array (main or nested)
    const getBlocks = (): AccumulatedBlock[] => {
      if (isNested) {
        // Find the Task tool_use block in main streaming blocks that matches parentId
        if (currentParentToolUseIdRef.current !== parentId) {
          currentParentToolUseIdRef.current = parentId;
          nestedStreamingRef.current = [];
        }
        return nestedStreamingRef.current;
      }
      return streamingBlocksRef.current;
    };

    if (eventType === "message_start") {
      if (isNested) {
        // Subagent message start — reset nested blocks
        currentParentToolUseIdRef.current = parentId;
        nestedStreamingRef.current = [];
      } else {
        // Main message start
        streamingUuidRef.current = msg.uuid ?? crypto.randomUUID();
        streamingBlocksRef.current = [];
        partialJsonRef.current.clear();
        currentParentToolUseIdRef.current = null;
        nestedStreamingRef.current = [];
        setMessages((prev) => [
          ...prev,
          { role: "assistant", uuid: streamingUuidRef.current, blocks: [], isStreaming: true },
        ]);
      }
    } else if (eventType === "content_block_start") {
      const blocks = getBlocks();
      const block = event.content_block as Record<string, any>;
      const blockType = block?.type as string;

      if (blockType === "text") {
        blocks.push({ type: "text", text: (block.text as string) ?? "" });
      } else if (blockType === "thinking") {
        blocks.push({ type: "thinking", thinking: (block.thinking as string) ?? "", isOpen: true });
      } else if (blockType === "tool_use") {
        const index = event.index as number;
        partialJsonRef.current.set(index, "");
        blocks.push({
          type: "tool_use", id: (block.id as string) ?? "",
          name: (block.name as string) ?? "",
          input: (block.input as Record<string, unknown>) ?? {},
          inputJson: "", isRunning: true,
        });
      }
      syncStreamingToUI(isNested, parentId);
    } else if (eventType === "content_block_delta") {
      const blocks = getBlocks();
      const delta = event.delta as Record<string, any>;
      const idx = event.index as number;
      const deltaType = delta?.type as string;

      if (idx < blocks.length) {
        const block = blocks[idx];
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
      syncStreamingToUI(isNested, parentId);
    } else if (eventType === "content_block_stop") {
      const blocks = getBlocks();
      const idx = event.index as number;
      if (idx < blocks.length) {
        const block = blocks[idx];
        if (block.type === "thinking") block.isOpen = false;
        if (block.type === "tool_use") block.isRunning = false;
      }
      syncStreamingToUI(isNested, parentId);
    } else if (eventType === "message_stop") {
      if (isNested) {
        // Subagent done — attach final nested blocks to parent Task block
        const nestedFinal = nestedStreamingRef.current.map((b) => ({ ...b }));
        attachNestedToTask(parentId!, nestedFinal);
        currentParentToolUseIdRef.current = null;
        nestedStreamingRef.current = [];
      } else {
        setIsStreaming(false);
        const finalBlocks = streamingBlocksRef.current.map((b) => ({ ...b }));
        streamingBlocksRef.current = [];
        partialJsonRef.current.clear();
        setMessages((prev) =>
          prev.map((m) =>
            m.role === "assistant" && (m as any).isStreaming
              ? { ...m, isStreaming: false, blocks: finalBlocks }
              : m
          )
        );
      }
    }
  }, []);

  const syncStreamingToUI = useCallback((isNested: boolean, parentId: string | null) => {
    const uuid = streamingUuidRef.current;

    setMessages((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant" && (prev[i] as any).isStreaming) { idx = i; break; }
      }

      // Copy main blocks
      const mainBlocks = streamingBlocksRef.current.map((b) => ({ ...b }));

      // If nested, attach current nested blocks to the Task block
      if (isNested && parentId) {
        for (const block of mainBlocks) {
          if (block.type === "tool_use" && block.id === parentId) {
            block.nestedBlocks = nestedStreamingRef.current.map((b) => ({ ...b }));
          }
        }
      }

      const newMsg: AccumulatedMessage = {
        role: "assistant", uuid, blocks: mainBlocks, isStreaming: true,
      };

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = newMsg;
        return next;
      }
      return [...prev, newMsg];
    });
  }, []);

  const attachNestedToTask = useCallback((parentId: string, nestedBlocks: AccumulatedBlock[]) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== "assistant") return m;
        const updated = { ...m, blocks: m.blocks.map((b) => {
          if (b.type === "tool_use" && b.id === parentId) {
            return { ...b, nestedBlocks, isRunning: false };
          }
          return b;
        })};
        return updated;
      })
    );
  }, []);

  // --- WS + reconnect ---

  const sendRef = useRef<(data: unknown) => void>(() => {});

  const { state: wsState, send } = useWebSocket(handleMessage, () => {
    const saved = loadSavedSession();
    if (saved) {
      sendRef.current({ type: "reconnect" });
    }
  });
  sendRef.current = send;

  // --- Actions ---

  const startSession = useCallback(
    (cwd: string, model?: string, mode?: PermissionMode, enable1m?: boolean, resume?: string) => {
      setMessages([]);
      setUsage({ ...emptyUsage });
      send({ type: "start_session", cwd, model, permissionMode: mode, enable1mContext: enable1m, resume });
    },
    [send]
  );

  const sendMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [...prev, { role: "user", content }]);
      send({ type: "user_message", content });
    },
    [send]
  );

  const respondPermission = useCallback(
    (toolUseId: string, allow: boolean, denyMessage?: string) => {
      send({ type: "permission_response", toolUseId, allow, denyMessage });
      setPendingPermission(null);
    },
    [send]
  );

  const respondAskQuestion = useCallback(
    (toolUseId: string, questions: unknown[], answers: Record<string, string>) => {
      send({ type: "ask_question_response", toolUseId, questions, answers });
      setPendingPermission(null);
    },
    [send]
  );

  const interrupt = useCallback(() => { send({ type: "interrupt" }); }, [send]);

  const changeModel = useCallback(
    (model: string) => { send({ type: "set_model", model }); setCurrentModel(model); },
    [send]
  );

  const changePermissionMode = useCallback(
    (mode: PermissionMode) => {
      send({ type: "set_permission_mode", mode });
      setPermissionMode(mode);
      // Update localStorage
      const saved = loadSavedSession();
      if (saved) saveSession({ ...saved, permissionMode: mode });
    },
    [send]
  );

  const changeThinkingTokens = useCallback(
    (tokens: number | null) => {
      send({ type: "set_thinking_tokens", tokens });
      setMaxThinkingTokens(tokens);
    },
    [send]
  );

  const fetchGitStatus = useCallback((cwd?: string) => { send({ type: "get_git_status", cwd }); }, [send]);
  const fetchModels = useCallback(() => { send({ type: "get_models" }); }, [send]);

  return {
    messages, usage, models, currentModel, permissionMode, sessionId,
    isStreaming, isCompacting, maxThinkingTokens, pendingPermission, gitStatus, error, wsState,
    startSession, sendMessage, respondPermission, respondAskQuestion,
    interrupt, changeModel, changePermissionMode, changeThinkingTokens, fetchGitStatus, fetchModels,
  };
}

function parseContentBlocks(content: ContentBlock[]): AccumulatedBlock[] {
  if (!Array.isArray(content)) return [];
  return content.map((block) => {
    switch (block.type) {
      case "text": return { type: "text" as const, text: block.text };
      case "thinking": return { type: "thinking" as const, thinking: block.thinking, isOpen: false };
      case "tool_use": return {
        type: "tool_use" as const, id: block.id, name: block.name,
        input: block.input, inputJson: JSON.stringify(block.input, null, 2), isRunning: false,
      };
      default: return { type: "text" as const, text: JSON.stringify(block) };
    }
  });
}
