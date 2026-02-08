import SwiftUI

@main
struct DEV_CLAUDEApp: App {
    @State private var serverManager = ServerManager()
    @State private var sessionStore = SessionStore()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                ServerListView()
                    .navigationDestination(for: Server.self) { server in
                        StartSessionView(server: server)
                    }
            }
            .environment(serverManager)
            .environment(sessionStore)
            .preferredColorScheme(.dark)
        }
    }
}
