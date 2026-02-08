import SwiftUI

/// Specialized tool card for Task (subagent) operations.
struct TaskToolCard: View {
    let toolCall: ToolCallPart
    @Environment(SessionStore.self) private var sessionStore
    @State private var isExpanded = true

    private var description: String {
        toolCall.args["description"] as? String ?? "Task"
    }

    private var prompt: String {
        toolCall.args["prompt"] as? String ?? ""
    }

    private var nestedMessages: [DisplayMessage] {
        sessionStore.nestedContentMap[toolCall.id] ?? []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            DisclosureGroup(isExpanded: $isExpanded) {
                taskContent
            } label: {
                taskHeader
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var taskHeader: some View {
        HStack(spacing: 6) {
            Image(systemName: "arrow.triangle.branch")
                .font(.caption)
                .foregroundStyle(.indigo)

            Text(description)
                .font(.caption.bold())
                .lineLimit(1)

            if nestedMessages.count > 0 {
                Text("\(nestedMessages.count)")
                    .font(.caption2)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(Color.blue.opacity(0.2))
                    .clipShape(Capsule())
            }

            Spacer()

            if toolCall.isRunning {
                ProgressView().controlSize(.mini)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        }
    }

    private var taskContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !prompt.isEmpty {
                Text(prompt.count > 200 ? String(prompt.prefix(200)) + "..." : prompt)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 4)
            }

            // Nested messages from the subagent
            ForEach(nestedMessages) { msg in
                ForEach(Array(msg.content.enumerated()), id: \.offset) { _, part in
                    nestedPartView(part)
                }
            }

            // Result
            if let result = toolCall.result, !result.isEmpty {
                Divider()
                let truncated = result.count > 1000 ? String(result.prefix(1000)) + "..." : result
                Text(truncated)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private func nestedPartView(_ part: ContentPart) -> some View {
        switch part {
        case .text(let text):
            if !text.isEmpty {
                Text(text)
                    .font(.caption)
                    .foregroundStyle(.primary)
            }
        case .reasoning(let text):
            HStack(spacing: 4) {
                Image(systemName: "brain")
                    .font(.caption2)
                Text(text.count > 200 ? String(text.prefix(200)) + "..." : text)
                    .font(.caption2)
            }
            .foregroundStyle(.purple.opacity(0.7))
        case .toolCall(let tc):
            HStack(spacing: 4) {
                Image(systemName: "wrench")
                    .font(.caption2)
                Text(tc.toolName)
                    .font(.caption2.bold())
                if let cmd = tc.args["command"] as? String {
                    Text("$ \(cmd)").font(.system(.caption2, design: .monospaced)).lineLimit(1)
                } else if let path = tc.args["file_path"] as? String ?? tc.args["path"] as? String {
                    Text(URL(fileURLWithPath: path).lastPathComponent).font(.caption2)
                }
            }
            .foregroundStyle(.secondary)
        }
    }
}
