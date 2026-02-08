import Foundation
import UserNotifications
import UIKit

/// Manages push notification registration and display.
@Observable
final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {

    var isAuthorized = false
    var deviceToken: String?

    private var serverBaseURL: URL?

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    // MARK: - Setup

    /// Request permission and register for remote notifications.
    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async {
                self.isAuthorized = granted
                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    /// Called from AppDelegate when device token is received.
    func didRegisterForRemoteNotifications(deviceToken data: Data) {
        let token = data.map { String(format: "%02x", $0) }.joined()
        self.deviceToken = token
        print("[push] Device token: \(token)")
        // Send to server if we have a URL
        if let url = serverBaseURL {
            Task { await registerWithServer(baseURL: url, token: token) }
        }
    }

    /// Set the server URL and send the token if we have one.
    func setServer(_ baseURL: URL?) {
        serverBaseURL = baseURL
        if let url = baseURL, let token = deviceToken {
            Task { await registerWithServer(baseURL: url, token: token) }
        }
    }

    // MARK: - Server Registration

    private func registerWithServer(baseURL: URL, token: String) async {
        guard let url = URL(string: "\(baseURL.absoluteString)/api/push/register-apns") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["deviceToken": token]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                print("[push] Registered APNs token with server")
            }
        } catch {
            print("[push] Failed to register token: \(error)")
        }
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Show notifications even when app is in foreground.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Don't show banners when app is active — the UI handles it
        completionHandler([])
    }

    /// Handle notification taps.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        // Could navigate to specific session/permission here
        completionHandler()
    }
}
