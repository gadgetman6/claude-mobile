import Foundation
import Observation

/// Holds all session state: messages, streaming, usage, permissions.
/// Mirrors useClaudeSession.ts from the React frontend.
@Observable
final class SessionStore {

    // MARK: - Connection

    enum ConnectionState: String {
        case disconnected, connecting, connected
    }

    var connectionState: ConnectionState = .disconnected

    // MARK: - Session

    var sessionId: String?
    var error: String?
    var isStreaming = false
    var isCompacting = false

    // MARK: - Config

    var currentModel: String = ""
    var permissionMode: String = "default"
    var maxThinkingTokens: Int?

    // MARK: - Messages

    var messages: [DisplayMessage] = []

    // MARK: - Token Usage

    var usage = TokenUsage()

    // MARK: - Models

    var models: [ModelInfo] = []

    // MARK: - Permissions

    var pendingPermission: PermissionRequest?

    // MARK: - Git

    var gitStatus: GitStatus?

    // MARK: - Nested Content (for TaskToolUI subagents)

    var nestedContentMap: [String: [DisplayMessage]] = [:]

    // MARK: - Services

    let socketService = SocketIOService()

    // MARK: - Streaming State (mutable accumulators, not displayed directly)

    private var streamingBlocks: [StreamBlock] = []
    private var streamingUuid: String = ""
    private var partialJson: [Int: String] = [:]

    // MARK: - Connect

    func connect(to server: Server) {
        // Set connecting immediately so the UI updates before the async callback
        connectionState = .connecting
        error = nil

        socketService.connect(
            to: server,
            onMessage: { [weak self] msg in
                DispatchQueue.main.async {
                    self?.handleServerMessage(msg)
                }
            },
            onConnectionChange: { [weak self] state in
                DispatchQueue.main.async {
                    switch state {
                    case .connected: self?.connectionState = .connected
                    case .connecting: self?.connectionState = .connecting
                    case .disconnected: self?.connectionState = .disconnected
                    }
                }
            }
        )
    }

    func disconnect() {
        socketService.disconnect()
        connectionState = .disconnected
    }

    // MARK: - Actions

    func startSession(
        cwd: String,
        model: String,
        permissionMode: String,
        enable1mContext: Bool,
        resumeId: String?,
        provider: String
    ) {
        messages = []
        usage = TokenUsage()
        nestedContentMap = [:]
        socketService.emitStartSession(
            cwd: cwd,
            model: model,
            permissionMode: permissionMode,
            enable1mContext: enable1mContext,
            resume: resumeId,
            provider: provider
        )
    }

    func sendMessage(_ text: String) {
        messages.append(DisplayMessage(
            id: UUID().uuidString,
            role: .user,
            content: [.text(text)]
        ))
        socketService.emitUserMessage(content: text)
    }

    func sendContentBlocks(_ blocks: [[String: Any]]) {
        // Build display parts from content blocks
        var displayParts: [ContentPart] = []
        for block in blocks {
            let type = block["type"] as? String
            if type == "text", let text = block["text"] as? String, !text.isEmpty {
                displayParts.append(.text(text))
            } else if type == "image",
                      let source = block["source"] as? [String: Any],
                      let base64 = source["data"] as? String,
                      let data = Data(base64Encoded: base64) {
                displayParts.append(.image(data))
            }
        }
        if !displayParts.isEmpty {
            messages.append(DisplayMessage(
                id: UUID().uuidString,
                role: .user,
                content: displayParts
            ))
        }
        socketService.emitUserMessage(content: blocks)
    }

    func respondPermission(toolUseId: String, allow: Bool, denyMessage: String? = nil) {
        socketService.emitPermissionResponse(toolUseId: toolUseId, allow: allow, denyMessage: denyMessage)
        pendingPermission = nil
    }

    func respondAskQuestion(toolUseId: String, questions: [[String: Any]], answers: [String: String]) {
        socketService.emitAskQuestionResponse(toolUseId: toolUseId, questions: questions, answers: answers)
        pendingPermission = nil
    }

    func interrupt() {
        socketService.emitInterrupt()
    }

    func changeModel(_ model: String) {
        socketService.emitSetModel(model)
        currentModel = model
    }

    func changePermissionMode(_ mode: String) {
        socketService.emitSetPermissionMode(mode)
        permissionMode = mode
    }

    func changeThinkingTokens(_ tokens: Int?) {
        socketService.emitSetThinkingTokens(tokens)
        maxThinkingTokens = tokens
    }

    func fetchModels() {
        socketService.emitGetModels()
    }

    func fetchGitStatus(cwd: String?) {
        socketService.emitGetGitStatus(cwd: cwd)
    }

    func reconnect() {
        socketService.emitReconnectRequest()
    }

    // MARK: - Server Message Dispatch

    private func handleServerMessage(_ msg: ServerMessage) {
        switch msg {
        case .sdkMessage(let payload):
            handleSDKMessage(payload)

        case .permissionRequest(let payload):
            pendingPermission = PermissionRequest(
                toolUseId: payload.toolUseId,
                toolName: payload.toolName,
                input: payload.input,
                description: payload.description,
                decisionReason: payload.decisionReason
            )

        case .tokenUsage(let payload):
            usage = TokenUsage(
                inputTokens: payload.inputTokens,
                outputTokens: payload.outputTokens,
                cacheReadTokens: payload.cacheReadTokens,
                cacheCreationTokens: payload.cacheCreationTokens,
                costUsd: payload.costUsd,
                contextWindow: payload.contextWindow,
                maxOutputTokens: payload.maxOutputTokens,
                currentContextTokens: payload.currentContextTokens
            )

        case .models(let payload):
            models = payload.map { ModelInfo(value: $0.value, displayName: $0.displayName, description: $0.description) }

        case .gitStatus(let payload):
            gitStatus = GitStatus(status: payload.status, diff: payload.diff, branch: payload.branch)

        case .error(let message):
            error = message

        case .sessionStarted(let sid):
            sessionId = sid
            error = nil

        case .sessionEnded:
            isStreaming = false
            sessionId = nil

        case .sessionState(let payload):
            messages = []
            streamingBlocks = []
            partialJson = [:]
            nestedContentMap = [:]
            sessionId = payload.sessionId
            currentModel = payload.model
            permissionMode = payload.permissionMode
            isStreaming = payload.isStreaming
            if let serverTokens = payload.maxThinkingTokens {
                maxThinkingTokens = serverTokens
            } else if let localTokens = maxThinkingTokens {
                // Server lost the value (e.g. restart) — re-sync from client
                socketService.emitSetThinkingTokens(localTokens)
            }

        case .sessionHistory(let entries):
            let converted = entries.compactMap { historyEntryToDisplayMessage($0) }
            messages = converted

        case .thinkingTokensUpdated(let tokens):
            maxThinkingTokens = tokens

        case .unknown:
            break
        }
    }

    // MARK: - SDK Message Handling

    private func handleSDKMessage(_ msg: SDKMessagePayload) {
        switch msg {
        case .system(let payload):
            handleSystemMessage(payload)

        case .assistant(let payload):
            handleAssistantMessage(payload)

        case .user(let payload):
            handleUserMessage(payload)

        case .streamEvent(let payload):
            // Skip subagent stream events
            guard payload.parentToolUseId == nil else { break }
            isStreaming = true
            handleStreamEvent(payload)

        case .result(let payload):
            isStreaming = false
            isCompacting = false
            var parts: [String] = []
            if let duration = payload.durationMs { parts.append(String(format: "Duration: %.1fs", Double(duration) / 1000)) }
            if let turns = payload.numTurns { parts.append("Turns: \(turns)") }
            if let errs = payload.errors, !errs.isEmpty { parts.append("Errors: \(errs.joined(separator: ", "))") }
            let text = parts.isEmpty ? "Done" : parts.joined(separator: " · ")
            messages.append(DisplayMessage(id: UUID().uuidString, role: .system, content: [.text(text)]))

        case .unknown:
            break
        }
    }

    private func handleSystemMessage(_ payload: SDKSystemPayload) {
        switch payload.subtype {
        case "init":
            isCompacting = false
            currentModel = payload.model ?? currentModel
            permissionMode = payload.permissionMode ?? permissionMode
            if let sid = payload.sessionId { sessionId = sid }
            let initText = "Session initialized. Model: \(payload.model ?? "unknown")"
            if !messages.contains(where: { $0.role == .system }) {
                messages.append(DisplayMessage(id: UUID().uuidString, role: .system, content: [.text(initText)]))
            }

        case "status":
            isCompacting = payload.status == "compacting"
            if isCompacting {
                messages.append(DisplayMessage(id: UUID().uuidString, role: .system, content: [.text("Compacting conversation...")]))
            }

        case "compact_boundary":
            isCompacting = false
            messages.append(DisplayMessage(id: UUID().uuidString, role: .system, content: [.text("Context compacted")]))

        default:
            break
        }
    }

    private func handleAssistantMessage(_ payload: SDKAssistantPayload) {
        let parts = payload.content.map { contentBlockToContentPart($0) }
        guard !parts.isEmpty else { return }

        if let parentId = payload.parentToolUseId {
            // Subagent response — store in nested content map
            var existing = nestedContentMap[parentId] ?? []
            existing.append(DisplayMessage(id: payload.uuid, role: .assistant, content: parts))
            nestedContentMap[parentId] = existing
        } else if streamingBlocks.isEmpty {
            messages.append(DisplayMessage(id: payload.uuid, role: .assistant, content: parts))
        }
    }

    private func handleUserMessage(_ payload: SDKUserPayload) {
        // Skip subagent user messages
        guard payload.parentToolUseId == nil else {
            // Check for tool results to attach
            attachToolResults(from: payload)
            return
        }

        let rawContent = payload.message["content"]

        // Handle tool results
        if let arr = rawContent as? [[String: Any]] {
            let toolResults = arr.filter { ($0["type"] as? String) == "tool_result" }
            if !toolResults.isEmpty {
                attachToolResultsFromArray(toolResults)
                return
            }
        }

        // Replay messages
        if payload.isReplay {
            if let text = rawContent as? String, !text.isEmpty {
                messages.append(DisplayMessage(id: UUID().uuidString, role: .user, content: [.text(text)]))
            } else if let arr = rawContent as? [[String: Any]] {
                let text = arr
                    .filter { ($0["type"] as? String) == "text" }
                    .compactMap { $0["text"] as? String }
                    .joined(separator: "\n")
                if !text.isEmpty {
                    messages.append(DisplayMessage(id: UUID().uuidString, role: .user, content: [.text(text)]))
                }
            }
        }
    }

    private func attachToolResults(from payload: SDKUserPayload) {
        guard let rawContent = payload.message["content"] as? [[String: Any]] else { return }
        let toolResults = rawContent.filter { ($0["type"] as? String) == "tool_result" }
        if !toolResults.isEmpty {
            attachToolResultsFromArray(toolResults)
        }
    }

    private func attachToolResultsFromArray(_ toolResults: [[String: Any]]) {
        for i in stride(from: messages.count - 1, through: 0, by: -1) {
            guard messages[i].role == .assistant else { continue }
            var updated = false
            var newContent = messages[i].content
            for (j, part) in newContent.enumerated() {
                if case .toolCall(var tc) = part {
                    if let tr = toolResults.first(where: { ($0["tool_use_id"] as? String) == tc.id }) {
                        let rc = tr["content"]
                        if let s = rc as? String {
                            tc.result = s
                        } else if let arr = rc as? [[String: Any]] {
                            tc.result = arr
                                .filter { ($0["type"] as? String) == "text" }
                                .compactMap { $0["text"] as? String }
                                .joined(separator: "\n")
                        }
                        newContent[j] = .toolCall(tc)
                        updated = true
                    }
                }
            }
            if updated {
                messages[i].content = newContent
                break
            }
        }
    }

    // MARK: - Stream Event Handling

    private func handleStreamEvent(_ payload: SDKStreamEventPayload) {
        let event = payload.event
        let eventType = payload.eventType

        switch eventType {
        case "message_start":
            streamingUuid = payload.uuid ?? UUID().uuidString
            streamingBlocks = []
            partialJson = [:]
            messages.append(DisplayMessage(id: streamingUuid, role: .assistant, content: []))

        case "content_block_start":
            guard let block = event["content_block"] as? [String: Any],
                  let blockType = block["type"] as? String else { return }
            let index = event["index"] as? Int ?? streamingBlocks.count

            switch blockType {
            case "text":
                streamingBlocks.append(.text(block["text"] as? String ?? ""))
            case "thinking":
                streamingBlocks.append(.thinking(block["thinking"] as? String ?? ""))
            case "tool_use":
                partialJson[index] = ""
                streamingBlocks.append(.toolUse(StreamToolUse(
                    id: block["id"] as? String ?? "",
                    name: block["name"] as? String ?? "",
                    input: block["input"] as? [String: Any] ?? [:],
                    inputJson: "",
                    isRunning: true
                )))
            default:
                break
            }
            updateStreamingMessage()

        case "content_block_delta":
            guard let delta = event["delta"] as? [String: Any],
                  let deltaType = delta["type"] as? String,
                  let idx = event["index"] as? Int,
                  idx < streamingBlocks.count else { return }

            switch deltaType {
            case "text_delta":
                if case .text(var t) = streamingBlocks[idx] {
                    t += delta["text"] as? String ?? ""
                    streamingBlocks[idx] = .text(t)
                }
            case "thinking_delta":
                if case .thinking(var t) = streamingBlocks[idx] {
                    t += delta["thinking"] as? String ?? ""
                    streamingBlocks[idx] = .thinking(t)
                }
            case "input_json_delta":
                if case .toolUse(var tu) = streamingBlocks[idx] {
                    let current = partialJson[idx] ?? ""
                    let updated = current + (delta["partial_json"] as? String ?? "")
                    partialJson[idx] = updated
                    tu.inputJson = updated
                    if let data = updated.data(using: .utf8),
                       let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        tu.input = parsed
                    }
                    streamingBlocks[idx] = .toolUse(tu)
                }
            default:
                break
            }
            updateStreamingMessage()

        case "content_block_stop":
            if let idx = event["index"] as? Int, idx < streamingBlocks.count {
                if case .toolUse(var tu) = streamingBlocks[idx] {
                    // Keep Task tools running until message_stop
                    if tu.name != "Task" {
                        tu.isRunning = false
                        streamingBlocks[idx] = .toolUse(tu)
                    }
                }
            }
            updateStreamingMessage()

        case "message_stop":
            isStreaming = false
            let finalParts = streamingBlocks.map { streamBlockToContentPart($0) }
            streamingBlocks = []
            partialJson = [:]
            if let idx = messages.lastIndex(where: { $0.id == streamingUuid }) {
                messages[idx].content = finalParts
                messages[idx].status = .complete
            }

        default:
            break
        }
    }

    private func updateStreamingMessage() {
        let parts = streamingBlocks.map { streamBlockToContentPart($0) }
        if let idx = messages.lastIndex(where: { $0.id == streamingUuid }) {
            messages[idx].content = parts
            messages[idx].status = .running
        }
    }

    // MARK: - Conversion Helpers

    private func contentBlockToContentPart(_ block: ContentBlock) -> ContentPart {
        switch block {
        case .text(let text):
            return .text(text)
        case .thinking(let text):
            return .reasoning(text)
        case .toolUse(let tu):
            let jsonText = (try? JSONSerialization.data(withJSONObject: tu.input, options: [.prettyPrinted, .sortedKeys]))
                .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
            return .toolCall(ToolCallPart(
                id: tu.id,
                toolName: tu.name,
                args: tu.input,
                argsText: jsonText,
                result: nil,
                isRunning: true
            ))
        case .toolResult:
            return .text("")
        }
    }

    private func streamBlockToContentPart(_ block: StreamBlock) -> ContentPart {
        switch block {
        case .text(let text):
            return .text(text)
        case .thinking(let text):
            return .reasoning(text)
        case .toolUse(let tu):
            let jsonText = tu.inputJson.isEmpty
                ? (try? JSONSerialization.data(withJSONObject: tu.input, options: [.prettyPrinted, .sortedKeys]))
                    .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
                : tu.inputJson
            return .toolCall(ToolCallPart(
                id: tu.id,
                toolName: tu.name,
                args: tu.input,
                argsText: jsonText,
                result: nil,
                isRunning: tu.isRunning
            ))
        }
    }

    private func historyEntryToDisplayMessage(_ entry: HistoryEntry) -> DisplayMessage? {
        switch entry {
        case .user(let text):
            return DisplayMessage(id: UUID().uuidString, role: .user, content: [.text(text)])
        case .assistant(let parts):
            let contentParts: [ContentPart] = parts.compactMap { part in
                switch part {
                case .text(let text): return .text(text)
                case .reasoning(let text): return .reasoning(text)
                case .toolCall(let tc):
                    let jsonText = (try? JSONSerialization.data(withJSONObject: tc.args, options: [.prettyPrinted]))
                        .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
                    return .toolCall(ToolCallPart(
                        id: tc.toolCallId,
                        toolName: tc.toolName,
                        args: tc.args,
                        argsText: jsonText,
                        result: tc.result,
                        isRunning: false
                    ))
                }
            }
            return DisplayMessage(id: UUID().uuidString, role: .assistant, content: contentParts)
        case .system(let text):
            return DisplayMessage(id: UUID().uuidString, role: .system, content: [.text(text)])
        }
    }
}

// MARK: - Stream Block (internal accumulator)

private enum StreamBlock {
    case text(String)
    case thinking(String)
    case toolUse(StreamToolUse)
}

private struct StreamToolUse {
    var id: String
    var name: String
    var input: [String: Any]
    var inputJson: String
    var isRunning: Bool
}

// MARK: - Display Types

struct DisplayMessage: Identifiable {
    let id: String
    var role: MessageRole
    var content: [ContentPart]
    var status: MessageStatus?
    var timestamp: Date = Date()

    enum MessageRole: String {
        case user, assistant, system
    }

    enum MessageStatus: Equatable {
        case running, complete
    }
}

enum ContentPart {
    case text(String)
    case reasoning(String)
    case toolCall(ToolCallPart)
    case image(Data)  // JPEG data for display
}

struct ToolCallPart: Identifiable {
    let id: String
    var toolName: String
    var args: [String: Any]
    var argsText: String
    var result: String?
    var isRunning: Bool
}

struct TokenUsage {
    var inputTokens: Int = 0
    var outputTokens: Int = 0
    var cacheReadTokens: Int = 0
    var cacheCreationTokens: Int = 0
    var costUsd: Double = 0
    var contextWindow: Int = 0
    var maxOutputTokens: Int = 0
    var currentContextTokens: Int = 0
}

struct ModelInfo: Identifiable {
    var id: String { value }
    var value: String
    var displayName: String
    var description: String
}

struct PermissionRequest: Identifiable {
    var id: String { toolUseId }
    var toolUseId: String
    var toolName: String
    var input: [String: Any]
    var description: String?
    var decisionReason: String?
}

struct GitStatus {
    var status: String
    var diff: String
    var branch: String
}
