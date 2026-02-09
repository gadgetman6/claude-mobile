import SwiftUI
import Textual

/// Scrollable message thread using inverted LazyVStack for reliable bottom-anchoring.
///
/// The ScrollView is rotated 180° so its "top" is visually at the bottom.
/// Messages are displayed in reverse order (newest first), and each cell is
/// rotated -180° to appear right-side up. This means LazyVStack eagerly
/// renders items near the visual bottom (latest messages) — no black screen.
struct MessageThreadView: View {
    @Environment(SessionStore.self) private var sessionStore

    /// When false, user has scrolled up — don't auto-scroll on new messages.
    @State private var autoScroll = true
    @State private var scrollTarget: String?

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 4) {
                if sessionStore.messages.isEmpty {
                    welcomeView
                        .rotationEffect(.degrees(180))
                        .scaleEffect(x: -1, y: 1, anchor: .center)
                } else {
                    ForEach(sessionStore.messages.reversed()) { message in
                        MessageCell(message: message)
                            .rotationEffect(.degrees(180))
                            .scaleEffect(x: -1, y: 1, anchor: .center)
                    }
                }
            }
        }
        .rotationEffect(.degrees(180))
        .scaleEffect(x: -1, y: 1, anchor: .center)
        .scrollDismissesKeyboard(.interactively)
        .scrollPosition(id: $scrollTarget, anchor: .top)
        .onScrollPhaseChange { _, newPhase in
            if newPhase == .interacting {
                autoScroll = false
                scrollTarget = nil
            }
        }
        .onChange(of: sessionStore.messages.count) { oldCount, newCount in
            guard newCount > 0 else { return }

            if let lastMsg = sessionStore.messages.last, lastMsg.role == .user {
                autoScroll = true
            }

            if newCount - oldCount > 5 || oldCount == 0 {
                autoScroll = true
            }

            if autoScroll {
                scrollTarget = sessionStore.messages.last?.id
            }
        }
        .onChange(of: sessionStore.messages.last?.content.count) { _, _ in
            if autoScroll {
                scrollTarget = sessionStore.messages.last?.id
            }
        }
        .overlay(alignment: .bottom) {
            scrollToBottomButton
        }
    }

    // MARK: - Subviews

    private var scrollToBottomButton: some View {
        Button {
            autoScroll = true
            scrollTarget = sessionStore.messages.last?.id
        } label: {
            Image(systemName: "chevron.down")
                .font(.body.bold())
                .foregroundStyle(.primary)
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
        }
        .padding(.bottom, 8)
        .opacity(autoScroll ? 0 : 1)
        .scaleEffect(autoScroll ? 0.5 : 1)
        .animation(.easeInOut(duration: 0.2), value: autoScroll)
        .allowsHitTesting(!autoScroll)
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

// MARK: - Message Cell (wraps in EquatableView to prevent unnecessary re-renders)

struct MessageCell: View {
    let message: DisplayMessage

    var body: some View {
        switch message.role {
        case .user: userMessage
        case .assistant: assistantMessage
        case .system: systemMessage
        }
    }

    private var userMessage: some View {
        HStack {
            Spacer(minLength: 60)
            VStack(alignment: .trailing, spacing: 6) {
                ForEach(Array(message.content.enumerated()), id: \.offset) { _, part in
                    switch part {
                    case .text(let text):
                        Text(text)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Color.accentColor.opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    case .image(let data):
                        if let uiImage = UIImage(data: data) {
                            Image(uiImage: uiImage)
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: 200, maxHeight: 200)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    default:
                        EmptyView()
                    }
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
    }

    private var assistantMessage: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(message.content.enumerated()), id: \.offset) { _, part in
                contentPartView(part)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func contentPartView(_ part: ContentPart) -> some View {
        switch part {
        case .text(let text):
            if !text.isEmpty {
                SafeMarkdownView(text: text)
            }
        case .reasoning(let text):
            ThinkingBlockView(text: text)
        case .toolCall(let tc):
            ToolCardView(toolCall: tc)
        case .image(let data):
            if let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 200)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
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

// MARK: - Safe Markdown View

/// Uses StructuredText for complete markdown, plain Text for mid-stream partials.
struct SafeMarkdownView: View {
    let text: String

    var body: some View {
        if isLikelyCompleteMarkdown {
            StructuredText(markdown: text)
                .textual.structuredTextStyle(.gitHub)
                .textual.textSelection(.enabled)
        } else {
            Text(text)
                .textSelection(.enabled)
        }
    }

    private var isLikelyCompleteMarkdown: Bool {
        let fenceCount = text.components(separatedBy: "```").count - 1
        return fenceCount % 2 == 0
    }
}

// MARK: - Thinking Block

struct ThinkingBlockView: View {
    let text: String
    @State private var isExpanded = true

    private var preview: String {
        let firstLine = text.components(separatedBy: .newlines).first(where: { !$0.isEmpty }) ?? ""
        return firstLine.count > 80 ? String(firstLine.prefix(80)) + "..." : firstLine
    }

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            SafeMarkdownView(text: text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: "brain")
                        .font(.caption)
                    Text("Thinking")
                        .font(.caption.bold())
                }
                .foregroundStyle(.purple.opacity(0.8))

                if !isExpanded && !preview.isEmpty {
                    Text(preview)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Tool Card Router

struct ToolCardView: View {
    let toolCall: ToolCallPart

    /// Normalized tool name that handles Codex aliases.
    private var normalizedName: String {
        switch toolCall.toolName {
        case "Bash", "exec_command", "command_execution", "Shell":
            return "Bash"
        case "Edit", "StrReplace", "str_replace_editor":
            return "Edit"
        case "Write", "CreateFile", "create_file":
            return "Write"
        case "Read", "ReadFile", "read_file", "View":
            return "Read"
        case "Glob", "GlobTool", "glob":
            return "Glob"
        case "Grep", "GrepTool", "grep", "SearchFiles":
            return "Grep"
        case "Task", "Subagent":
            return "Task"
        case "TodoWrite", "TodoRead":
            return "TodoWrite"
        case "WebSearch":
            return "WebSearch"
        default:
            return toolCall.toolName
        }
    }

    var body: some View {
        switch normalizedName {
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
