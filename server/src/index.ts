import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server } from "socket.io";
import { Server as Engine } from "@socket.io/bun-engine";
import { AgentSession } from "./agent.js";
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

// List recent sessions for a given cwd
app.get("/api/sessions", async (c) => {
  const cwd = c.req.query("cwd") ?? "/home/debian";
  const homeDir = process.env.HOME ?? "/home/debian";
  const projectKey = cwd.replace(/\//g, "-");
  const sessionsDir = `${homeDir}/.claude/projects/${projectKey}`;

  try {
    const { readdir, stat, readFile } = await import("fs/promises");
    const files = await readdir(sessionsDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    const sessions: Array<{
      id: string;
      timestamp: string;
      firstMessage: string;
      model?: string;
      isRunning?: boolean;
    }> = [];

    for (const file of jsonlFiles.slice(-20)) {
      try {
        const id = file.replace(".jsonl", "");
        const filePath = `${sessionsDir}/${file}`;
        const fileStat = await stat(filePath);
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");
        let firstMessage = "";
        let timestamp = fileStat.mtime.toISOString();
        let model: string | undefined;
        for (const line of lines) {
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
        if (firstMessage) {
          sessions.push({
            id, timestamp, firstMessage, model,
            isRunning: currentSessionId === id && currentSession?.isRunning === true,
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
let currentSession: AgentSession | null = null;
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
      console.log("[socket.io] Reconnecting to session:", currentSessionId);
      // Load conversation history from JSONL using claude-code-kit
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
      socket.emit("message", {
        type: "session_state",
        sessionId: currentSessionId,
        cwd: currentCwd,
        model: currentModel,
        permissionMode: currentPermissionMode,
        isStreaming: currentSession?.isStreaming ?? false,
      } satisfies ServerMessage);
    } else {
      socket.emit("message", { type: "session_ended", reason: "No active session" } satisfies ServerMessage);
    }
  });

  socket.on("start_session", async (data: {
    cwd: string;
    model?: string;
    permissionMode?: string;
    enable1mContext?: boolean;
    resume?: string;
  }) => {
    try {
      console.log("[socket.io] Starting session:", data.cwd, data.model, data.resume ? `(resume: ${data.resume})` : "(new)");
      currentCwd = data.cwd;
      if (currentSession) {
        currentSession.close();
        currentSession = null;
      }

      // Clear message cache for new sessions, keep for resume
      if (!data.resume) {
        messageCache = [];
      }

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
      await currentSession.start({
        cwd: data.cwd,
        model: data.model,
        permissionMode: data.permissionMode as any,
        enable1mContext: data.enable1mContext,
        resume: data.resume,
      });
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
