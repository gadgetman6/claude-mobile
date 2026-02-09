import SwiftUI

/// Session configuration screen for a selected server.
struct StartSessionView: View {
    let server: Server
    @Environment(ServerManager.self) private var serverManager
    @Environment(SessionStore.self) private var sessionStore
    @Environment(NotificationManager.self) private var notificationManager

    @State private var cwd: String = ""
    @State private var provider: Provider = .claude
    @State private var model: String = "claude-opus-4-6"
    @State private var permissionMode: String = "bypassPermissions"
    @State private var enable1mContext = true
    @State private var recentSessions: [RecentSession] = []
    @State private var inSession = false

    enum Provider: String, CaseIterable {
        case claude = "Claude"
        case codex = "Codex"
    }

    @FocusState private var cwdFocused: Bool

    var body: some View {
        sessionForm
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(server.alias)
            .navigationDestination(isPresented: $inSession) {
                ChatSessionView(server: server, cwd: cwd)
            }
            .onAppear {
                serverManager.selectServer(server)
                notificationManager.setServer(server.baseURL)
                loadCwd()
                // Ensure the Socket.IO connection actually targets the selected server.
                if sessionStore.connectedServerId != server.id {
                    sessionStore.switchServer(to: server)
                } else if sessionStore.connectionState == .disconnected {
                    sessionStore.connect(to: server)
                }
                Task { await loadRecentSessions() }
            }
            .onChange(of: inSession) { _, isActive in
                // Reload sessions when returning from chat
                if !isActive {
                    Task { await loadRecentSessions() }
                }
            }
    }

    // MARK: - Form

    private var sessionForm: some View {
        Form {
            connectionStatus
            cwdSection
            providerSection
            if provider == .claude {
                optionsSection
            }
            startButtonSection
            if !recentSessions.isEmpty {
                recentSessionsSection
            }
        }
        .scrollDismissesKeyboard(.immediately)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { cwdFocused = false }
            }
        }
    }

    // MARK: - Sections

    private var connectionStatus: some View {
        Section {
            HStack {
                Circle()
                    .fill(connectionColor)
                    .frame(width: 8, height: 8)
                Text(sessionStore.connectionState.rawValue.capitalized)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(server.displayURL)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private var connectionColor: Color {
        switch sessionStore.connectionState {
        case .connected: return .green
        case .connecting: return .orange
        case .disconnected: return .red
        }
    }

    private var cwdSection: some View {
        Section("Working Directory") {
            TextField("/path/to/project", text: $cwd)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .focused($cwdFocused)
                .onSubmit {
                    cwdFocused = false
                    saveCwd()
                    Task { await loadRecentSessions() }
                }
                .onChange(of: cwd) { _, _ in
                    Task { await loadRecentSessions() }
                }
                .onChange(of: provider) { _, _ in
                    recentSessions = []
                    Task { await loadRecentSessions() }
                }
        }
    }

    private var providerSection: some View {
        Section("Provider") {
            Picker("Provider", selection: $provider) {
                ForEach(Provider.allCases, id: \.self) { p in
                    Text(p.rawValue).tag(p)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: provider) { _, newValue in
                model = newValue == .claude ? "claude-opus-4-6" : "gpt-5.3-codex"
            }

            modelPicker
        }
    }

    private var modelPicker: some View {
        Picker("Model", selection: $model) {
            if provider == .claude {
                Text("Claude Opus 4.6").tag("claude-opus-4-6")
                Text("Claude Sonnet 4.5").tag("claude-sonnet-4-5-20250929")
                Text("Claude Haiku 4.5").tag("claude-haiku-4-5-20251001")
            } else {
                Text("GPT-5.3 Codex").tag("gpt-5.3-codex")
                Text("O4 Mini").tag("o4-mini")
            }
        }
    }

    private var optionsSection: some View {
        Section("Options") {
            Picker("Permissions", selection: $permissionMode) {
                Text("Default").tag("default")
                Text("Accept Edits").tag("acceptEdits")
                Text("Bypass All").tag("bypassPermissions")
            }
            Toggle("1M Context (Opus 4.6)", isOn: $enable1mContext)
        }
    }

    private var startButtonSection: some View {
        Section {
            Button {
                startSession()
            } label: {
                HStack {
                    Spacer()
                    Text("New Session")
                        .fontWeight(.semibold)
                    Spacer()
                }
            }
            .disabled(cwd.trimmingCharacters(in: .whitespaces).isEmpty || sessionStore.connectionState != .connected)
        }
    }

    private var recentSessionsSection: some View {
        Section {
            ForEach(recentSessions) { session in
                recentSessionRow(session)
            }
        } header: {
            HStack {
                Text("Recent Sessions")
                Spacer()
                Text(provider == .claude ? "Claude" : "Codex")
                    .font(.caption2)
                    .foregroundStyle(provider == .claude ? .orange : .green)
            }
        }
    }

    private func recentSessionRow(_ session: RecentSession) -> some View {
        Button {
            startSession(resumeId: session.id)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(session.firstMessage)
                    .lineLimit(2)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                recentSessionMeta(session)
            }
            .padding(.vertical, 2)
        }
    }

    private func recentSessionMeta(_ session: RecentSession) -> some View {
        HStack(spacing: 6) {
            if session.isRunning == true {
                HStack(spacing: 4) {
                    Circle().fill(.green).frame(width: 6, height: 6)
                    Text("running")
                }
            }

            if let model = session.model, !model.isEmpty {
                Text(shortModelName(model))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(Color.blue.opacity(0.15))
                    .clipShape(Capsule())
            }

            Text(session.timestamp, style: .relative)

            if let tokens = session.totalTokens, tokens > 0 {
                Text(formatTokens(tokens))
            }

            if let cost = session.costUsd, cost > 0 {
                Text(String(format: "$%.2f", cost))
                    .foregroundStyle(.orange)
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }

    private func shortModelName(_ model: String) -> String {
        if model.contains("opus") { return "Opus" }
        if model.contains("sonnet") { return "Sonnet" }
        if model.contains("haiku") { return "Haiku" }
        if model.contains("codex") { return "Codex" }
        if model.contains("o4-mini") { return "O4 Mini" }
        return String(model.prefix(12))
    }

    private func formatTokens(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM tok", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.0fk tok", Double(n) / 1_000) }
        return "\(n) tok"
    }

    // MARK: - Actions

    private func startSession(resumeId: String? = nil) {
        saveCwd()
        sessionStore.startSession(
            cwd: cwd,
            model: model,
            permissionMode: permissionMode,
            enable1mContext: enable1mContext,
            resumeId: resumeId,
            provider: provider.rawValue.lowercased()
        )
        inSession = true
    }

    private func loadCwd() {
        cwd = UserDefaults.standard.string(forKey: "dev-claude-cwd-\(server.id)") ?? ""
    }

    private func saveCwd() {
        UserDefaults.standard.set(cwd, forKey: "dev-claude-cwd-\(server.id)")
    }

    private func loadRecentSessions() async {
        guard let base = server.baseURL else { return }
        let cwdEncoded = cwd.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let endpoint: String
        if provider == .codex {
            endpoint = "\(base)/api/codex-sessions"
        } else {
            endpoint = "\(base)/api/sessions?cwd=\(cwdEncoded)"
        }
        guard let url = URL(string: endpoint) else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let decoded = try JSONDecoder().decode([RecentSession].self, from: data)
            await MainActor.run { recentSessions = decoded }
        } catch {
            print("[sessions] Failed to load: \(error)")
        }
    }
}

// MARK: - Recent Session Model

struct RecentSession: Identifiable, Codable {
    var id: String
    var timestamp: Date
    var firstMessage: String
    var model: String?
    var isRunning: Bool?
    var totalTokens: Int?
    var costUsd: Double?

    private enum CodingKeys: String, CodingKey {
        case id, timestamp, firstMessage, model, isRunning, totalTokens, costUsd
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        firstMessage = try container.decode(String.self, forKey: .firstMessage)
        model = try container.decodeIfPresent(String.self, forKey: .model)
        isRunning = try container.decodeIfPresent(Bool.self, forKey: .isRunning)
        totalTokens = try container.decodeIfPresent(Int.self, forKey: .totalTokens)
        costUsd = try container.decodeIfPresent(Double.self, forKey: .costUsd)

        let tsString = try container.decode(String.self, forKey: .timestamp)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        timestamp = formatter.date(from: tsString) ?? Date()
    }
}
