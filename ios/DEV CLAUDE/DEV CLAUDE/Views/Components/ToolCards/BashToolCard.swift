import SwiftUI

/// Specialized tool card for Bash/command execution.
struct BashToolCard: View {
    let toolCall: ToolCallPart
    @State private var showOutput = false

    private var command: String {
        toolCall.args["command"] as? String ?? ""
    }

    private var description: String? {
        toolCall.args["description"] as? String
    }

    private var output: String {
        toolCall.result ?? ""
    }

    private var outputLines: Int {
        output.components(separatedBy: "\n").count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack(spacing: 6) {
                Image(systemName: "terminal")
                    .font(.caption)
                    .foregroundStyle(.green)

                Text("$ \(command)")
                    .font(.system(.caption, design: .monospaced))
                    .lineLimit(2)
                    .foregroundStyle(.primary)

                Spacer()

                statusBadge
            }

            if let desc = description {
                Text(desc)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            // Output section
            if !output.isEmpty {
                Divider()

                if outputLines > 8 {
                    // Collapsible output
                    DisclosureGroup(isExpanded: $showOutput) {
                        outputView
                    } label: {
                        Text("\(outputLines) lines")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    outputView
                }
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var outputView: some View {
        let truncated = output.count > 3000 ? String(output.prefix(3000)) + "\n..." : output
        return Text(truncated)
            .font(.system(.caption2, design: .monospaced))
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
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
