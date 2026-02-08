import Foundation
import SocketIO

/// Manages the Socket.IO connection to the Bun server.
/// Decodes incoming messages and forwards them to a handler callback.
final class SocketIOService {

    // MARK: - Types

    enum ConnectionState: String {
        case disconnected
        case connecting
        case connected
    }

    typealias MessageHandler = (ServerMessage) -> Void

    // MARK: - Properties

    private(set) var connectionState: ConnectionState = .disconnected
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var onMessage: MessageHandler?
    private var onConnectionChange: ((ConnectionState) -> Void)?

    // MARK: - Connect / Disconnect

    /// Connect to a server. Disconnects any existing connection first.
    func connect(
        to server: Server,
        onMessage: @escaping MessageHandler,
        onConnectionChange: @escaping (ConnectionState) -> Void
    ) {
        disconnect()

        self.onMessage = onMessage
        self.onConnectionChange = onConnectionChange

        guard let url = server.baseURL else {
            print("[socket] Invalid server URL: \(server.url)")
            return
        }

        updateState(.connecting)

        // Configure Socket.IO to match the Bun server setup:
        // - path: /engine.io/ (the server routes engine.io requests there)
        // - forceWebsockets: false (start with polling, upgrade to WS)
        let mgr = SocketManager(socketURL: url, config: [
            .path("/engine.io/"),
            .forcePolling(false),
            .forceWebsockets(false),
            .reconnects(true),
            .reconnectWait(2),
            .reconnectWaitMax(10),
            .log(false),
        ])

        self.manager = mgr
        let sock = mgr.defaultSocket
        self.socket = sock

        // Connection events
        sock.on(clientEvent: .connect) { [weak self] _, _ in
            print("[socket] Connected")
            self?.updateState(.connected)
        }

        sock.on(clientEvent: .disconnect) { [weak self] _, _ in
            print("[socket] Disconnected")
            self?.updateState(.disconnected)
        }

        sock.on(clientEvent: .error) { _, data in
            print("[socket] Error: \(data)")
        }

        sock.on(clientEvent: .reconnect) { _, _ in
            print("[socket] Reconnecting...")
        }

        sock.on(clientEvent: .reconnectAttempt) { [weak self] _, _ in
            self?.updateState(.connecting)
        }

        // Main message handler — all server messages come on "message" event
        sock.on("message") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any] else { return }
            let msg = ServerMessage.decode(from: dict)
            self?.onMessage?(msg)
        }

        sock.connect()
    }

    func disconnect() {
        socket?.removeAllHandlers()
        socket?.disconnect()
        manager?.disconnect()
        socket = nil
        manager = nil
        updateState(.disconnected)
    }

    // MARK: - Emit Events

    /// Request reconnection to an existing session.
    func emitReconnectRequest() {
        socket?.emit("reconnect_request")
    }

    /// Start a new session or resume an existing one.
    func emitStartSession(
        cwd: String,
        model: String?,
        permissionMode: String?,
        enable1mContext: Bool?,
        resume: String?,
        provider: String?
    ) {
        var data: [String: Any] = ["cwd": cwd]
        if let model { data["model"] = model }
        if let permissionMode { data["permissionMode"] = permissionMode }
        if let enable1mContext { data["enable1mContext"] = enable1mContext }
        if let resume { data["resume"] = resume }
        if let provider { data["provider"] = provider }
        socket?.emit("start_session", data)
    }

    /// Send a user message (text string or content blocks array).
    func emitUserMessage(content: Any) {
        if let text = content as? String {
            socket?.emit("user_message", ["content": text])
        } else if let blocks = content as? [[String: Any]],
                  let jsonData = try? JSONSerialization.data(withJSONObject: blocks),
                  let jsonString = String(data: jsonData, encoding: .utf8) {
            // Send content blocks as a JSON string — server needs to parse it
            socket?.emit("user_message", ["content": jsonString, "contentIsJSON": true])
        } else {
            socket?.emit("user_message", ["content": content])
        }
    }

    /// Respond to a permission request.
    func emitPermissionResponse(toolUseId: String, allow: Bool, denyMessage: String? = nil) {
        var data: [String: Any] = ["toolUseId": toolUseId, "allow": allow]
        if let denyMessage { data["denyMessage"] = denyMessage }
        socket?.emit("permission_response", data)
    }

    /// Respond to an AskQuestion prompt.
    func emitAskQuestionResponse(
        toolUseId: String,
        questions: [[String: Any]],
        answers: [String: String]
    ) {
        let data: [String: Any] = [
            "toolUseId": toolUseId,
            "questions": questions,
            "answers": answers,
        ]
        socket?.emit("ask_question_response", data)
    }

    /// Interrupt the current agent turn.
    func emitInterrupt() {
        socket?.emit("interrupt")
    }

    /// Change the model.
    func emitSetModel(_ model: String) {
        socket?.emit("set_model", ["model": model])
    }

    /// Change the permission mode.
    func emitSetPermissionMode(_ mode: String) {
        socket?.emit("set_permission_mode", ["mode": mode])
    }

    /// Change max thinking tokens.
    func emitSetThinkingTokens(_ tokens: Int?) {
        let value: Any = tokens as Any
        socket?.emit("set_thinking_tokens", ["tokens": value])
    }

    /// Request the list of available models.
    func emitGetModels() {
        socket?.emit("get_models")
    }

    /// Request git status.
    func emitGetGitStatus(cwd: String?) {
        let data: [String: Any] = cwd != nil ? ["cwd": cwd!] : [:]
        socket?.emit("get_git_status", data)
    }

    // MARK: - Private

    private func updateState(_ state: ConnectionState) {
        connectionState = state
        DispatchQueue.main.async { [weak self] in
            self?.onConnectionChange?(state)
        }
    }
}
