import Foundation

// MARK: - Top-Level Server Message (Socket.IO "message" event)

/// Discriminated union matching server/src/types.ts ServerMessage.
/// Decoded manually because the JSON uses a `type` discriminator.
enum ServerMessage {
    case sdkMessage(SDKMessagePayload)
    case permissionRequest(PermissionRequestPayload)
    case tokenUsage(TokenUsagePayload)
    case models([ModelInfoPayload])
    case gitStatus(GitStatusPayload)
    case error(String)
    case sessionStarted(String)    // sessionId
    case sessionEnded(String)      // reason
    case sessionState(SessionStatePayload)
    case sessionHistory([HistoryEntry])
    case thinkingTokensUpdated(Int?)
    case unknown(String)
}

extension ServerMessage {
    /// Decode from a raw JSON dictionary (from Socket.IO).
    static func decode(from dict: [String: Any]) -> ServerMessage {
        guard let type = dict["type"] as? String else {
            return .unknown("missing type")
        }

        switch type {
        case "sdk_message":
            let message = dict["message"] as? [String: Any] ?? [:]
            let payload = SDKMessagePayload.decode(from: message)
            return .sdkMessage(payload)

        case "permission_request":
            let payload = PermissionRequestPayload(
                toolUseId: dict["toolUseId"] as? String ?? "",
                toolName: dict["toolName"] as? String ?? "",
                input: dict["input"] as? [String: Any] ?? [:],
                description: dict["description"] as? String,
                decisionReason: dict["decisionReason"] as? String
            )
            return .permissionRequest(payload)

        case "token_usage":
            if let usage = dict["usage"] as? [String: Any] {
                let payload = TokenUsagePayload(
                    inputTokens: usage["inputTokens"] as? Int ?? 0,
                    outputTokens: usage["outputTokens"] as? Int ?? 0,
                    cacheReadTokens: usage["cacheReadTokens"] as? Int ?? 0,
                    cacheCreationTokens: usage["cacheCreationTokens"] as? Int ?? 0,
                    costUsd: usage["costUsd"] as? Double ?? 0,
                    contextWindow: usage["contextWindow"] as? Int ?? 0,
                    maxOutputTokens: usage["maxOutputTokens"] as? Int ?? 0,
                    currentContextTokens: usage["currentContextTokens"] as? Int ?? 0
                )
                return .tokenUsage(payload)
            }
            return .tokenUsage(TokenUsagePayload())

        case "models":
            if let arr = dict["models"] as? [[String: Any]] {
                let models = arr.compactMap { ModelInfoPayload.decode(from: $0) }
                return .models(models)
            }
            return .models([])

        case "git_status":
            let payload = GitStatusPayload(
                status: dict["status"] as? String ?? "",
                diff: dict["diff"] as? String ?? "",
                branch: dict["branch"] as? String ?? ""
            )
            return .gitStatus(payload)

        case "error":
            return .error(dict["message"] as? String ?? "Unknown error")

        case "session_started":
            return .sessionStarted(dict["sessionId"] as? String ?? "")

        case "session_ended":
            return .sessionEnded(dict["reason"] as? String ?? "")

        case "session_state":
            let payload = SessionStatePayload(
                sessionId: dict["sessionId"] as? String ?? "",
                cwd: dict["cwd"] as? String ?? "",
                model: dict["model"] as? String ?? "",
                permissionMode: dict["permissionMode"] as? String ?? "default",
                isStreaming: dict["isStreaming"] as? Bool ?? false,
                maxThinkingTokens: dict["maxThinkingTokens"] as? Int
            )
            return .sessionState(payload)

        case "session_history":
            if let arr = dict["messages"] as? [[String: Any]] {
                let entries = arr.compactMap { HistoryEntry.decode(from: $0) }
                return .sessionHistory(entries)
            }
            return .sessionHistory([])

        case "thinking_tokens_updated":
            return .thinkingTokensUpdated(dict["tokens"] as? Int)

        default:
            return .unknown(type)
        }
    }
}

// MARK: - SDK Message (the inner `message` of sdk_message)

enum SDKMessagePayload {
    case system(SDKSystemPayload)
    case assistant(SDKAssistantPayload)
    case user(SDKUserPayload)
    case streamEvent(SDKStreamEventPayload)
    case result(SDKResultPayload)
    case unknown(String)
}

extension SDKMessagePayload {
    static func decode(from dict: [String: Any]) -> SDKMessagePayload {
        guard let type = dict["type"] as? String else { return .unknown("") }

        switch type {
        case "system":
            return .system(SDKSystemPayload(
                subtype: dict["subtype"] as? String ?? "",
                sessionId: dict["session_id"] as? String,
                model: dict["model"] as? String,
                permissionMode: dict["permissionMode"] as? String,
                cwd: dict["cwd"] as? String,
                status: dict["status"] as? String
            ))

        case "assistant":
            let msg = dict["message"] as? [String: Any] ?? [:]
            let rawContent = msg["content"] as? [[String: Any]] ?? []
            let blocks = rawContent.compactMap { ContentBlock.decode(from: $0) }
            return .assistant(SDKAssistantPayload(
                uuid: dict["uuid"] as? String ?? "",
                sessionId: dict["session_id"] as? String ?? "",
                parentToolUseId: dict["parent_tool_use_id"] as? String,
                content: blocks
            ))

        case "user":
            return .user(SDKUserPayload(
                uuid: dict["uuid"] as? String ?? "",
                parentToolUseId: dict["parent_tool_use_id"] as? String,
                message: dict["message"] as? [String: Any] ?? [:],
                isReplay: dict["isReplay"] as? Bool ?? false
            ))

        case "stream_event":
            let event = dict["event"] as? [String: Any] ?? [:]
            return .streamEvent(SDKStreamEventPayload(
                uuid: dict["uuid"] as? String,
                sessionId: dict["session_id"] as? String ?? "",
                parentToolUseId: dict["parent_tool_use_id"] as? String,
                event: event
            ))

        case "result":
            return .result(SDKResultPayload(
                uuid: dict["uuid"] as? String ?? "",
                sessionId: dict["session_id"] as? String ?? "",
                subtype: dict["subtype"] as? String ?? "",
                result: dict["result"] as? String,
                totalCostUsd: dict["total_cost_usd"] as? Double,
                durationMs: dict["duration_ms"] as? Int,
                numTurns: dict["num_turns"] as? Int,
                errors: dict["errors"] as? [String]
            ))

        default:
            return .unknown(type)
        }
    }
}

// MARK: - SDK Sub-payloads

struct SDKSystemPayload {
    let subtype: String    // "init", "status", "compact_boundary"
    let sessionId: String?
    let model: String?
    let permissionMode: String?
    let cwd: String?
    let status: String?    // "compacting" | nil
}

struct SDKAssistantPayload {
    let uuid: String
    let sessionId: String
    let parentToolUseId: String?
    let content: [ContentBlock]
}

struct SDKUserPayload {
    let uuid: String
    let parentToolUseId: String?
    let message: [String: Any]    // raw for flexible parsing
    let isReplay: Bool
}

struct SDKStreamEventPayload {
    let uuid: String?
    let sessionId: String
    let parentToolUseId: String?
    let event: [String: Any]      // raw — parsed by SessionStore

    var eventType: String {
        event["type"] as? String ?? ""
    }
}

struct SDKResultPayload {
    let uuid: String
    let sessionId: String
    let subtype: String
    let result: String?
    let totalCostUsd: Double?
    let durationMs: Int?
    let numTurns: Int?
    let errors: [String]?
}

// MARK: - Content Blocks (from assistant messages)

enum ContentBlock {
    case text(String)
    case thinking(String)
    case toolUse(ToolUseBlock)
    case toolResult(ToolResultBlock)
}

extension ContentBlock {
    static func decode(from dict: [String: Any]) -> ContentBlock? {
        guard let type = dict["type"] as? String else { return nil }
        switch type {
        case "text":
            return .text(dict["text"] as? String ?? "")
        case "thinking":
            return .thinking(dict["thinking"] as? String ?? "")
        case "tool_use":
            return .toolUse(ToolUseBlock(
                id: dict["id"] as? String ?? "",
                name: dict["name"] as? String ?? "",
                input: dict["input"] as? [String: Any] ?? [:]
            ))
        case "tool_result":
            let content = dict["content"]
            var resultText = ""
            if let s = content as? String {
                resultText = s
            } else if let arr = content as? [[String: Any]] {
                resultText = arr
                    .filter { ($0["type"] as? String) == "text" }
                    .compactMap { $0["text"] as? String }
                    .joined(separator: "\n")
            }
            return .toolResult(ToolResultBlock(
                toolUseId: dict["tool_use_id"] as? String ?? "",
                content: resultText
            ))
        default:
            return nil
        }
    }
}

struct ToolUseBlock {
    let id: String
    let name: String
    let input: [String: Any]
}

struct ToolResultBlock {
    let toolUseId: String
    let content: String
}

// MARK: - Server Message Payloads

struct PermissionRequestPayload {
    let toolUseId: String
    let toolName: String
    let input: [String: Any]
    let description: String?
    let decisionReason: String?
}

struct TokenUsagePayload {
    var inputTokens: Int = 0
    var outputTokens: Int = 0
    var cacheReadTokens: Int = 0
    var cacheCreationTokens: Int = 0
    var costUsd: Double = 0
    var contextWindow: Int = 0
    var maxOutputTokens: Int = 0
    var currentContextTokens: Int = 0
}

struct ModelInfoPayload: Identifiable {
    var id: String { value }
    let value: String
    let displayName: String
    let description: String

    static func decode(from dict: [String: Any]) -> ModelInfoPayload? {
        guard let value = dict["value"] as? String else { return nil }
        return ModelInfoPayload(
            value: value,
            displayName: dict["displayName"] as? String ?? value,
            description: dict["description"] as? String ?? ""
        )
    }
}

struct GitStatusPayload {
    let status: String
    let diff: String
    let branch: String
}

struct SessionStatePayload {
    let sessionId: String
    let cwd: String
    let model: String
    let permissionMode: String
    let isStreaming: Bool
    let maxThinkingTokens: Int?
}

// MARK: - History Entries (for session replay)

enum HistoryEntry {
    case user(String)
    case assistant([HistoryContentPart])
    case system(String)
}

extension HistoryEntry {
    static func decode(from dict: [String: Any]) -> HistoryEntry? {
        guard let role = dict["role"] as? String else { return nil }
        switch role {
        case "user":
            return .user(dict["content"] as? String ?? "")
        case "assistant":
            if let parts = dict["content"] as? [[String: Any]] {
                let decoded = parts.compactMap { HistoryContentPart.decode(from: $0) }
                return .assistant(decoded)
            }
            return .assistant([])
        case "system":
            return .system(dict["content"] as? String ?? "")
        default:
            return nil
        }
    }
}

enum HistoryContentPart {
    case text(String)
    case reasoning(String)
    case toolCall(HistoryToolCall)
}

extension HistoryContentPart {
    static func decode(from dict: [String: Any]) -> HistoryContentPart? {
        guard let type = dict["type"] as? String else { return nil }
        switch type {
        case "text":
            return .text(dict["text"] as? String ?? "")
        case "reasoning":
            return .reasoning(dict["text"] as? String ?? "")
        case "tool-call":
            return .toolCall(HistoryToolCall(
                toolCallId: dict["toolCallId"] as? String ?? "",
                toolName: dict["toolName"] as? String ?? "",
                args: dict["args"] as? [String: Any] ?? [:],
                result: dict["result"] as? String
            ))
        default:
            return nil
        }
    }
}

struct HistoryToolCall {
    let toolCallId: String
    let toolName: String
    let args: [String: Any]
    let result: String?
}
