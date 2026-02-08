import SwiftUI

/// Specialized tool card for Write (file creation) operations with syntax highlighting.
struct WriteToolCard: View {
    let toolCall: ToolCallPart
    @State private var isExpanded = false

    private var filePath: String {
        toolCall.args["file_path"] as? String ?? toolCall.args["path"] as? String ?? ""
    }

    private var fileName: String {
        URL(fileURLWithPath: filePath).lastPathComponent
    }

    private var content: String {
        toolCall.args["content"] as? String ?? toolCall.args["contents"] as? String ?? ""
    }

    private var language: String {
        detectLanguage(from: filePath)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "doc.text")
                    .font(.caption)
                    .foregroundStyle(.blue)

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

            if !content.isEmpty {
                DisclosureGroup(isExpanded: $isExpanded) {
                    CodePreviewView(code: content, language: language, maxLines: 30)
                } label: {
                    let lineCount = content.components(separatedBy: "\n").count
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
