import { useCallback, useEffect, useRef, useState } from "react";

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [subscribed, setSubscribed] = useState(false);
  const subscribedRef = useRef(false);

  const subscribe = useCallback(async () => {
    if (subscribedRef.current) return;

    try {
      // Request notification permission
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== "granted") return;
      } else if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        return;
      }

      // Get VAPID public key from server
      const resp = await fetch("/api/push/vapid-key");
      const { publicKey } = await resp.json();
      if (!publicKey) {
        console.warn("[push] No VAPID public key from server");
        return;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker?.ready;
      if (!registration) {
        console.warn("[push] No service worker registration");
        return;
      }

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Create new subscription
        const applicationServerKey = urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      // Send subscription to server
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      subscribedRef.current = true;
      setSubscribed(true);
      console.log("[push] Subscribed successfully");
    } catch (err) {
      console.error("[push] Subscription failed:", err);
    }
  }, []);

  // Auto-subscribe when component mounts
  useEffect(() => {
    // Small delay to let SW register first
    const timer = setTimeout(() => subscribe(), 2000);
    return () => clearTimeout(timer);
  }, [subscribe]);

  return { permission, subscribed, subscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
