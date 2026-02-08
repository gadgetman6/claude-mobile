import SwiftUI

/// Specialized tool card for TodoWrite operations.
struct TodoToolCard: View {
    let toolCall: ToolCallPart

    private var todos: [[String: Any]] {
        toolCall.args["todos"] as? [[String: Any]] ?? []
    }

    private var completedCount: Int {
        todos.filter { ($0["status"] as? String) == "completed" }.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack(spacing: 6) {
                Image(systemName: "checklist")
                    .font(.caption)
                    .foregroundStyle(.mint)

                Text("Tasks")
                    .font(.caption.bold())

                Text("\(completedCount)/\(todos.count)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Spacer()

                statusBadge
            }

            // Todo list
            ForEach(Array(todos.enumerated()), id: \.offset) { _, todo in
                todoRow(todo)
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func todoRow(_ todo: [String: Any]) -> some View {
        let content = todo["content"] as? String ?? ""
        let status = todo["status"] as? String ?? "pending"
        let isCompleted = status == "completed"
        let isInProgress = status == "in_progress"

        return HStack(spacing: 8) {
            if isCompleted {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.caption)
            } else if isInProgress {
                ProgressView()
                    .controlSize(.mini)
            } else {
                Image(systemName: "circle")
                    .foregroundStyle(.secondary)
                    .font(.caption)
            }

            Text(content)
                .font(.caption)
                .foregroundStyle(isCompleted ? .secondary : .primary)
                .strikethrough(isCompleted)
                .lineLimit(3)
        }
    }

    @ViewBuilder
    private var statusBadge: some View {
        if toolCall.isRunning {
            Text("updating")
                .font(.caption2)
                .foregroundStyle(.orange)
        } else if completedCount == todos.count && todos.count > 0 {
            Text("done")
                .font(.caption2)
                .foregroundStyle(.green)
        }
    }
}
