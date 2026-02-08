/**
 * Comprehensive mock server for Maestro testing.
 * Simulates: health check, sessions list, Socket.IO messaging, large history,
 * permission requests, tool calls, and image handling.
 *
 * Run: npx tsx maestro/mock-server.ts
 */
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3333;
const httpServer = createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === "/api/sessions") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([
      {
        id: "test-session-1",
        timestamp: new Date().toISOString(),
        firstMessage: "Test session with tool calls and markdown",
        model: "claude-opus-4-6",
        isRunning: false,
        totalTokens: 50000,
        costUsd: 1.23,
      },
      {
        id: "large-session",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        firstMessage: "Large session with 200+ messages for scroll testing",
        isRunning: false,
        totalTokens: 385000,
        costUsd: 12.50,
      },
    ]));
    return;
  }

  if (url.pathname === "/api/codex-sessions") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([]));
    return;
  }

  if (url.pathname === "/api/git-status") {
    // No-op for testing
  }

  if (url.pathname === "/api/push/register-apns") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      console.log("[mock] APNs token registered:", JSON.parse(body).deviceToken?.slice(0, 8));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// Generate large history
function generateHistory(count: number) {
  const msgs: any[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 3 === 0) {
      msgs.push({ role: "user", content: `Help with task ${Math.floor(i / 3) + 1}` });
    } else if (i % 3 === 1) {
      msgs.push({
        role: "assistant",
        content: [
          { type: "text", text: `Working on task ${Math.floor(i / 3) + 1}.` },
          {
            type: "tool-call", toolCallId: `tool-${i}`,
            toolName: i % 6 === 1 ? "Bash" : "Read",
            args: i % 6 === 1
              ? { command: `ls -la /tmp/project-${Math.floor(i / 3)}` }
              : { file_path: `/tmp/src/file-${i}.ts` },
            result: "output line 1\noutput line 2",
          },
        ],
      });
    } else {
      msgs.push({
        role: "assistant",
        content: [{ type: "text", text: `Done with task ${Math.floor(i / 3) + 1}.\n\n**Result:** success\n\n\`\`\`ts\nconsole.log("done");\n\`\`\`` }],
      });
    }
  }
  return msgs;
}

const io = new Server(httpServer, {
  cors: { origin: "*" },
  path: "/engine.io/",
  maxHttpBufferSize: 10 * 1024 * 1024,
});

io.on("connection", (socket) => {
  console.log("[mock] Client connected");

  socket.on("start_session", (data: any) => {
    console.log("[mock] Start session:", data.cwd, data.resume ?? "(new)");

    // Send init
    socket.emit("message", {
      type: "sdk_message",
      message: {
        type: "system", subtype: "init",
        session_id: data.resume ?? "mock-session-" + Date.now(),
        uuid: crypto.randomUUID(),
        model: data.model ?? "claude-opus-4-6",
        permissionMode: data.permissionMode ?? "default",
        cwd: data.cwd,
      },
    });

    // Send models
    socket.emit("message", {
      type: "models",
      models: [
        { value: "claude-opus-4-6", displayName: "Claude Opus 4.6", description: "Most capable" },
        { value: "claude-sonnet-4-5-20250929", displayName: "Claude Sonnet 4.5", description: "Fast" },
      ],
    });

    // Send history if resuming
    if (data.resume === "large-session") {
      socket.emit("message", { type: "session_history", messages: generateHistory(200) });
    } else if (data.resume === "test-session-1") {
      socket.emit("message", {
        type: "session_history",
        messages: [
          { role: "user", content: "Hello Claude" },
          { role: "assistant", content: [
            { type: "text", text: "Hello! How can I help you today?\n\nI can:\n- **Write code**\n- Run commands\n- Edit files\n\n```python\nprint('Hello world')\n```" },
          ]},
          { role: "user", content: "Run ls" },
          { role: "assistant", content: [
            { type: "tool-call", toolCallId: "tc-1", toolName: "Bash", args: { command: "ls -la" }, result: "total 48\ndrwxr-xr-x  5 user staff  160 Jan 1 12:00 .\n-rw-r--r--  1 user staff 1234 Jan 1 12:00 index.ts" },
            { type: "text", text: "Here are the files in the current directory." },
          ]},
        ],
      });
    }
  });

  socket.on("user_message", (data: any) => {
    let content = data.content;
    if (data.contentIsJSON && typeof content === "string") {
      try { content = JSON.parse(content); } catch {}
    }

    const isImage = Array.isArray(content) && content.some((b: any) => b.type === "image");
    const textContent = typeof content === "string" ? content
      : Array.isArray(content) ? content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ") : "";

    console.log("[mock] User message:", isImage ? "(image)" : textContent.slice(0, 50));

    // Simulate streaming: message_start -> content_block_start -> deltas -> stop
    const uuid = crypto.randomUUID();
    const sid = "mock-session";

    // message_start
    socket.emit("message", {
      type: "sdk_message",
      message: { type: "stream_event", event: { type: "message_start", message: { usage: {} } }, parent_tool_use_id: null, uuid, session_id: sid },
    });

    // text block start
    socket.emit("message", {
      type: "sdk_message",
      message: { type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, parent_tool_use_id: null, uuid, session_id: sid },
    });

    // Build response
    let responseText: string;
    if (isImage) {
      responseText = "I can see the image you sent. It appears to be a photo. How would you like me to help with it?";
    } else if (textContent.toLowerCase().includes("permission")) {
      // Simulate a permission request
      setTimeout(() => {
        socket.emit("message", {
          type: "permission_request",
          toolUseId: "perm-" + Date.now(),
          toolName: "Bash",
          input: { command: "rm -rf /tmp/test" },
          description: "Delete test directory",
        });
      }, 500);
      responseText = "I need to run a command that requires your permission.";
    } else {
      responseText = `You said: "${textContent}"\n\nHere's a mock response with **markdown**:\n\n- Item 1\n- Item 2\n\n\`\`\`typescript\nconst x = 42;\nconsole.log(x);\n\`\`\``;
    }

    // Stream the text character by character (batched for speed)
    const chunkSize = 20;
    let i = 0;
    const interval = setInterval(() => {
      const chunk = responseText.slice(i, i + chunkSize);
      if (!chunk) {
        clearInterval(interval);
        // content_block_stop
        socket.emit("message", {
          type: "sdk_message",
          message: { type: "stream_event", event: { type: "content_block_stop", index: 0 }, parent_tool_use_id: null, uuid, session_id: sid },
        });
        // message_stop
        socket.emit("message", {
          type: "sdk_message",
          message: { type: "stream_event", event: { type: "message_stop" }, parent_tool_use_id: null, uuid, session_id: sid },
        });
        // result
        socket.emit("message", {
          type: "sdk_message",
          message: { type: "result", uuid: crypto.randomUUID(), session_id: sid, subtype: "success", result: "", total_cost_usd: 0.01, duration_ms: 500, num_turns: 1 },
        });
        // token usage
        socket.emit("message", {
          type: "token_usage",
          usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500, cacheCreationTokens: 0, costUsd: 0.01, contextWindow: 200000, maxOutputTokens: 16000, currentContextTokens: 1200 },
        });
        return;
      }
      socket.emit("message", {
        type: "sdk_message",
        message: { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: chunk } }, parent_tool_use_id: null, uuid, session_id: sid },
      });
      i += chunkSize;
    }, 30);
  });

  socket.on("permission_response", (data: any) => {
    console.log("[mock] Permission response:", data.allow ? "allowed" : "denied");
  });

  socket.on("reconnect_request", () => {});
  socket.on("interrupt", () => console.log("[mock] Interrupted"));
  socket.on("disconnect", () => console.log("[mock] Client disconnected"));
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock] Mock server running on http://0.0.0.0:${PORT}`);
});
