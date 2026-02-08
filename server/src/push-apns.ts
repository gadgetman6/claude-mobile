import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { sign } from "crypto";
import http2 from "http2";

const __dirname = dirname(fileURLToPath(import.meta.url));

// APNs configuration
const APNS_KEY_ID = process.env.APNS_KEY_ID ?? "UA6TQ9YD6J";
const APNS_TEAM_ID = process.env.APNS_TEAM_ID ?? "X53TFTT984";
const APNS_KEY_PATH = process.env.APNS_KEY_PATH ?? join(__dirname, "../AuthKey_UA6TQ9YD6J.p8");
const APNS_TOPIC = process.env.APNS_TOPIC ?? "sohan.DEV-CLAUDE";
// Use sandbox for development, production for release
const APNS_HOST = process.env.APNS_PRODUCTION === "true"
  ? "api.push.apple.com"
  : "api.sandbox.push.apple.com";

let apnsKey: string | null = null;
let deviceToken: string | null = null;

// Load the .p8 key
async function loadKey(): Promise<string | null> {
  if (apnsKey) return apnsKey;
  try {
    apnsKey = await readFile(APNS_KEY_PATH, "utf-8");
    console.log("[apns] Loaded APNs key from", APNS_KEY_PATH);
    return apnsKey;
  } catch {
    console.warn("[apns] No APNs key found at", APNS_KEY_PATH);
    return null;
  }
}

// Generate JWT for APNs
function generateJWT(key: string): string {
  const header = Buffer.from(JSON.stringify({
    alg: "ES256",
    kid: APNS_KEY_ID,
  })).toString("base64url");

  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({
    iss: APNS_TEAM_ID,
    iat: now,
  })).toString("base64url");

  const signingInput = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: key,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}

// Store device token
export function setAPNsDeviceToken(token: string) {
  deviceToken = token;
  console.log("[apns] Device token registered:", token.slice(0, 8) + "...");
}

export function getAPNsDeviceToken(): string | null {
  return deviceToken;
}

// Send push notification via APNs
export async function sendAPNsNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (!deviceToken) return;

  const key = await loadKey();
  if (!key) return;

  const jwt = generateJWT(key);

  const payload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: "default",
      "mutable-content": 1,
    },
    ...data,
  });

  return new Promise<void>((resolve) => {
    const client = http2.connect(`https://${APNS_HOST}:443`);

    client.on("error", (err) => {
      console.error("[apns] Connection error:", err.message);
      client.close();
      resolve();
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "authorization": `bearer ${jwt}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
    });

    let responseStatus = 0;
    let responseData = "";

    req.on("response", (headers) => {
      responseStatus = headers[":status"] as number;
    });

    req.on("data", (chunk) => {
      responseData += chunk;
    });

    req.on("end", () => {
      if (responseStatus === 200) {
        console.log("[apns] Notification sent:", title);
      } else {
        console.error("[apns] Failed:", responseStatus, responseData, "host:", APNS_HOST, "topic:", APNS_TOPIC, "token:", deviceToken?.slice(0, 8));
        if (responseStatus === 410) {
          // Token is no longer valid
          deviceToken = null;
          console.log("[apns] Token expired, removed");
        }
      }
      client.close();
      resolve();
    });

    req.on("error", (err) => {
      console.error("[apns] Request error:", err.message);
      client.close();
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

// Initialize on import
loadKey();
