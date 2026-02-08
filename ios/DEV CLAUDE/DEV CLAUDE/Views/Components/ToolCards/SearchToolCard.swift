import SwiftUI

/// Specialized tool card for Glob and Grep search operations.
struct SearchToolCard: View {
    let toolCall: ToolCallPart
    @State private var isExpanded = false

    private var isGrep: Bool { toolCall.toolName == "Grep" }

    private var pattern: String {
        toolCall.args["pattern"] as? String ?? toolCall.args["glob_pattern"] as? String ?? ""
    }

    private var searchPath: String {
        toolCall.args["path"] as? String ?? toolCall.args["target_directory"] as? String ?? ""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.caption)
                    .foregroundStyle(.teal)

                Text(toolCall.toolName)
                    .font(.caption.bold())

                if isGrep {
                    Text("/\(pattern)/")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else {
                    Text(pattern)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                statusBadge
            }

            if !searchPath.isEmpty {
                Text("in \(searchPath)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            if let result = toolCall.result, !result.isEmpty {
                DisclosureGroup(isExpanded: $isExpanded) {
                    let truncated = result.count > 2000 ? String(result.prefix(2000)) + "\n..." : result
                    Text(truncated)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } label: {
                    let lineCount = result.components(separatedBy: "\n").count
                    Text("\(lineCount) lines")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private var statusBadge: some View {
        if toolCall.isRunning {
            ProgressView().controlSize(.mini)
        } else {
            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
        }
    }
}
