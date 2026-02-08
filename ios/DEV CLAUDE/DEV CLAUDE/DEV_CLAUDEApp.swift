import SwiftUI

@main
struct DEV_CLAUDEApp: App {
    @State private var serverManager = ServerManager()
    @State private var sessionStore = SessionStore()
    @State private var notificationManager = NotificationManager()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @Environment(\.scenePhase) private var scenePhase

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
            .environment(notificationManager)
            .preferredColorScheme(.dark)
            .onAppear {
                // Share notification manager with app delegate
                appDelegate.notificationManager = notificationManager
                // Request push permission
                notificationManager.requestAuthorization()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                // Reconnect to session when app returns to foreground
                sessionStore.reconnect()
            }
        }
    }
}

/// AppDelegate to receive device token from iOS.
class AppDelegate: NSObject, UIApplicationDelegate {
    var notificationManager: NotificationManager?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        notificationManager?.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[push] Failed to register: \(error)")
    }
}
