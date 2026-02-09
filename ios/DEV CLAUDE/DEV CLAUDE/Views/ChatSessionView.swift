import SwiftUI

/// Main chat session screen with thread, composer, and overlays.
struct ChatSessionView: View {
    let server: Server
    let cwd: String
    @Environment(SessionStore.self) private var sessionStore
    @State private var showSettings = false
    @State private var showGit = false
    @State private var pulseOn = false

    private var permBadge: (label: String, color: Color) {
        switch sessionStore.permissionMode {
        case "bypassPermissions": return ("YOLO", .red)
        case "acceptEdits": return ("accept edits", .orange)
        case "plan": return ("plan", .blue)
        default: return ("default", .secondary)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Connection lost banner
            if sessionStore.connectionState == .disconnected {
                HStack(spacing: 6) {
                    Image(systemName: "wifi.slash")
                    Text("Connection lost")
                    Spacer()
                    Button("Retry") {
                        sessionStore.connect(to: server)
                    }
                    .font(.caption.bold())
                }
                .font(.caption)
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.red.opacity(0.85))
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            // Token usage bar
            if sessionStore.usage.currentContextTokens > 0 || sessionStore.usage.costUsd > 0 {
                TokenUsageBarView(usage: sessionStore.usage, thinkingTokens: sessionStore.maxThinkingTokens)
            }

            // Compacting indicator
            if sessionStore.isCompacting {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Compacting context...")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                .padding(.vertical, 4)
            }

            // Error banner
            if let error = sessionStore.error {
                HStack {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                    Spacer()
                    Button { sessionStore.error = nil } label: {
                        Image(systemName: "xmark")
                            .font(.caption2)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.red.opacity(0.1))
            }

            // Message thread
            MessageThreadView()

            // Composer
            MessageComposerView()
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
        }
        .sheet(isPresented: $showGit) {
            GitStatusSheet(cwd: cwd)
        }
        .overlay {
            // Permission prompt overlay
            if sessionStore.pendingPermission != nil {
                PermissionOverlay()
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            HStack(spacing: 6) {
                Circle()
                    .fill(sessionStore.connectionState == .connected ? .green : .orange)
                    .frame(width: 8, height: 8)
                    .opacity(sessionStore.isStreaming ? (pulseOn ? 0.3 : 1) : 1)
                    .animation(sessionStore.isStreaming ? .easeInOut(duration: 0.6).repeatForever(autoreverses: true) : .default, value: pulseOn)
                    .onChange(of: sessionStore.isStreaming) { _, streaming in
                        pulseOn = streaming
                    }
                Text(server.alias)
                    .font(.headline)
                Text(permBadge.label)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(permBadge.color.opacity(0.2))
                    .foregroundStyle(permBadge.color)
                    .clipShape(Capsule())
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 4) {
                Button { showGit = true; sessionStore.fetchGitStatus(cwd: cwd) } label: {
                    Image(systemName: "arrow.triangle.branch")
                }
                Button { showSettings = true; sessionStore.fetchModels() } label: {
                    Image(systemName: "gearshape")
                }
            }
        }
    }
}

// MARK: - Token Usage Bar

struct TokenUsageBarView: View {
    let usage: TokenUsage
    var thinkingTokens: Int?

    var body: some View {
        HStack(spacing: 12) {
            if usage.currentContextTokens > 0 {
                Label(formatTokens(usage.currentContextTokens), systemImage: "cpu")
            }
            if usage.contextWindow > 0 {
                let pct = Int(Double(usage.currentContextTokens) / Double(usage.contextWindow) * 100)
                Text("\(pct)%")
                    .foregroundStyle(pct > 80 ? .red : pct > 50 ? .orange : .secondary)
            }
            if usage.costUsd > 0 {
                Text(String(format: "$%.4f", usage.costUsd))
                    .foregroundStyle(.orange)
            }
            Spacer()
            if let t = thinkingTokens {
                Label(formatTokens(t), systemImage: "brain")
                    .foregroundStyle(.purple)
            }
        }
        .font(.caption)
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(.bar)
    }

    private func formatTokens(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.1fk", Double(n) / 1_000) }
        return "\(n)"
    }
}
