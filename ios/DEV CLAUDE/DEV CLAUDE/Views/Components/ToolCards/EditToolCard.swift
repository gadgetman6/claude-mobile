import SwiftUI

/// Specialized tool card for Edit operations.
struct EditToolCard: View {
    let toolCall: ToolCallPart
    @State private var isExpanded = false

    private var filePath: String {
        toolCall.args["file_path"] as? String ?? ""
    }

    private var fileName: String {
        URL(fileURLWithPath: filePath).lastPathComponent
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack(spacing: 6) {
                Image(systemName: "pencil")
                    .font(.caption)
                    .foregroundStyle(.orange)

                Text(fileName)
                    .font(.caption.bold())
                    .lineLimit(1)

                Text(filePath)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)

                Spacer()

                statusBadge
            }

            // Show diff info if available
            if let oldStr = toolCall.args["old_string"] as? String,
               let newStr = toolCall.args["new_string"] as? String {
                DisclosureGroup(isExpanded: $isExpanded) {
                    VStack(alignment: .leading, spacing: 4) {
                        if !oldStr.isEmpty {
                            Text(truncate(oldStr, max: 500))
                                .font(.system(.caption2, design: .monospaced))
                                .padding(6)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.red.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                        Text(truncate(newStr, max: 500))
                            .font(.system(.caption2, design: .monospaced))
                            .padding(6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.green.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                } label: {
                    Text("Show diff")
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

    private func truncate(_ s: String, max: Int) -> String {
        s.count > max ? String(s.prefix(max)) + "..." : s
    }
}
