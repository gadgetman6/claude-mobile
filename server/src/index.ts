import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server } from "socket.io";
import { Server as Engine } from "@socket.io/bun-engine";
import { AgentSession } from "./agent.js";
import { CodexSession } from "./agent-codex.js";
import { getGitStatus } from "./git.js";
import { getVapidPublicKey, setSubscription, removeSubscription, sendPushNotification } from "./push.js";
import type { ServerMessage, HistoryEntry, HistoryContentPart, ContentBlock } from "./types.js";
import { parseTranscript } from "@constellos/claude-code-kit/transcripts";

const PORT = parseInt(process.env.PORT ?? "3333");
const HOST = process.env.HOST ?? "0.0.0.0";

const app = new Hono();

// CORS for dev mode (Vite on different port)
app.use("/api/*", cors());

// Git status REST endpoint
app.get("/api/git-status", async (c) => {
  const cwd = c.req.query("cwd") ?? process.cwd();
  const result = await getGitStatus(cwd);
  return c.json(result);
});

// Git diff for a specific file
app.get("/api/git-diff", async (c) => {
  const cwd = c.req.query("cwd") ?? process.cwd();
  const file = c.req.query("file");
  if (!file) return c.json({ error: "No file" }, 400);
  try {
    const { $ } = await import("bun");
    // Get the original (HEAD) version and the working version
    const oldContent = await $`git -C ${cwd} show HEAD:${file}`.text().catch(() => "");
    const filePath = file.startsWith("/") ? file : `${cwd}/${file}`;
    const newContent = await Bun.file(filePath).text().catch(() => "");
    return c.json({ oldContent, newContent, filePath });
  } catch {
    return c.json({ error: "Failed to get diff" }, 500);
  }
});

// List recent sessions for a given cwd
app.get("/api/sessions", async (c) => {
  const cwd = c.req.query("cwd") ?? "/home/debian";
  const homeDir = process.env.HOME ?? "/home/debian";
  const projectKey = cwd.replace(/\//g, "-");
  const sessionsDir = `${homeDir}/.claude/projects/${projectKey}`;

  try {
    const { readdir, stat, open } = await import("fs/promises");
    const files = await readdir(sessionsDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    type SessionInfo = {
      id: string;
      timestamp: string;
      firstMessage: string;
      model?: string;
      isRunning?: boolean;
      totalTokens?: number;
      costUsd?: number;
    };

    const sessions: SessionInfo[] = [];

    for (const file of jsonlFiles.slice(-20)) {
      try {
        const id = file.replace(".jsonl", "");
        const filePath = `${sessionsDir}/${file}`;
        const fileStat = await stat(filePath);
        let firstMessage = "";
        let timestamp = fileStat.mtime.toISOString();
        let model: string | undefined;
        let totalTokens: number | undefined;
        let costUsd: number | undefined;

        // Read first 8KB for first user message
        const fd = await open(filePath, "r");
        try {
          const headBuf = Buffer.alloc(8192);
          const { bytesRead } = await fd.read(headBuf, 0, 8192, 0);
          const headStr = headBuf.toString("utf-8", 0, bytesRead);
          for (const line of headStr.split("\n")) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === "user" && parsed.message?.content) {
                const content = parsed.message.content;
                firstMessage = typeof content === "string"
                  ? content.slice(0, 100)
                  : "[complex content]";
                timestamp = parsed.timestamp ?? timestamp;
                model = parsed.model;
                break;
              }
            } catch { continue; }
          }

          // Read last 16KB for result message with usage
          const fileSize = fileStat.size;
          if (fileSize > 0) {
            const tailSize = Math.min(16384, fileSize);
            const tailBuf = Buffer.alloc(tailSize);
            await fd.read(tailBuf, 0, tailSize, fileSize - tailSize);
            const tailStr = tailBuf.toString("utf-8");
            const tailLines = tailStr.split("\n");
            // Scan from end to find last result
            for (let i = tailLines.length - 1; i >= 0; i--) {
              const line = tailLines[i].trim();
              if (!line) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.type === "result" && parsed.modelUsage) {
                  let inTok = 0, outTok = 0, cost = 0;
                  for (const mu of Object.values(parsed.modelUsage) as any[]) {
                    inTok += mu.inputTokens ?? 0;
                    outTok += mu.outputTokens ?? 0;
                    cost += mu.costUSD ?? 0;
                  }
                  totalTokens = inTok + outTok;
                  costUsd = cost;
                  break;
                }
              } catch { continue; }
            }
          }
        } finally {
          await fd.close();
        }

        if (firstMessage) {
          // For running session, use live usage
          if (currentSessionId === id && currentSession != null) {
            const liveUsage = currentSession.currentUsage;
            totalTokens = liveUsage.inputTokens + liveUsage.outputTokens;
            costUsd = liveUsage.costUsd;
          }
          sessions.push({
            id, timestamp, firstMessage, model,
            isRunning: currentSessionId === id && currentSession != null,
            totalTokens,
            costUsd,
          });
        }
      } catch { continue; }
    }

    sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return c.json(sessions.slice(0, 10));
  } catch {
    return c.json([]);
  }
});

// List recent Codex sessions
app.get("/api/codex-sessions", async (c) => {
  const homeDir = process.env.HOME ?? "/home/debian";
  const sessionsDir = `${homeDir}/.codex/sessions`;

  try {
    const { readdir, stat, open } = await import("fs/promises");
    const { join } = await import("path");

    // Walk year/month/day directories to find JSONL files
    const sessions: Array<{
      id: string;
      timestamp: string;
      firstMessage: string;
      model?: string;
      isRunning?: boolean;
    }> = [];

    const years = await readdir(sessionsDir).catch(() => [] as string[]);
    for (const year of years.slice(-1)) {
      const months = await readdir(join(sessionsDir, year)).catch(() => [] as string[]);
      for (const month of months.slice(-2)) {
        const days = await readdir(join(sessionsDir, year, month)).catch(() => [] as string[]);
        for (const day of days) {
          const dayDir = join(sessionsDir, year, month, day);
          const files = await readdir(dayDir).catch(() => [] as string[]);
          for (const file of files.filter(f => f.endsWith(".jsonl")).slice(-10)) {
            try {
              const filePath = join(dayDir, file);
              const fileStat = await stat(filePath);
              // Read first 32KB to get session_meta and first real user message
              const fd = await open(filePath, "r");
              try {
                const readSize = Math.min(32768, fileStat.size);
                const buf = Buffer.alloc(readSize);
                const { bytesRead } = await fd.read(buf, 0, readSize, 0);
                const str = buf.toString("utf-8", 0, bytesRead);
                let id = "";
                let timestamp = fileStat.mtime.toISOString();
                let firstMessage = "";
                let model: string | undefined;
                for (const line of str.split("\n")) {
                  if (!line.trim()) continue;
                  try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === "session_meta") {
                      id = parsed.payload?.id ?? "";
                      timestamp = parsed.payload?.timestamp ?? timestamp;
                    }
                    if (parsed.type === "response_item" && parsed.payload?.role === "user") {
                      const content = parsed.payload?.content;
                      if (Array.isArray(content)) {
                        const textPart = content.find((c: any) =>
                          c.type === "input_text" && c.text?.length < 500
                          && !c.text?.startsWith("<") && !c.text?.startsWith("#")
                        );
                        if (textPart) {
                          firstMessage = textPart.text.slice(0, 100);
                        }
                      }
                    }
                  } catch { continue; }
                  if (id && firstMessage) break;
                }
                if (id && firstMessage) {
                  sessions.push({
                    id, timestamp, firstMessage, model,
                    isRunning: currentProvider === "codex" && currentSessionId === id && currentSession != null,
                  });
                }
              } finally {
                await fd.close();
              }
            } catch { continue; }
          }
        }
      }
    }

    sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return c.json(sessions.slice(0, 10));
  } catch {
    return c.json([]);
  }
});

// Read file contents (for git panel file viewer)
app.get("/api/file", async (c) => {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "No path" }, 400);
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return c.json({ error: "Not found" }, 404);
    const size = file.size;
    if (size > 1024 * 1024) return c.json({ error: "File too large" }, 413);
    const content = await file.text();
    return c.json({ content });
  } catch {
    return c.json({ error: "Read failed" }, 500);
  }
});

// Health check
app.get("/api/health", (c) => c.json({ ok: true }));

// Push notification endpoints
app.get("/api/push/vapid-key", (c) => {
  return c.json({ publicKey: getVapidPublicKey() });
});

app.post("/api/push/subscribe", async (c) => {
  const body = await c.req.json();
  if (body.subscription) {
    setSubscription(body.subscription);
    return c.json({ ok: true });
  }
  return c.json({ ok: false, error: "No subscription provided" }, 400);
});

app.post("/api/push/unsubscribe", async (c) => {
  removeSubscription();
  return c.json({ ok: true });
});

// Serve built client in production
const clientDist = `${import.meta.dir}/../../client/dist`;
app.get("/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const filePath = path === "/" ? "/index.html" : path;
  const file = Bun.file(clientDist + filePath);
  if (await file.exists()) {
    const ext = filePath.split(".").pop() ?? "";
    const mimeTypes: Record<string, string> = {
      html: "text/html",
      js: "text/javascript",
      css: "text/css",
      json: "application/json",
      png: "image/png",
      svg: "image/svg+xml",
      webmanifest: "application/manifest+json",
    };
    const headers: Record<string, string> = {
      "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
    };
    if (ext === "html" || filePath.includes("sw.js") || filePath.includes("registerSW")) {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
    return new Response(file, { headers });
  }
  const index = Bun.file(clientDist + "/index.html");
  if (await index.exists()) {
    return new Response(index, {
      headers: { "Content-Type": "text/html" },
    });
  }
  return next();
});

// Global session state — survives reconnects (single-user app)
let currentSession: AgentSession | CodexSession | null = null;
let currentProvider: "claude" | "codex" = "claude";
let currentSessionId: string | null = null;
let currentCwd: string | null = null;
let currentModel: string = "";
let currentPermissionMode: string = "default";
let messageCache: ServerMessage[] = [];
let lastAssistantText: string = "";

// Socket.IO setup
const io = new Server();
const engine = new Engine({
  cors: { origin: "*" },
});
io.bind(engine);

function sendToClient(msg: ServerMessage) {
  // Track session metadata from SDK messages
  if (msg.type === "sdk_message") {
    const sdkMsg = msg.message as any;
    if (sdkMsg?.type === "system" && sdkMsg?.subtype === "init") {
      currentSessionId = sdkMsg.session_id ?? currentSessionId;
      currentModel = sdkMsg.model ?? currentModel;
      currentPermissionMode = sdkMsg.permissionMode ?? currentPermissionMode;
    }
  }
  if (msg.type === "session_started") {
    currentSessionId = (msg as any).sessionId;
  }

  // Send push notifications
  if (msg.type === "permission_request") {
    const toolName = (msg as any).toolName ?? "tool";
    const dir = currentCwd?.split("/").pop() ?? "";
    sendPushNotification(
      dir ? `Claude · ${dir}` : "Claude needs your input",
      `Permission: ${toolName}`,
      { type: "permission_request", toolName }
    );
  }

  if (msg.type === "sdk_message") {
    const sdkMsg = msg.message as any;
    // Track last assistant text for notifications
    if (sdkMsg?.type === "assistant" && !sdkMsg.parent_tool_use_id) {
      const blocks = sdkMsg.message?.content;
      if (Array.isArray(blocks)) {
        const text = blocks
          .filter((b: any) => b.type === "text" && b.text)
          .map((b: any) => b.text)
          .join(" ");
        if (text) lastAssistantText = text;
      }
    }
    if (sdkMsg?.type === "result") {
      const dir = currentCwd?.split("/").pop() ?? currentCwd ?? "";
      const preview = lastAssistantText
        ? lastAssistantText.length > 120 ? lastAssistantText.slice(0, 120) + "..." : lastAssistantText
        : "Task finished";
      const cost = sdkMsg.total_cost_usd;
      const meta = [
        dir,
        cost ? `$${cost.toFixed(4)}` : null,
      ].filter(Boolean).join(" · ");
      sendPushNotification(
        meta ? `Claude · ${meta}` : "Claude finished",
        preview,
        { type: "result" }
      );
      lastAssistantText = "";
    }
  }

  // Push to cache (kept for potential future use)
  messageCache.push(msg);

  // Emit via Socket.IO to all connected clients in the session room
  io.to("session").emit("message", msg);
}

// Parse Codex JSONL session into display history
async function loadCodexHistory(sessionId: string): Promise<HistoryEntry[]> {
  const homeDir = process.env.HOME ?? "/home/debian";
  const sessionsDir = `${homeDir}/.codex/sessions`;
  const { readdir, readFile } = await import("fs/promises");
  const { join } = await import("path");

  // Find the JSONL file matching this session ID
  const years = await readdir(sessionsDir).catch(() => [] as string[]);
  for (const year of years.reverse()) {
    const months = await readdir(join(sessionsDir, year)).catch(() => [] as string[]);
    for (const month of months.reverse()) {
      const days = await readdir(join(sessionsDir, year, month)).catch(() => [] as string[]);
      for (const day of days.reverse()) {
        const dayDir = join(sessionsDir, year, month, day);
        const files = await readdir(dayDir).catch(() => [] as string[]);
        const match = files.find(f => f.includes(sessionId));
        if (!match) continue;

        const content = await readFile(join(dayDir, match), "utf-8");
        const history: HistoryEntry[] = [];
        const pendingCalls = new Map<string, { histIdx: number; partIdx: number }>();

        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type !== "response_item") continue;
            const p = parsed.payload;
            if (!p) continue;

            // User messages
            if (p.role === "user") {
              const textParts = (p.content ?? [])
                .filter((c: any) => c.type === "input_text" && c.text?.length < 500 && !c.text?.startsWith("<") && !c.text?.startsWith("#"))
                .map((c: any) => c.text);
              if (textParts.length > 0) {
                history.push({ role: "user", content: textParts.join("\n") });
              }
            }
            // Assistant text messages
            else if (p.role === "assistant") {
              const text = (p.content ?? [])
                .filter((c: any) => c.type === "output_text")
                .map((c: any) => c.text)
                .join("\n");
              if (text) {
                history.push({ role: "assistant", content: [{ type: "text", text }] });
              }
            }
            // Reasoning
            else if (p.type === "reasoning") {
              const raw = p.summary ?? p.content ?? "";
              const text = Array.isArray(raw)
                ? raw.filter((s: any) => s.type === "summary_text").map((s: any) => s.text).join("\n")
                : typeof raw === "string" ? raw : "";
              if (text) {
                const last = history[history.length - 1];
                if (last?.role === "assistant") {
                  last.content.push({ type: "reasoning", text });
                } else {
                  history.push({ role: "assistant", content: [{ type: "reasoning", text }] });
                }
              }
            }
            // Function calls (tool use)
            else if (p.type === "function_call") {
              let args: Record<string, unknown> = {};
              try { args = typeof p.arguments === "string" ? JSON.parse(p.arguments) : (p.arguments ?? {}); } catch { args = { command: p.arguments }; }
              const toolName = p.name === "exec_command" ? "Bash" : (p.name ?? "tool");
              // Map Codex exec_command {cmd} to Bash tool UI {command}
              if (toolName === "Bash" && args.cmd && !args.command) {
                args.command = args.cmd;
              }
              const toolCallId = p.call_id ?? p.id ?? "";
              const part: HistoryContentPart = { type: "tool-call", toolCallId, toolName, args };
              const last = history[history.length - 1];
              if (last?.role === "assistant") {
                pendingCalls.set(toolCallId, { histIdx: history.length - 1, partIdx: last.content.length });
                last.content.push(part);
              } else {
                pendingCalls.set(toolCallId, { histIdx: history.length, partIdx: 0 });
                history.push({ role: "assistant", content: [part] });
              }
            }
            // Function call output (tool result)
            else if (p.type === "function_call_output") {
              const callId = p.call_id ?? "";
              const pending = pendingCalls.get(callId);
              if (pending) {
                const entry = history[pending.histIdx];
                if (entry?.role === "assistant") {
                  const part = entry.content[pending.partIdx];
                  if (part?.type === "tool-call") {
                    part.result = p.output ?? "";
                  }
                }
                pendingCalls.delete(callId);
              }
            }
          } catch { continue; }
        }
        return history;
      }
    }
  }
  return [];
}

// Convert parsed transcript to display history
function transcriptToHistory(transcript: { messages: any[] }): HistoryEntry[] {
  const history: HistoryEntry[] = [];
  const pendingTools = new Map<string, { histIdx: number; partIdx: number }>();

  for (const msg of transcript.messages) {
    if (msg.type === "user") {
      // Skip internal tool-result user messages (they have parent_tool_use_id)
      if (msg.parentUuid && msg.message?.content && Array.isArray(msg.message.content)) {
        // Attach tool results to pending tool calls
        for (const block of msg.message.content) {
          if (block.tool_use_id) {
            const pending = pendingTools.get(block.tool_use_id);
            if (pending) {
              const entry = history[pending.histIdx];
              if (entry.role === "assistant") {
                const part = entry.content[pending.partIdx];
                if (part.type === "tool-call") {
                  const rc = block.content;
                  part.result = typeof rc === "string" ? rc
                    : Array.isArray(rc) ? rc.filter((r: any) => r.type === "text").map((r: any) => r.text).join("\n")
                    : "";
                }
              }
              pendingTools.delete(block.tool_use_id);
            }
          }
        }
        continue;
      }
      const raw = msg.message?.content;
      const text = typeof raw === "string" ? raw
        : Array.isArray(raw) ? raw.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
        : "";
      if (text) history.push({ role: "user", content: text });
    } else if (msg.type === "assistant") {
      const rawBlocks = msg.message?.content;
      if (!Array.isArray(rawBlocks)) continue;
      const parts: HistoryContentPart[] = [];
      const histIdx = history.length;
      for (const b of rawBlocks) {
        if (b.type === "text" && b.text?.trim()) {
          parts.push({ type: "text", text: b.text });
        } else if (b.type === "thinking" && b.thinking) {
          parts.push({ type: "reasoning", text: b.thinking });
        } else if (b.type === "tool_use") {
          const partIdx = parts.length;
          parts.push({ type: "tool-call", toolCallId: b.id ?? "", toolName: b.name ?? "", args: b.input ?? {} });
          if (b.id) pendingTools.set(b.id, { histIdx, partIdx });
        }
      }
      if (parts.length > 0) {
        // Merge consecutive assistant messages
        const last = history[history.length - 1];
        if (last?.role === "assistant") {
          const offset = last.content.length;
          for (const [id, ref] of pendingTools) {
            if (ref.histIdx === histIdx) { ref.histIdx = history.length - 1; ref.partIdx += offset; }
          }
          last.content.push(...parts);
        } else {
          history.push({ role: "assistant", content: parts });
        }
      }
    }
  }
  return history;
}

// Socket.IO event handlers
io.on("connection", (socket) => {
  console.log("Client connected via Socket.IO");
  socket.join("session");

  socket.on("reconnect_request", async () => {
    if (currentSessionId && currentCwd) {
      console.log("[socket.io] Reconnecting to session:", currentSessionId, `(${messageCache.length} cached messages)`);
      // Signal client to clear messages before replay
      socket.emit("message", { type: "session_state",
        sessionId: currentSessionId,
        cwd: currentCwd,
        model: currentModel,
        permissionMode: currentPermissionMode,
        isStreaming: currentSession?.isStreaming ?? false,
      } satisfies ServerMessage);
      // Replay all cached messages — client rebuilds full state
      for (const msg of messageCache) {
        socket.emit("message", msg);
      }
      // Send current token usage
      if (currentSession) {
        socket.emit("message", {
          type: "token_usage",
          usage: currentSession.currentUsage,
        } satisfies ServerMessage);
      }
    } else {
      // Fallback: try loading from JSONL transcript
      if (currentCwd && currentSessionId) {
        try {
          const homeDir = process.env.HOME ?? "/home/debian";
          const projectKey = currentCwd.replace(/\//g, "-");
          const filePath = `${homeDir}/.claude/projects/${projectKey}/${currentSessionId}.jsonl`;
          const transcript = await parseTranscript(filePath);
          const history = transcriptToHistory(transcript);
          if (history.length > 0) {
            socket.emit("message", { type: "session_history", messages: history } satisfies ServerMessage);
          }
        } catch (err) {
          console.error("[socket.io] Failed to load session history:", err);
        }
      }
      socket.emit("message", { type: "session_ended", reason: "No active session" } satisfies ServerMessage);
    }
  });

  socket.on("start_session", async (data: {
    cwd: string;
    model?: string;
    permissionMode?: string;
    enable1mContext?: boolean;
    resume?: string;
    provider?: "claude" | "codex";
  }) => {
    try {
      const provider = data.provider ?? "claude";
      console.log("[socket.io] Starting session:", provider, data.cwd, data.model, data.resume ? `(resume: ${data.resume})` : "(new)");
      currentCwd = data.cwd;
      currentProvider = provider;
      if (currentSession) {
        currentSession.close();
        currentSession = null;
      }

      // Clear message cache for new sessions, keep for resume
      if (!data.resume) {
        messageCache = [];
      }

      if (provider === "codex") {
        // Load Codex conversation history when resuming
        if (data.resume) {
          try {
            const history = await loadCodexHistory(data.resume);
            if (history.length > 0) {
              socket.emit("message", { type: "session_history", messages: history } satisfies ServerMessage);
            }
          } catch (err) {
            console.error("[socket.io] Failed to load Codex history:", err);
          }
        }
        currentSession = new CodexSession(sendToClient);
        await (currentSession as CodexSession).start({
          cwd: data.cwd,
          model: data.model,
          resume: data.resume,
        });
      } else {
        // Load and send conversation history from JSONL when resuming
        if (data.resume) {
          try {
            const homeDir = process.env.HOME ?? "/home/debian";
            const projectKey = data.cwd.replace(/\//g, "-");
            const filePath = `${homeDir}/.claude/projects/${projectKey}/${data.resume}.jsonl`;
            const transcript = await parseTranscript(filePath);
            const history = transcriptToHistory(transcript);
            if (history.length > 0) {
              socket.emit("message", { type: "session_history", messages: history } satisfies ServerMessage);
            }
          } catch (err) {
            console.error("[socket.io] Failed to load resume history:", err);
          }
        }

        currentSession = new AgentSession(sendToClient);
        await (currentSession as AgentSession).start({
          cwd: data.cwd,
          model: data.model,
          permissionMode: data.permissionMode as any,
          enable1mContext: data.enable1mContext,
          resume: data.resume,
        });
      }
    } catch (err) {
      console.error("[socket.io] start_session error:", err);
      socket.emit("message", {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      } satisfies ServerMessage);
    }
  });

  socket.on("user_message", (data: { content: string | ContentBlock[] }) => {
    if (!currentSession) {
      socket.emit("message", {
        type: "error",
        message: "No active session. Start a session first.",
      } satisfies ServerMessage);
      return;
    }
    currentSession.sendUserMessage(data.content);
  });

  socket.on("permission_response", (data: {
    toolUseId: string;
    allow: boolean;
    updatedInput?: Record<string, unknown>;
    denyMessage?: string;
  }) => {
    currentSession?.resolvePermission(
      data.toolUseId,
      data.allow,
      data.updatedInput,
      data.denyMessage
    );
  });

  socket.on("ask_question_response", (data: {
    toolUseId: string;
    questions: unknown[];
    answers: Record<string, string>;
  }) => {
    currentSession?.resolveAskQuestion(
      data.toolUseId,
      data.questions,
      data.answers
    );
  });

  socket.on("interrupt", async () => {
    await currentSession?.interrupt();
  });

  socket.on("set_model", async (data: { model: string }) => {
    await currentSession?.setModel(data.model);
  });

  socket.on("set_permission_mode", async (data: { mode: string }) => {
    await currentSession?.setPermissionMode(data.mode as any);
  });

  socket.on("set_thinking_tokens", async (data: { tokens: number | null }) => {
    await currentSession?.setMaxThinkingTokens(data.tokens);
  });

  socket.on("get_models", async () => {
    if (currentSession) {
      const models = await currentSession.getModels();
      socket.emit("message", { type: "models", models } satisfies ServerMessage);
    }
  });

  socket.on("get_git_status", async (data: { cwd?: string }) => {
    const cwd = data?.cwd ?? process.cwd();
    const result = await getGitStatus(cwd);
    socket.emit("message", { type: "git_status", ...result } satisfies ServerMessage);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected (session kept alive)");
  });
});

// TLS config
const tlsCert = `${import.meta.dir}/../tls.crt`;
const tlsKey = `${import.meta.dir}/../tls.key`;
const hasTLS =
  await Bun.file(tlsCert).exists() && await Bun.file(tlsKey).exists();

if (hasTLS) {
  console.log(`Server starting on https://${HOST}:${PORT}`);
} else {
  console.log(`Server starting on http://${HOST}:${PORT} (no TLS certs found)`);
}

const engineHandler = engine.handler();

export default {
  port: PORT,
  hostname: HOST,
  ...engineHandler,
  fetch(req: Request, server: any) {
    const url = new URL(req.url);
    // Route engine.io requests to Socket.IO engine
    if (url.pathname.startsWith("/engine.io")) {
      return engineHandler.fetch(req, server);
    }
    // Everything else goes to Hono (REST + static files)
    return app.fetch(req, server);
  },
  ...(hasTLS
    ? {
        tls: {
          cert: Bun.file(tlsCert),
          key: Bun.file(tlsKey),
        },
      }
    : {}),
};
