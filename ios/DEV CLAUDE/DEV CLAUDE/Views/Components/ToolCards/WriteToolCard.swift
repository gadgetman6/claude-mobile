import SwiftUI

/// Specialized tool card for Write (file creation) operations with unified diff view.
struct WriteToolCard: View {
    let toolCall: ToolCallPart
    @State private var isExpanded = false
    @State private var showFullDiff = false

    private var filePath: String {
        toolCall.args["file_path"] as? String ?? toolCall.args["path"] as? String ?? ""
    }

    private var fileName: String {
        URL(fileURLWithPath: filePath).lastPathComponent
    }

    private var content: String {
        toolCall.args["content"] as? String ?? toolCall.args["contents"] as? String ?? ""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                if !content.isEmpty { showFullDiff = true }
            } label: {
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

                    if !content.isEmpty {
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    statusBadge
                }
            }
            .buttonStyle(.plain)

            if !content.isEmpty {
                DisclosureGroup(isExpanded: $isExpanded) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        UnifiedDiffView(filePath: filePath, oldString: "", newString: content, maxLines: 30)
                    }
                } label: {
                    let lineCount = content.components(separatedBy: "\n").count
                    Text("+\(lineCount) lines")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .fullScreenCover(isPresented: $showFullDiff) {
            NavigationStack {
                DiffDetailView(filePath: filePath, oldString: "", newString: content)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { showFullDiff = false }
                        }
                    }
            }
            .preferredColorScheme(.dark)
        }
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
