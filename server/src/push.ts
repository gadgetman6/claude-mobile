import webpush from "web-push";

const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const email = process.env.VAPID_EMAIL ?? "mailto:user@example.com";

if (publicKey && privateKey) {
  webpush.setVapidDetails(email, publicKey, privateKey);
  console.log("[push] VAPID keys configured");
} else {
  console.warn("[push] No VAPID keys found — push notifications disabled");
}

// Store subscriptions (in-memory for single user)
let subscription: webpush.PushSubscription | null = null;

export function getVapidPublicKey(): string {
  return publicKey;
}

export function setSubscription(sub: webpush.PushSubscription) {
  subscription = sub;
  console.log("[push] Subscription registered");
}

export function removeSubscription() {
  subscription = null;
  console.log("[push] Subscription removed");
}

export async function sendPushNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (!subscription || !publicKey || !privateKey) return;

  const payload = JSON.stringify({
    title,
    body,
    data,
    timestamp: Date.now(),
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log("[push] Notification sent:", title);
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired/invalid
      console.log("[push] Subscription expired, removing");
      subscription = null;
    } else {
      console.error("[push] Failed to send:", err.message ?? err);
    }
  }
}
