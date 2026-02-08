import SwiftUI

/// Git status panel showing branch, changed files, and diffs.
struct GitStatusSheet: View {
    let cwd: String
    @Environment(SessionStore.self) private var sessionStore
    @Environment(ServerManager.self) private var serverManager
    @Environment(\.dismiss) private var dismiss
    @State private var selectedFile: GitFile?

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
            .fullScreenCover(item: $selectedFile) { file in
                GitFileDiffView(cwd: cwd, file: file, serverManager: serverManager)
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
                    ForEach(parseFiles(git.status)) { file in
                        fileRow(file)
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

    private func fileRow(_ file: GitFile) -> some View {
        Button {
            if file.status != "D" {
                selectedFile = file
            }
        } label: {
            HStack(spacing: 8) {
                Text(file.status)
                    .font(.system(.caption, design: .monospaced).bold())
                    .foregroundStyle(statusColor(file.status))
                    .frame(width: 24)
                Text(file.path)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Spacer()
                if file.status != "D" {
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .disabled(file.status == "D")
    }

    private func parseFiles(_ status: String) -> [GitFile] {
        status.components(separatedBy: "\n")
            .filter { !$0.isEmpty }
            .map { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                let st = String(trimmed.prefix(2)).trimmingCharacters(in: .whitespaces)
                let path = String(trimmed.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                    .trimmingCharacters(in: CharacterSet(charactersIn: "\""))
                return GitFile(status: st, path: path)
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

// MARK: - Git File Model

struct GitFile: Identifiable {
    var id: String { path }
    let status: String
    let path: String
}

// MARK: - Git File Diff View

struct GitFileDiffView: View {
    let cwd: String
    let file: GitFile
    let serverManager: ServerManager
    @Environment(\.dismiss) private var dismiss
    @State private var oldContent: String?
    @State private var newContent: String?
    @State private var isLoading = true

    private var fileName: String {
        URL(fileURLWithPath: file.path).lastPathComponent
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading diff...")
                } else {
                    DiffDetailView(
                        filePath: file.path,
                        oldString: oldContent ?? "",
                        newString: newContent ?? ""
                    )
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task {
            await loadDiff()
        }
        .preferredColorScheme(.dark)
    }

    private func loadDiff() async {
        guard let base = serverManager.selectedServer?.baseURL else {
            isLoading = false
            return
        }
        let fileEncoded = file.path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let cwdEncoded = cwd.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let url = URL(string: "\(base)/api/git-diff?cwd=\(cwdEncoded)&file=\(fileEncoded)") else {
            isLoading = false
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                await MainActor.run {
                    oldContent = json["oldContent"] as? String ?? ""
                    newContent = json["newContent"] as? String ?? ""
                    isLoading = false
                }
            }
        } catch {
            await MainActor.run { isLoading = false }
        }
    }
}
