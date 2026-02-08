import SwiftUI

/// Settings panel for model, thinking tokens, permission mode.
struct SettingsSheet: View {
    @Environment(SessionStore.self) private var sessionStore
    @Environment(\.dismiss) private var dismiss

    private let thinkingPresets: [(value: Int?, label: String, desc: String)] = [
        (nil, "Default", "Model decides"),
        (8000, "Low", "~8k thinking tokens"),
        (16000, "Medium", "~16k thinking tokens"),
        (32000, "High", "~32k thinking tokens"),
        (64000, "Max", "~64k thinking tokens"),
    ]

    private let permModes: [(value: String, label: String, desc: String)] = [
        ("default", "Default", "Prompts for dangerous operations"),
        ("acceptEdits", "Accept Edits", "Auto-accept file edits"),
        ("bypassPermissions", "Bypass All", "Skip all permission checks"),
        ("plan", "Plan Mode", "No execution, planning only"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                modelSection
                thinkingSection
                permissionSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private static let fallbackModels: [ModelInfo] = [
        ModelInfo(value: "claude-opus-4-6", displayName: "Claude Opus 4.6", description: "Most capable"),
        ModelInfo(value: "claude-sonnet-4-5-20250929", displayName: "Claude Sonnet 4.5", description: "Fast and capable"),
        ModelInfo(value: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", description: "Fastest"),
        ModelInfo(value: "gpt-5.3-codex", displayName: "GPT-5.3 Codex", description: "Latest Codex model"),
        ModelInfo(value: "o4-mini", displayName: "O4 Mini", description: "Fast reasoning model"),
    ]

    private var displayModels: [ModelInfo] {
        sessionStore.models.isEmpty ? Self.fallbackModels : sessionStore.models
    }

    private var modelSection: some View {
        Section("Model") {
            Picker("Model", selection: Binding(
                get: { sessionStore.currentModel },
                set: { sessionStore.changeModel($0) }
            )) {
                ForEach(displayModels) { m in
                    Text(m.displayName).tag(m.value)
                }
            }

            Text(sessionStore.currentModel)
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    private var thinkingSection: some View {
        Section("Reasoning Effort") {
            ForEach(Array(thinkingPresets.enumerated()), id: \.offset) { _, preset in
                Button {
                    sessionStore.changeThinkingTokens(preset.value)
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(preset.label)
                                .font(.subheadline.bold())
                                .foregroundStyle(.primary)
                            Text(preset.desc)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if sessionStore.maxThinkingTokens == preset.value {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.blue)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var permissionSection: some View {
        Section("Permission Mode") {
            ForEach(Array(permModes.enumerated()), id: \.offset) { _, pm in
                Button {
                    sessionStore.changePermissionMode(pm.value)
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(pm.label)
                                .font(.subheadline.bold())
                                .foregroundStyle(.primary)
                            Text(pm.desc)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if sessionStore.permissionMode == pm.value {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.blue)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}
