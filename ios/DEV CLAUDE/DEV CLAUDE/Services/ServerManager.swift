import Foundation
import Observation

/// Manages the list of saved servers, persisted to UserDefaults.
@Observable
final class ServerManager {

    // MARK: - Published State

    private(set) var servers: [Server] = []
    var selectedServer: Server?

    // MARK: - Private

    private let storageKey = "dev-claude-servers"
    private let selectedKey = "dev-claude-selected-server-id"

    // MARK: - Init

    init() {
        load()
    }

    // MARK: - CRUD

    func addServer(url: String, alias: String) {
        let server = Server(
            id: UUID(),
            url: normalizeURL(url),
            alias: alias.isEmpty ? "Server" : alias,
            lastUsed: nil
        )
        servers.append(server)
        save()
    }

    func updateServer(id: UUID, url: String, alias: String) {
        guard let idx = servers.firstIndex(where: { $0.id == id }) else { return }
        servers[idx].url = normalizeURL(url)
        servers[idx].alias = alias.isEmpty ? "Server" : alias
        save()
    }

    func deleteServer(id: UUID) {
        servers.removeAll { $0.id == id }
        if selectedServer?.id == id {
            selectedServer = nil
        }
        save()
    }

    func selectServer(_ server: Server) {
        guard let idx = servers.firstIndex(where: { $0.id == server.id }) else { return }
        servers[idx].lastUsed = Date()
        selectedServer = servers[idx]
        save()
        saveSelectedId(server.id)
    }

    // MARK: - Health Check

    /// Pings the server's /api/health endpoint. Returns true if reachable.
    func testConnection(_ server: Server) async -> Bool {
        guard let base = server.baseURL,
              let healthURL = URL(string: "\(base.absoluteString)/api/health") else {
            return false
        }

        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 5

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return false
            }
            // Server returns {"ok":true}
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let ok = json["ok"] as? Bool {
                return ok
            }
            return false
        } catch {
            return false
        }
    }

    // MARK: - Sorted

    /// Servers sorted by most recently used first, then by alias.
    var sortedServers: [Server] {
        servers.sorted { a, b in
            switch (a.lastUsed, b.lastUsed) {
            case let (aDate?, bDate?): return aDate > bDate
            case (_?, nil): return true
            case (nil, _?): return false
            case (nil, nil): return a.alias.localizedCaseInsensitiveCompare(b.alias) == .orderedAscending
            }
        }
    }

    // MARK: - Persistence

    private func save() {
        guard let data = try? JSONEncoder().encode(servers) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([Server].self, from: data) else {
            return
        }
        servers = decoded

        // Restore selected server
        if let savedId = UserDefaults.standard.string(forKey: selectedKey),
           let uuid = UUID(uuidString: savedId) {
            selectedServer = servers.first { $0.id == uuid }
        }
    }

    private func saveSelectedId(_ id: UUID) {
        UserDefaults.standard.set(id.uuidString, forKey: selectedKey)
    }

    private func normalizeURL(_ url: String) -> String {
        var u = url.trimmingCharacters(in: .whitespacesAndNewlines)
        // Strip trailing slash
        while u.hasSuffix("/") { u = String(u.dropLast()) }
        // Add https:// if no scheme
        if !u.hasPrefix("http://") && !u.hasPrefix("https://") {
            u = "https://" + u
        }
        return u
    }
}
