import SwiftUI

/// Scrollable message thread with auto-scroll to bottom.
struct MessageThreadView: View {
    @Environment(SessionStore.self) private var sessionStore

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    if sessionStore.messages.isEmpty {
                        welcomeView
                    } else {
                        ForEach(sessionStore.messages) { message in
                            MessageCell(message: message)
                                .id(message.id)
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }
                    }
                    // Anchor for scrolling
                    Color.clear
                        .frame(height: 1)
                        .id("bottom")
                }
            }
            .onChange(of: sessionStore.messages.count) { _, _ in
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
        }
    }

    private var welcomeView: some View {
        VStack(spacing: 8) {
            Spacer(minLength: 100)
            Text("Hello there!")
                .font(.title.bold())
            Text("How can I help you today?")
                .font(.title3)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}

// MARK: - Message Cell

struct MessageCell: View {
    let message: DisplayMessage

    var body: some View {
        switch message.role {
        case .user:
            userMessage
        case .assistant:
            assistantMessage
        case .system:
            systemMessage
        }
    }

    private var userMessage: some View {
        HStack {
            Spacer(minLength: 60)
            VStack(alignment: .trailing, spacing: 0) {
                ForEach(Array(message.content.enumerated()), id: \.offset) { _, part in
                    if case .text(let text) = part {
                        Text(text)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Color.accentColor.opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
    }

    private var assistantMessage: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(message.content.enumerated()), id: \.offset) { _, part in
                contentPartView(part)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func contentPartView(_ part: ContentPart) -> some View {
        switch part {
        case .text(let text):
            if !text.isEmpty {
                // For now, render as plain text. Phase 3b adds Textual markdown.
                Text(text)
                    .textSelection(.enabled)
            }
        case .reasoning(let text):
            ThinkingBlockView(text: text)
        case .toolCall(let tc):
            ToolCardView(toolCall: tc)
        }
    }

    private var systemMessage: some View {
        HStack {
            Spacer()
            if let text = message.content.first, case .text(let t) = text {
                Text(t)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                    .padding(.vertical, 4)
            }
            Spacer()
        }
    }
}

// MARK: - Thinking Block

struct ThinkingBlockView: View {
    let text: String
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .padding(.top, 4)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "brain")
                    .font(.caption)
                Text("Thinking")
                    .font(.caption.bold())
            }
            .foregroundStyle(.purple.opacity(0.8))
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Tool Card Router

struct ToolCardView: View {
    let toolCall: ToolCallPart

    var body: some View {
        switch toolCall.toolName {
        case "Bash":
            BashToolCard(toolCall: toolCall)
        case "Edit":
            EditToolCard(toolCall: toolCall)
        case "Write":
            WriteToolCard(toolCall: toolCall)
        case "Read":
            ReadToolCard(toolCall: toolCall)
        case "Glob", "Grep":
            SearchToolCard(toolCall: toolCall)
        case "Task":
            TaskToolCard(toolCall: toolCall)
        case "TodoWrite":
            TodoToolCard(toolCall: toolCall)
        default:
            GenericToolCard(toolCall: toolCall)
        }
    }
}

// MARK: - Generic Fallback Tool Card

struct GenericToolCard: View {
    let toolCall: ToolCallPart
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 6) {
                if !toolCall.argsText.isEmpty && toolCall.argsText != "{}" {
                    let truncated = toolCall.argsText.count > 1000 ? String(toolCall.argsText.prefix(1000)) + "..." : toolCall.argsText
                    Text(truncated)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                if let result = toolCall.result, !result.isEmpty {
                    Divider()
                    let truncated = result.count > 2000 ? String(result.prefix(2000)) + "..." : result
                    Text(truncated)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
            .padding(.top, 4)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "wrench")
                    .font(.caption)
                    .foregroundStyle(.blue)
                Text(toolCall.toolName)
                    .font(.caption.bold())
                Spacer()
                if toolCall.isRunning {
                    ProgressView().controlSize(.mini)
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption).foregroundStyle(.green)
                }
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .onAppear { if toolCall.isRunning { isExpanded = true } }
    }
}
