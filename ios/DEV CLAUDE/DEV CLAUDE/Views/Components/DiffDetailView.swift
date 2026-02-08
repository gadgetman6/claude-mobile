import SwiftUI
import Textual

/// Full-screen diff viewer with syntax highlighting.
/// Expects to be inside a NavigationStack from the caller.
struct DiffDetailView: View {
    let filePath: String
    let oldString: String
    let newString: String

    private var fileName: String {
        URL(fileURLWithPath: filePath).lastPathComponent
    }

    private var language: String {
        detectLanguage(from: filePath)
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 16) {
                statsBar

                if !oldString.isEmpty {
                    diffSection(title: "Removed", code: oldString, color: .red)
                }

                if !newString.isEmpty {
                    diffSection(title: "Added", code: newString, color: .green)
                }

                if oldString.isEmpty && newString.isEmpty {
                    Text("No changes")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                }
            }
            .padding(.vertical)
        }
        .navigationTitle(fileName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var statsBar: some View {
        HStack(spacing: 12) {
            Label(filePath, systemImage: "doc.text")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer()
            if !language.isEmpty {
                Text(language)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.blue.opacity(0.15))
                    .foregroundStyle(.blue)
                    .clipShape(Capsule())
            }
            if !oldString.isEmpty {
                Text("-\(oldString.components(separatedBy: "\n").count)")
                    .font(.caption.bold())
                    .foregroundStyle(.red)
            }
            if !newString.isEmpty {
                Text("+\(newString.components(separatedBy: "\n").count)")
                    .font(.caption.bold())
                    .foregroundStyle(.green)
            }
        }
        .padding(.horizontal)
    }

    private func diffSection(title: String, code: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.bold())
                .foregroundStyle(color)
                .padding(.horizontal)

            CodePreviewView(code: code, language: language)
                .padding(.horizontal)
                .overlay(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(color)
                        .frame(width: 3)
                        .padding(.leading, 16)
                }
        }
    }
}
