import SwiftUI

/// Landing screen: lists saved servers, lets user add/edit/select one.
struct ServerListView: View {
    @Environment(ServerManager.self) private var serverManager
    @State private var showAddServer = false
    @State private var editingServer: Server?
    @State private var reachability: [UUID: Bool] = [:]
    @State private var checkingAll = false

    var body: some View {
        Group {
            if serverManager.servers.isEmpty {
                emptyState
            } else {
                serverList
            }
        }
        .navigationTitle("Servers")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddServer = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddServer) {
            AddEditServerView(mode: .add)
        }
        .sheet(item: $editingServer) { server in
            AddEditServerView(mode: .edit(server))
        }
        .task {
            await checkAllServers()
        }
    }

    // MARK: - Server List

    private var serverList: some View {
        List {
            ForEach(serverManager.sortedServers) { server in
                NavigationLink(value: server) {
                    serverRow(server)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        serverManager.deleteServer(id: server.id)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    Button {
                        editingServer = server
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                    .tint(.blue)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await checkAllServers()
        }
    }

    private func serverRow(_ server: Server) -> some View {
        HStack(spacing: 12) {
            // Reachability indicator
            Circle()
                .fill(reachabilityColor(for: server.id))
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(server.alias)
                    .font(.headline)
                Text(server.displayURL)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if let lastUsed = server.lastUsed {
                Text(lastUsed, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
    }

    private func reachabilityColor(for id: UUID) -> Color {
        guard let reachable = reachability[id] else {
            return .gray.opacity(0.4)
        }
        return reachable ? .green : .red
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Servers", systemImage: "server.rack")
        } description: {
            Text("Add your Tailscale server to get started.")
        } actions: {
            Button("Add Server") {
                showAddServer = true
            }
            .buttonStyle(.borderedProminent)
        }
    }

    // MARK: - Health Checks

    private func checkAllServers() async {
        checkingAll = true
        await withTaskGroup(of: (UUID, Bool).self) { group in
            for server in serverManager.servers {
                group.addTask {
                    let ok = await serverManager.testConnection(server)
                    return (server.id, ok)
                }
            }
            for await (id, ok) in group {
                reachability[id] = ok
            }
        }
        checkingAll = false
    }
}
