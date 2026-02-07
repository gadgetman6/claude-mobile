import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun";
import { AgentSession } from "./agent.js";
import { getGitStatus } from "./git.js";
import { getVapidPublicKey, setSubscription, removeSubscription, sendPushNotification } from "./push.js";
import type { ClientMessage, ServerMessage, HistoryMessage, HistoryBlock } from "./types.js";

const PORT = parseInt(process.env.PORT ?? "3333");
const HOST = process.env.HOST ?? "0.0.0.0";

const { upgradeWebSocket, websocket } = createBunWebSocket();

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
  // Claude stores sessions keyed by path with / replaced by -
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
        // Find first user message line
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

    // Sort by timestamp descending
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

// Load message history from a session jsonl file
async function loadSessionHistory(cwd: string, sessionId: string): Promise<HistoryMessage[]> {
  const { readFile } = await import("fs/promises");
  const homeDir = process.env.HOME ?? "/home/debian";
  const projectKey = cwd.replace(/\//g, "-");
  const filePath = `${homeDir}/.claude/projects/${projectKey}/${sessionId}.jsonl`;

  try {
    const content = await readFile(filePath, "utf-8");
    const messages: HistoryMessage[] = [];
    // Map tool_use_id → index in the last assistant message blocks, for attaching results
    const pendingToolUses = new Map<string, { msgIdx: number; blockIdx: number }>();

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === "user" && parsed.message?.content) {
          const c = parsed.message.content;
          if (typeof c === "string") {
            messages.push({ role: "user", content: c });
          } else if (Array.isArray(c)) {
            // Extract real user text
            const textParts = c.filter((b: any) => b.type === "text").map((b: any) => b.text);
            if (textParts.length > 0) {
              messages.push({ role: "user", content: textParts.join("\n") });
            }
            // Attach tool results to their corresponding tool_use blocks
            for (const b of c) {
              if (b.type === "tool_result" && b.tool_use_id) {
                const pending = pendingToolUses.get(b.tool_use_id);
                if (pending) {
                  const msg = messages[pending.msgIdx];
                  if (msg.role === "assistant") {
                    const block = msg.blocks[pending.blockIdx];
                    if (block.type === "tool_use") {
                      const rc = b.content;
                      block.result = typeof rc === "string"
                        ? rc
                        : Array.isArray(rc)
                          ? rc.filter((r: any) => r.type === "text").map((r: any) => r.text).join("\n")
                          : "";
                    }
                  }
                  pendingToolUses.delete(b.tool_use_id);
                }
              }
            }
          }
        } else if (parsed.type === "assistant" && parsed.message?.content) {
          const rawBlocks = parsed.message.content;
          if (!Array.isArray(rawBlocks)) continue;

          const blocks: HistoryBlock[] = [];
          const msgIdx = messages.length;

          for (const b of rawBlocks) {
            if (b.type === "text" && b.text?.trim()) {
              blocks.push({ type: "text", text: b.text });
            } else if (b.type === "thinking" && b.thinking) {
              blocks.push({ type: "thinking", thinking: b.thinking });
            } else if (b.type === "tool_use") {
              const blockIdx = blocks.length;
              blocks.push({
                type: "tool_use",
                name: b.name ?? "",
                input: b.input ?? {},
              });
              if (b.id) {
                pendingToolUses.set(b.id, { msgIdx, blockIdx });
              }
            }
          }

          if (blocks.length > 0) {
            // Merge with previous assistant message if consecutive
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
              lastMsg.blocks.push(...blocks);
            } else {
              messages.push({ role: "assistant", blocks });
            }
          }
        }
      } catch { continue; }
    }

    return messages;
  } catch {
    return [];
  }
}

// Global session state — survives WS reconnects (single-user app)
let currentSession: AgentSession | null = null;
let currentSessionId: string | null = null;
let currentCwd: string | null = null;
let currentModel: string = "";
let currentPermissionMode: string = "default";
let currentWs: any = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;

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

  // Send push notification for permission requests
  if (msg.type === "permission_request") {
    const toolName = (msg as any).toolName ?? "tool";
    sendPushNotification(
      "Claude needs your input",
      `Permission requested for: ${toolName}`,
      { type: "permission_request", toolName }
    );
  }

  try {
    currentWs?.send(JSON.stringify(msg));
  } catch {
    // WS not connected — message is lost but session continues
  }
}

// WebSocket endpoint
app.get(
  "/ws",
  upgradeWebSocket(() => {
    return {
      onOpen(_event, wsInstance) {
        currentWs = wsInstance;
        console.log("Client connected");

        // Keepalive ping every 20s to prevent proxy timeout
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          try {
            currentWs?.send(JSON.stringify({ type: "ping" }));
          } catch { /* ignore */ }
        }, 20_000);
      },

      async onMessage(event) {
        try {
          const data: ClientMessage = JSON.parse(
            typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer)
          );
          console.log("[ws] Received:", data.type);

          switch (data.type) {
            case "reconnect": {
              // Client reconnected — replay session state if active
              if (currentSessionId && currentCwd) {
                console.log("[ws] Reconnecting to session:", currentSessionId);
                const history = await loadSessionHistory(currentCwd, currentSessionId);
                if (history.length > 0) {
                  sendToClient({ type: "session_history", messages: history });
                }
                sendToClient({
                  type: "session_state",
                  sessionId: currentSessionId,
                  cwd: currentCwd,
                  model: currentModel,
                  permissionMode: currentPermissionMode,
                  isStreaming: currentSession?.isRunning ?? false,
                });
              } else {
                // No active session — tell client to go back to start
                sendToClient({ type: "session_ended", reason: "No active session" });
              }
              break;
            }

            case "start_session": {
              console.log("[ws] Starting session:", data.cwd, data.model, data.resume ? `(resume: ${data.resume})` : "(new)");
              currentCwd = data.cwd;
              if (currentSession) {
                currentSession.close();
                currentSession = null;
              }

              // If resuming, load and send the session history first
              if (data.resume) {
                const history = await loadSessionHistory(data.cwd, data.resume);
                console.log("[ws] Loaded session history:", history.length, "messages");
                if (history.length > 0) {
                  sendToClient({ type: "session_history", messages: history });
                }
              }

              currentSession = new AgentSession(sendToClient);
              await currentSession.start({
                cwd: data.cwd,
                model: data.model,
                permissionMode: data.permissionMode,
                enable1mContext: data.enable1mContext,
                resume: data.resume,
              });
              break;
            }

            case "user_message": {
              if (!currentSession) {
                sendToClient({ type: "error", message: "No active session. Start a session first." });
                return;
              }
              currentSession.sendUserMessage(data.content);
              break;
            }

            case "permission_response": {
              currentSession?.resolvePermission(
                data.toolUseId,
                data.allow,
                data.updatedInput,
                data.denyMessage
              );
              break;
            }

            case "ask_question_response": {
              currentSession?.resolveAskQuestion(
                data.toolUseId,
                data.questions,
                data.answers
              );
              break;
            }

            case "interrupt": {
              await currentSession?.interrupt();
              break;
            }

            case "set_model": {
              await currentSession?.setModel(data.model);
              break;
            }

            case "set_permission_mode": {
              await currentSession?.setPermissionMode(data.mode);
              break;
            }

            case "set_thinking_tokens": {
              await currentSession?.setMaxThinkingTokens(data.tokens);
              break;
            }

            case "set_1m_context": {
              sendToClient({
                type: "error",
                message: "Changing 1M context mode requires starting a new session.",
              });
              break;
            }

            case "get_models": {
              if (currentSession) {
                const models = await currentSession.getModels();
                sendToClient({ type: "models", models });
              }
              break;
            }

            case "get_git_status": {
              const cwd = data.cwd ?? process.cwd();
              const result = await getGitStatus(cwd);
              sendToClient({ type: "git_status", ...result });
              break;
            }
          }
        } catch (err) {
          console.error("WS message error:", err);
          sendToClient({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },

      onClose() {
        console.log("Client disconnected (session kept alive)");
        // DON'T close the session — it survives reconnects
      },

      onError(error) {
        console.error("WS error:", error);
      },
    };
  })
);

// Serve built client in production
const clientDist = `${import.meta.dir}/../../client/dist`;
app.get("/*", async (c, next) => {
  // Try to serve static file first
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
    // Don't cache HTML/SW so refreshes pick up new deploys
    if (ext === "html" || filePath.includes("sw.js") || filePath.includes("registerSW")) {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
    return new Response(file, { headers });
  }
  // SPA fallback: serve index.html for all other routes
  const index = Bun.file(clientDist + "/index.html");
  if (await index.exists()) {
    return new Response(index, {
      headers: { "Content-Type": "text/html" },
    });
  }
  return next();
});

// TLS config: use certs if available for HTTPS (needed for PWA over Tailscale)
const tlsCert = `${import.meta.dir}/../tls.crt`;
const tlsKey = `${import.meta.dir}/../tls.key`;
const hasTLS =
  await Bun.file(tlsCert).exists() && await Bun.file(tlsKey).exists();

if (hasTLS) {
  console.log(`Server starting on https://${HOST}:${PORT}`);
} else {
  console.log(`Server starting on http://${HOST}:${PORT} (no TLS certs found)`);
}

export default {
  fetch: app.fetch,
  websocket,
  port: PORT,
  hostname: HOST,
  ...(hasTLS
    ? {
        tls: {
          cert: Bun.file(tlsCert),
          key: Bun.file(tlsKey),
        },
      }
    : {}),
};
