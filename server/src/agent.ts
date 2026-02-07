import {
  query,
  type Query,
  type PermissionMode,
  type PermissionResult,
  type SDKMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type ModelInfo,
} from "@anthropic-ai/claude-agent-sdk";
import type { ServerMessage, TokenUsage } from "./types.js";

type SendFn = (msg: ServerMessage) => void;

/**
 * Async message bridge: lets us push messages into an async generator
 * that the SDK consumes as its streaming input.
 */
class MessageBridge {
  private resolveNext: ((msg: unknown) => void) | null = null;
  private queue: unknown[] = [];
  private closed = false;

  push(msg: unknown) {
    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = null;
      resolve(msg);
    } else {
      this.queue.push(msg);
    }
  }

  close() {
    this.closed = true;
    if (this.resolveNext) {
      this.resolveNext(null);
      this.resolveNext = null;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<unknown> {
    while (true) {
      let msg: unknown;
      if (this.queue.length > 0) {
        msg = this.queue.shift()!;
      } else if (this.closed) {
        return;
      } else {
        msg = await new Promise((resolve) => {
          this.resolveNext = resolve;
        });
      }
      if (msg === null) return;
      yield msg;
    }
  }
}

export interface SessionConfig {
  cwd: string;
  model?: string;
  permissionMode?: PermissionMode;
  enable1mContext?: boolean;
  resume?: string;
}

export class AgentSession {
  private queryInstance: Query | null = null;
  private bridge = new MessageBridge();
  private pendingPermissions = new Map<
    string,
    { resolve: (result: PermissionResult) => void }
  >();
  private send: SendFn;
  private sessionId: string | null = null;
  private running = false;
  private usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    contextWindow: 0,
    maxOutputTokens: 0,
  };

  constructor(send: SendFn) {
    this.send = send;
  }

  async start(config: SessionConfig) {
    if (this.running) {
      this.send({ type: "error", message: "Session already running" });
      return;
    }

    this.running = true;
    this.bridge = new MessageBridge();

    const options: Parameters<typeof query>[0]["options"] = {
      cwd: config.cwd,
      includePartialMessages: true,
      systemPrompt: { type: "preset", preset: "claude_code" },
      tools: { type: "preset", preset: "claude_code" },
      settingSources: ["user", "project", "local"],
      allowDangerouslySkipPermissions: true,
      canUseTool: async (toolName, input, opts) => {
        return this.handlePermissionRequest(toolName, input, opts);
      },
      stderr: (data: string) => {
        console.error("[agent:stderr]", data);
      },
    };

    if (config.model) {
      options.model = config.model;
    }

    if (config.permissionMode) {
      options.permissionMode = config.permissionMode;
    }

    if (config.enable1mContext) {
      options.betas = ["context-1m-2025-08-07"];
    }

    if (config.resume) {
      options.resume = config.resume;
    }

    try {
      console.log("[agent] Creating query with options:", {
        cwd: config.cwd,
        model: options.model,
        permissionMode: options.permissionMode,
        betas: options.betas,
        resume: options.resume,
      });

      const q = query({
        prompt: this.bridge[Symbol.asyncIterator]() as any,
        options,
      });
      this.queryInstance = q;
      console.log("[agent] Query created, processing messages...");

      // Process messages in the background
      this.processMessages(q).catch((err) => {
        console.error("[agent] Session error:", err);
        this.send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });

      // Fetch available models after init
      try {
        const models = await q.supportedModels();
        console.log("[agent] Got models:", models.length);
        this.send({ type: "models", models });
      } catch (err) {
        console.error("[agent] Failed to fetch models:", err);
      }
    } catch (err) {
      console.error("[agent] Failed to create query:", err);
      this.running = false;
      this.send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async processMessages(q: Query) {
    console.log("[agent] Starting message loop...");
    try {
      for await (const message of q) {
        const msg = message as SDKMessage;
        const extra = msg.type === "stream_event" ? (msg as any).event?.type : ("subtype" in msg ? (msg as any).subtype : "");
        console.log("[agent] Got message:", msg.type, extra);

        // Extract session ID from init message
        if (msg.type === "system" && "subtype" in msg && msg.subtype === "init") {
          const initMsg = msg as SDKSystemMessage;
          this.sessionId = initMsg.session_id;
          this.send({ type: "session_started", sessionId: this.sessionId });
        }

        // Track token usage from result messages
        if (msg.type === "result") {
          const resultMsg = msg as SDKResultMessage;
          this.updateUsageFromResult(resultMsg);
          if ("errors" in resultMsg && resultMsg.errors?.length) {
            console.error("[agent] Result errors:", resultMsg.errors);
          }
        }

        // Track streaming token usage from partial messages
        if (msg.type === "stream_event") {
          this.updateUsageFromStreamEvent(msg);
        }

        // Forward all SDK messages to client
        this.send({ type: "sdk_message", message: msg });
      }
    } finally {
      this.running = false;
      this.send({
        type: "session_ended",
        reason: "Agent session completed",
      });
    }
  }

  private updateUsageFromStreamEvent(msg: any) {
    const event = msg.event;
    if (!event) return;

    if (event.type === "message_start" && event.message?.usage) {
      const u = event.message.usage;
      this.usage.inputTokens += u.input_tokens ?? 0;
      this.usage.outputTokens += u.output_tokens ?? 0;
      this.usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      this.usage.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
      this.sendUsage();
    }

    if (event.type === "message_delta" && event.usage) {
      const u = event.usage;
      this.usage.outputTokens += u.output_tokens ?? 0;
      this.sendUsage();
    }
  }

  private updateUsageFromResult(msg: SDKResultMessage) {
    if (msg.usage) {
      this.usage.inputTokens = (msg.usage.input_tokens as number) ?? 0;
      this.usage.outputTokens = (msg.usage.output_tokens as number) ?? 0;
      this.usage.cacheReadTokens =
        (msg.usage.cache_read_input_tokens as number) ?? 0;
      this.usage.cacheCreationTokens =
        (msg.usage.cache_creation_input_tokens as number) ?? 0;
    }

    this.usage.costUsd = msg.total_cost_usd ?? 0;

    // Extract context window from modelUsage
    if (msg.modelUsage) {
      for (const mu of Object.values(msg.modelUsage)) {
        if (mu.contextWindow) this.usage.contextWindow = mu.contextWindow;
        if (mu.maxOutputTokens) this.usage.maxOutputTokens = mu.maxOutputTokens;
        this.usage.costUsd = mu.costUSD ?? this.usage.costUsd;
      }
    }

    this.sendUsage();
  }

  private sendUsage() {
    this.send({ type: "token_usage", usage: { ...this.usage } });
  }

  private async handlePermissionRequest(
    toolName: string,
    input: Record<string, unknown>,
    opts: {
      signal: AbortSignal;
      suggestions?: any[];
      blockedPath?: string;
      decisionReason?: string;
      toolUseID: string;
      agentID?: string;
    }
  ): Promise<PermissionResult> {
    const toolUseId = opts.toolUseID;

    // Handle AskUserQuestion separately
    if (toolName === "AskUserQuestion") {
      this.send({
        type: "permission_request",
        toolUseId,
        toolName,
        input,
        description: "Claude is asking a question",
        decisionReason: opts.decisionReason,
      });
    } else {
      this.send({
        type: "permission_request",
        toolUseId,
        toolName,
        input,
        description: (input as any).description,
        decisionReason: opts.decisionReason,
      });
    }

    // Wait for client response
    return new Promise<PermissionResult>((resolve) => {
      this.pendingPermissions.set(toolUseId, { resolve });

      // Clean up on abort
      opts.signal.addEventListener("abort", () => {
        if (this.pendingPermissions.has(toolUseId)) {
          this.pendingPermissions.delete(toolUseId);
          resolve({ behavior: "deny", message: "Request aborted" });
        }
      });
    });
  }

  sendUserMessage(content: string) {
    if (!this.running) {
      this.send({ type: "error", message: "No active session" });
      return;
    }

    this.bridge.push({
      type: "user",
      message: { role: "user", content },
    });
  }

  resolvePermission(
    toolUseId: string,
    allow: boolean,
    updatedInput?: Record<string, unknown>,
    denyMessage?: string
  ) {
    const pending = this.pendingPermissions.get(toolUseId);
    if (!pending) return;

    this.pendingPermissions.delete(toolUseId);

    if (allow) {
      pending.resolve({
        behavior: "allow",
        updatedInput: updatedInput ?? {},
      });
    } else {
      pending.resolve({
        behavior: "deny",
        message: denyMessage ?? "User denied this action",
      });
    }
  }

  resolveAskQuestion(
    toolUseId: string,
    questions: unknown[],
    answers: Record<string, string>
  ) {
    const pending = this.pendingPermissions.get(toolUseId);
    if (!pending) return;

    this.pendingPermissions.delete(toolUseId);
    pending.resolve({
      behavior: "allow",
      updatedInput: { questions, answers },
    });
  }

  async interrupt() {
    if (this.queryInstance) {
      try {
        await this.queryInstance.interrupt();
      } catch (err) {
        console.error("[agent] Interrupt error:", err);
      }
    }
  }

  async setModel(model: string) {
    if (this.queryInstance) {
      await this.queryInstance.setModel(model);
    }
  }

  async setPermissionMode(mode: PermissionMode) {
    if (this.queryInstance) {
      await this.queryInstance.setPermissionMode(mode);
    }
  }

  async setMaxThinkingTokens(tokens: number | null) {
    if (this.queryInstance) {
      try {
        await this.queryInstance.setMaxThinkingTokens(tokens);
      } catch (err) {
        console.error("[agent] setMaxThinkingTokens error:", err);
      }
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    if (this.queryInstance) {
      return await this.queryInstance.supportedModels();
    }
    return [];
  }

  close() {
    this.bridge.close();
    if (this.queryInstance) {
      this.queryInstance.close();
    }
    this.running = false;

    // Reject any pending permissions
    for (const [, pending] of this.pendingPermissions) {
      pending.resolve({ behavior: "deny", message: "Session closed" });
    }
    this.pendingPermissions.clear();
  }

  get isRunning() {
    return this.running;
  }
}
