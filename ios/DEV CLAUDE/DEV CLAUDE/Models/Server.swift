import Foundation

/// A remote Bun server the app can connect to (typically over Tailscale).
struct Server: Identifiable, Codable, Hashable {
    var id: UUID
    var url: String        // e.g. "https://100.64.1.5:3333"
    var alias: String      // e.g. "Desktop", "Cloud VM"
    var lastUsed: Date?

    /// Computed base URL with trailing slash stripped.
    var baseURL: URL? {
        let cleaned = url.hasSuffix("/") ? String(url.dropLast()) : url
        return URL(string: cleaned)
    }

    /// Display-friendly URL (strip protocol prefix for compact display).
    var displayURL: String {
        url.replacingOccurrences(of: "https://", with: "")
           .replacingOccurrences(of: "http://", with: "")
    }
}
