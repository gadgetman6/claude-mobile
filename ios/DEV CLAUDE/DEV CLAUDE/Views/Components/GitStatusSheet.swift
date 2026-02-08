import SwiftUI

/// Git status panel showing branch, changed files, and diffs.
struct GitStatusSheet: View {
    let cwd: String
    @Environment(SessionStore.self) private var sessionStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let git = sessionStore.gitStatus {
                    gitContent(git)
                } else {
                    ProgressView("Loading git status...")
                }
            }
            .navigationTitle("Git Status")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        sessionStore.fetchGitStatus(cwd: cwd)
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
    }

    private func gitContent(_ git: GitStatus) -> some View {
        List {
            Section {
                HStack {
                    Image(systemName: "arrow.triangle.branch")
                    Text(git.branch)
                        .font(.headline)
                }
            }

            if !git.status.isEmpty {
                Section("Changed Files") {
                    ForEach(git.status.components(separatedBy: "\n").filter { !$0.isEmpty }, id: \.self) { line in
                        fileRow(line)
                    }
                }
            } else {
                Section {
                    Text("Working tree clean")
                        .foregroundStyle(.secondary)
                }
            }

            if !git.diff.isEmpty {
                Section("Diff Stats") {
                    Text(git.diff)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func fileRow(_ line: String) -> some View {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        let status = String(trimmed.prefix(2)).trimmingCharacters(in: .whitespaces)
        let file = String(trimmed.dropFirst(2)).trimmingCharacters(in: .whitespaces)

        return HStack(spacing: 8) {
            Text(status)
                .font(.system(.caption, design: .monospaced).bold())
                .foregroundStyle(statusColor(status))
                .frame(width: 24)
            Text(file)
                .font(.subheadline)
                .lineLimit(1)
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "M", "MM": return .orange
        case "A", "AM": return .green
        case "D": return .red
        case "U": return .red
        case "??": return .secondary
        default: return .primary
        }
    }
}
