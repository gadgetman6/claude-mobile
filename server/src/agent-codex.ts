import { Codex } from "@openai/codex-sdk";
import type { Thread, ThreadEvent, ThreadItem } from "@openai/codex-sdk";
import type { ServerMessage, TokenUsage } from "./types.js";

type SendFn = (msg: ServerMessage) => void;

export interface CodexSessionConfig {
  cwd: string;
  model?: string;
  resume?: string;
}

/**
 * Wraps the Codex SDK to provide the same interface as AgentSession.
 * Maps Codex ThreadEvents → ServerMessages so the client renders them
 * using existing tool UIs (Bash → command_execution, Edit → file_change, etc.)
 */
export class CodexSession {
  private codex: Codex;
  private thread: Thread | null = null;
  private send: SendFn;
  private sessionId: string | null = null;
  private running = false;
  private streaming = false;
  private usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    contextWindow: 400_000,
    maxOutputTokens: 65_536,
    currentContextTokens: 0,
  };
  private pendingInput: {
    resolve: (value: string) => void;
  } | null = null;

  constructor(send: SendFn) {
    this.send = send;
    this.codex = new Codex();
  }

  async start(config: CodexSessionConfig) {
    if (this.running) {
      this.send({ type: "error", message: "Session already running" });
      return;
    }

    this.running = true;

    try {
      const threadOptions: Parameters<Codex["startThread"]>[0] = {
        workingDirectory: config.cwd,
        skipGitRepoCheck: true,
      };

      if (config.resume) {
        console.log("[codex] Resuming thread:", config.resume);
        this.thread = this.codex.resumeThread(config.resume, threadOptions);
        this.sessionId = config.resume;
      } else {
        console.log("[codex] Starting new thread in:", config.cwd);
        this.thread = this.codex.startThread(threadOptions);
      }

      // Send init message to match Claude SDK format
      this.send({
        type: "sdk_message",
        message: {
          type: "system",
          subtype: "init",
          session_id: this.sessionId ?? "codex-pending",
          uuid: crypto.randomUUID(),
          model: config.model ?? "gpt-5.3-codex",
          permissionMode: "bypassPermissions",
          cwd: config.cwd,
        },
      });

      this.send({ type: "session_started", sessionId: this.sessionId ?? "codex-pending" });
    } catch (err) {
      console.error("[codex] Failed to start:", err);
      this.running = false;
      this.send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async sendUserMessage(content: string | unknown[]) {
    if (!this.thread || !this.running) {
      this.send({ type: "error", message: "No active Codex session" });
      return;
    }

    const text = typeof content === "string"
      ? content
      : (content as { type: string; text?: string }[])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n");

    if (!text) return;

    this.streaming = true;

    try {
      const streamed = await this.thread.runStreamed(text);

      for await (const event of streamed.events) {
        this.handleEvent(event);
      }
    } catch (err) {
      console.error("[codex] Stream error:", err);
      this.send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.streaming = false;
      // Send result message to signal turn end
      this.send({
        type: "sdk_message",
        message: {
          type: "result",
          subtype: "success",
          result: "",
          total_cost_usd: this.usage.costUsd,
          usage: {
            input_tokens: this.usage.inputTokens,
            output_tokens: this.usage.outputTokens,
            cache_read_input_tokens: this.usage.cacheReadTokens,
          },
          duration_ms: 0,
          num_turns: 1,
          session_id: this.sessionId ?? "",
          uuid: crypto.randomUUID(),
        },
      });
    }
  }

  private handleEvent(event: ThreadEvent) {
    const type = event.type;

    switch (type) {
      case "thread.started": {
        this.sessionId = event.thread_id;
        this.send({ type: "session_started", sessionId: event.thread_id });
        break;
      }

      case "turn.started": {
        // Send message_start stream event
        const uuid = crypto.randomUUID();
        this.send({
          type: "sdk_message",
          message: {
            type: "stream_event",
            event: { type: "message_start", message: { usage: {} } },
            parent_tool_use_id: null,
            uuid,
            session_id: this.sessionId ?? "",
          },
        });
        break;
      }

      case "item.started":
      case "item.updated":
      case "item.completed": {
        this.handleItem(event.item, type === "item.completed");
        break;
      }

      case "turn.completed": {
        if (event.usage) {
          this.usage.inputTokens += event.usage.input_tokens ?? 0;
          this.usage.outputTokens += event.usage.output_tokens ?? 0;
          this.usage.cacheReadTokens += event.usage.cached_input_tokens ?? 0;
          this.usage.currentContextTokens =
            (event.usage.input_tokens ?? 0) + (event.usage.cached_input_tokens ?? 0);
          this.sendUsage();
        }
        // Send message_stop
        this.send({
          type: "sdk_message",
          message: {
            type: "stream_event",
            event: { type: "message_stop" },
            parent_tool_use_id: null,
            uuid: crypto.randomUUID(),
            session_id: this.sessionId ?? "",
          },
        });
        break;
      }

      case "turn.failed": {
        this.send({
          type: "error",
          message: (event as { error?: { message?: string } }).error?.message ?? "Turn failed",
        });
        break;
      }

      case "error": {
        this.send({
          type: "error",
          message: (event as { message?: string }).message ?? "Codex error",
        });
        break;
      }
    }
  }

  private handleItem(item: ThreadItem, isComplete: boolean) {
    const uuid = crypto.randomUUID();

    switch (item.type) {
      case "agent_message": {
        // Map to assistant message with text content
        this.send({
          type: "sdk_message",
          message: {
            type: "assistant",
            uuid,
            session_id: this.sessionId ?? "",
            message: {
              content: [{ type: "text", text: item.text }],
            },
          },
        });
        break;
      }

      case "reasoning": {
        // Map to assistant message with thinking content
        this.send({
          type: "sdk_message",
          message: {
            type: "assistant",
            uuid,
            session_id: this.sessionId ?? "",
            message: {
              content: [{ type: "thinking", thinking: item.text }],
            },
          },
        });
        break;
      }

      case "command_execution": {
        // Map to assistant message with Bash tool_use + result
        const toolId = item.id;
        const content: unknown[] = [
          {
            type: "tool_use",
            id: toolId,
            name: "Bash",
            input: {
              command: item.command,
              description: item.command.length > 60 ? item.command.slice(0, 60) + "..." : undefined,
            },
          },
        ];
        this.send({
          type: "sdk_message",
          message: {
            type: "assistant",
            uuid,
            session_id: this.sessionId ?? "",
            message: { content },
          },
        });

        // If complete, send tool result
        if (isComplete && item.aggregated_output) {
          this.send({
            type: "sdk_message",
            message: {
              type: "user",
              uuid: crypto.randomUUID(),
              session_id: this.sessionId ?? "",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: toolId,
                    content: item.aggregated_output,
                  },
                ],
              },
            },
          });
        }
        break;
      }

      case "file_change": {
        // Map each changed file to an Edit/Write tool_use
        for (const change of item.changes ?? []) {
          const changeToolId = `${item.id}-${change.path}`;
          const toolName = change.kind === "add" ? "Write" : "Edit";
          const content: unknown[] = [
            {
              type: "tool_use",
              id: changeToolId,
              name: toolName,
              input: {
                file_path: change.path,
                ...(change.kind === "add"
                  ? { content: "(file created)" }
                  : { old_string: "(original)", new_string: "(modified)" }),
              },
            },
          ];
          this.send({
            type: "sdk_message",
            message: {
              type: "assistant",
              uuid: crypto.randomUUID(),
              session_id: this.sessionId ?? "",
              message: { content },
            },
          });
        }
        break;
      }

      case "web_search": {
        const toolId = item.id;
        this.send({
          type: "sdk_message",
          message: {
            type: "assistant",
            uuid,
            session_id: this.sessionId ?? "",
            message: {
              content: [
                {
                  type: "tool_use",
                  id: toolId,
                  name: "WebSearch",
                  input: { query: (item as { query?: string }).query ?? "" },
                },
              ],
            },
          },
        });
        break;
      }

      case "todo_list": {
        const todos = ((item as { items?: { text: string; completed: boolean }[] }).items ?? []).map((t) => ({
          content: t.text,
          status: t.completed ? "completed" as const : "pending" as const,
          activeForm: t.text,
        }));
        this.send({
          type: "sdk_message",
          message: {
            type: "assistant",
            uuid,
            session_id: this.sessionId ?? "",
            message: {
              content: [
                {
                  type: "tool_use",
                  id: item.id,
                  name: "TodoWrite",
                  input: { todos },
                },
              ],
            },
          },
        });
        break;
      }

      case "error": {
        this.send({
          type: "error",
          message: (item as { message?: string }).message ?? "Item error",
        });
        break;
      }
    }
  }

  private sendUsage() {
    this.send({ type: "token_usage", usage: { ...this.usage } });
  }

  // Stub methods to match AgentSession interface
  resolvePermission() {}
  resolveAskQuestion() {}

  async interrupt() {
    // No direct interrupt in Codex SDK — close and restart
    this.close();
  }

  async setModel(_model: string) {
    // Codex model is set via config.toml, not per-session
  }

  async setPermissionMode(_mode: string) {}
  async setMaxThinkingTokens(_tokens: number | null) {}

  async getModels() {
    return [
      { value: "gpt-5.3-codex", displayName: "GPT-5.3 Codex", description: "Latest Codex model" },
      { value: "o4-mini", displayName: "O4 Mini", description: "Fast reasoning model" },
    ];
  }

  close() {
    this.running = false;
    this.thread = null;
  }

  get isRunning() {
    return this.running;
  }

  get isStreaming() {
    return this.streaming;
  }

  get currentUsage(): TokenUsage {
    return { ...this.usage };
  }
}
