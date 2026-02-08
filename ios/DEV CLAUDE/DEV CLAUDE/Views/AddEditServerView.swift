import SwiftUI

/// Form for adding or editing a server entry.
struct AddEditServerView: View {
    enum Mode: Identifiable {
        case add
        case edit(Server)

        var id: String {
            switch self {
            case .add: return "add"
            case .edit(let s): return s.id.uuidString
            }
        }
    }

    let mode: Mode
    @Environment(ServerManager.self) private var serverManager
    @Environment(\.dismiss) private var dismiss

    @State private var url: String = ""
    @State private var alias: String = ""
    @State private var testResult: TestResult?
    @State private var isTesting = false
    @State private var showDeleteConfirm = false

    private enum TestResult {
        case success
        case failure(String)
    }

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    private var editingServer: Server? {
        if case .edit(let server) = mode { return server }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://100.x.x.x:3333", text: $url)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.next)
                        .onChange(of: url) { _, _ in testResult = nil }

                    TextField("My Desktop", text: $alias)
                        .textContentType(.nickname)
                        .submitLabel(.done)
                } header: {
                    Text("Server Details")
                } footer: {
                    Text("Enter the full URL including port, e.g. https://100.64.1.5:3333")
                }

                Section {
                    Button {
                        Task { await testConnection() }
                    } label: {
                        HStack {
                            Text("Test Connection")
                            Spacer()
                            if isTesting {
                                ProgressView()
                            } else if let result = testResult {
                                switch result {
                                case .success:
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                case .failure:
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.red)
                                }
                            }
                        }
                    }
                    .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty || isTesting)

                    if case .failure(let msg) = testResult {
                        Text(msg)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                if isEditing {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            HStack {
                                Spacer()
                                Text("Delete Server")
                                Spacer()
                            }
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit Server" : "Add Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty)
                        .fontWeight(.semibold)
                }
            }
            .confirmationDialog("Delete this server?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let server = editingServer {
                        serverManager.deleteServer(id: server.id)
                    }
                    dismiss()
                }
            }
            .onAppear {
                if let server = editingServer {
                    url = server.url
                    alias = server.alias
                }
            }
        }
    }

    // MARK: - Actions

    private func save() {
        let trimmedURL = url.trimmingCharacters(in: .whitespaces)
        let trimmedAlias = alias.trimmingCharacters(in: .whitespaces)
        guard !trimmedURL.isEmpty else { return }

        if let server = editingServer {
            serverManager.updateServer(id: server.id, url: trimmedURL, alias: trimmedAlias)
        } else {
            serverManager.addServer(url: trimmedURL, alias: trimmedAlias)
        }
        dismiss()
    }

    private func testConnection() async {
        isTesting = true
        testResult = nil

        let testServer = Server(
            id: UUID(),
            url: url.trimmingCharacters(in: .whitespaces),
            alias: "",
            lastUsed: nil
        )

        let ok = await serverManager.testConnection(testServer)
        isTesting = false
        testResult = ok ? .success : .failure("Could not reach server. Check the URL and ensure Tailscale is connected.")
    }
}
