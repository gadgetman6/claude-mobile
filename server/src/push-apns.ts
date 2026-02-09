import { readFile } from "fs/promises";
import { sign } from "crypto";
import http2 from "http2";

// APNs configuration
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_KEY_PATH = process.env.APNS_KEY_PATH;
const APNS_TOPIC = process.env.APNS_TOPIC;
// Use sandbox for development, production for release
const APNS_HOST = process.env.APNS_PRODUCTION === "true"
  ? "api.push.apple.com"
  : "api.sandbox.push.apple.com";

let apnsKey: string | null = null;
let deviceToken: string | null = null;

// Load the .p8 key
async function loadKey(): Promise<string | null> {
  if (apnsKey) return apnsKey;
  if (!APNS_KEY_PATH) {
    console.warn("[apns] APNS_KEY_PATH not set — APNs disabled");
    return null;
  }
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_TOPIC) {
    console.warn("[apns] Missing APNS_KEY_ID/APNS_TEAM_ID/APNS_TOPIC — APNs disabled");
    return null;
  }
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
function generateJWT(key: string, keyId: string, teamId: string): string {
  const header = Buffer.from(JSON.stringify({
    alg: "ES256",
    kid: keyId,
  })).toString("base64url");

  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({
    iss: teamId,
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
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_TOPIC) return;

  const key = await loadKey();
  if (!key) return;

  const jwt = generateJWT(key, APNS_KEY_ID, APNS_TEAM_ID);

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
