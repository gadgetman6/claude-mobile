import SwiftUI

/// Session configuration screen for a selected server.
struct StartSessionView: View {
    let server: Server
    @Environment(ServerManager.self) private var serverManager
    @Environment(SessionStore.self) private var sessionStore

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

    var body: some View {
        if inSession {
            ChatSessionView(server: server, cwd: cwd)
        } else {
            sessionForm
                .navigationTitle(server.alias)
                .onAppear {
                    serverManager.selectServer(server)
                    loadCwd()
                    // Connect socket when this screen appears
                    if sessionStore.connectionState == .disconnected {
                        sessionStore.connect(to: server)
                    }
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
                .onSubmit { saveCwd() }
                .onChange(of: cwd) { _, _ in
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
        Section("Recent Sessions") {
            ForEach(recentSessions) { session in
                recentSessionRow(session)
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
        HStack(spacing: 8) {
            if session.isRunning == true {
                HStack(spacing: 4) {
                    Circle().fill(.green).frame(width: 6, height: 6)
                    Text("running")
                }
            }
            Text(session.timestamp, style: .relative)
            if let cost = session.costUsd, cost > 0 {
                Text(String(format: "$%.2f", cost))
                    .foregroundStyle(.orange)
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
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
        } catch { /* ignore */ }
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
