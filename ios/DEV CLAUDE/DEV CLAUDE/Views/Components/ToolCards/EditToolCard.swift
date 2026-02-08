import SwiftUI

/// Specialized tool card for Edit operations with full-screen diff viewer.
struct EditToolCard: View {
    let toolCall: ToolCallPart
    @State private var isExpanded = false
    @State private var showFullDiff = false

    private var filePath: String {
        toolCall.args["file_path"] as? String ?? ""
    }

    private var fileName: String {
        URL(fileURLWithPath: filePath).lastPathComponent
    }

    private var oldStr: String {
        toolCall.args["old_string"] as? String ?? ""
    }

    private var newStr: String {
        toolCall.args["new_string"] as? String ?? ""
    }

    private var hasDiff: Bool {
        !oldStr.isEmpty || !newStr.isEmpty
    }

    private var language: String {
        detectLanguage(from: filePath)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header — tap to open full-screen diff
            Button {
                if hasDiff {
                    showFullDiff = true
                }
            } label: {
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

                    if hasDiff {
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    statusBadge
                }
            }
            .buttonStyle(.plain)

            // Inline diff preview
            if hasDiff {
                DisclosureGroup(isExpanded: $isExpanded) {
                    diffPreview
                } label: {
                    Text("Show diff")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            // Fallback: show tool result if no diff args
            if !hasDiff, let result = toolCall.result, !result.isEmpty {
                CodePreviewView(code: result, language: language, maxLines: 15)
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .onAppear {
            if !toolCall.isRunning { isExpanded = true }
        }
        .fullScreenCover(isPresented: $showFullDiff) {
            NavigationStack {
                DiffDetailView(filePath: filePath, oldString: oldStr, newString: newStr)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { showFullDiff = false }
                        }
                    }
            }
            .preferredColorScheme(.dark)
        }
    }

    private var diffPreview: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !oldStr.isEmpty {
                CodePreviewView(code: oldStr, language: language, maxLines: 10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color.red.opacity(0.3), lineWidth: 1)
                    )
            }
            if !newStr.isEmpty {
                CodePreviewView(code: newStr, language: language, maxLines: 10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color.green.opacity(0.3), lineWidth: 1)
                    )
            }
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
