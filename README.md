# Claude Mobile

A native iOS client for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), backed by a Node.js relay server that wraps the Claude Agent SDK. Also includes a web client built with React.

## Architecture

```
┌──────────────┐   Socket.IO   ┌────────────────┐  Claude Agent SDK  ┌───────────┐
│   iOS app    │ ◄───────────► │  Node server   │ ◄────────────────► │ Claude AI │
│ (SwiftUI)    │   :3333       │  (Hono + S.IO) │                    └───────────┘
└──────────────┘               └────────────────┘
                                       ▲
┌──────────────┐   Socket.IO           │
│  Web client  │ ◄─────────────────────┘
│ (React/Vite) │
└──────────────┘
```

- **`server/`** — Node.js server (Hono HTTP + Socket.IO). Spawns Claude Code sessions via `@anthropic-ai/claude-agent-sdk` and streams messages to connected clients.
- **`client/`** — React + Vite web client (alternative to the iOS app).
- **`ios/DEV CLAUDE/`** — Native SwiftUI iOS app using Socket.IO-Client-Swift.
- **`maestro/`** — UI test flows (Maestro).

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | v20+ | `nvm install 20` or [nodejs.org](https://nodejs.org) |
| **Bun** | v1.x | `curl -fsSL https://bun.sh/install \| bash` |
| **Xcode** | 16+ | Mac App Store |
| **CocoaPods** | 1.15+ | `brew install cocoapods` or `sudo gem install cocoapods` |
| **Claude Code** | latest | `npm install -g @anthropic-ai/claude-code` |
| **iOS Simulator** | iOS 18+ | Xcode → Settings → Platforms → Download iOS |

You also need an `ANTHROPIC_API_KEY` — get one from <https://console.anthropic.com/>.

---

## 1. Server Setup

```bash
# Clone and install dependencies
cd claude-mobile
bun install

# Configure environment
cp .env.example .env
# Edit .env and set your ANTHROPIC_API_KEY

# Run in dev mode (auto-reloads on changes)
bun run dev:server

# Or run just the server in production mode
bun run start
```

The server starts on `http://0.0.0.0:3333` by default.

### Running the server in the background (for phone use)

When using the iOS app on a physical device, you'll want the server running persistently:

```bash
cd claude-mobile/server
nohup node node_modules/.bin/tsx src/index.ts > /tmp/claude-server-local.log 2>&1 &

# Check logs
tail -f /tmp/claude-server-local.log

# Stop the server
pkill -f "tsx src/index.ts"
```

---

## 2. Web Client (optional)

```bash
# Dev mode with hot reload (runs on http://localhost:5173, proxies API to :3333)
bun run dev:client

# Production build (output in client/dist/, served by the Node server)
bun run build
```

---

## 3. iOS App — Simulator

### First-time setup

```bash
cd "ios/DEV CLAUDE"

# Install CocoaPods dependencies (Socket.IO-Client-Swift)
pod install
```

### Build & run via Xcode

1. Open the **workspace** (not the project):
   ```bash
   open "DEV CLAUDE.xcworkspace"
   ```
2. In Xcode, select the **DEV CLAUDE** scheme in the toolbar.
3. Pick a simulator from the device dropdown (e.g. **iPhone 16 Pro**).
4. Press **Cmd+R** (or Product → Run) to build and launch.

### Build & run via command line

```bash
cd "ios/DEV CLAUDE"

# Build for simulator
xcodebuild \
  -workspace "DEV CLAUDE.xcworkspace" \
  -scheme "DEV CLAUDE" \
  -sdk iphonesimulator \
  -configuration Debug \
  -derivedDataPath ../build \
  build

# Boot a simulator (if none is running)
xcrun simctl boot "iPhone 16 Pro"

# Install and launch on the simulator
xcrun simctl install booted ../build/Build/Products/Debug-iphonesimulator/DEV\ CLAUDE.app
xcrun simctl launch booted sohan.DEV-CLAUDE
```

### Connecting to the server from the simulator

The simulator shares the Mac's network, so use `localhost:3333` as the server address in the app.

---

## 4. iOS App — Physical Device

### Prerequisites for device builds

- An Apple Developer account (free or paid) signed into Xcode → Settings → Accounts.
- Your device connected via USB or on the same Wi-Fi network.
- **Developer Mode** enabled on the device (Settings → Privacy & Security → Developer Mode).

### Signing configuration

1. Open `DEV CLAUDE.xcworkspace` in Xcode.
2. Select the **DEV CLAUDE** target → **Signing & Capabilities** tab.
3. Set **Team** to your Apple Developer account.
4. If using a free account, you may need to change the **Bundle Identifier** to something unique (e.g. `com.yourname.devclaude`).
5. Xcode will automatically create a provisioning profile.

### Build & run via Xcode

1. Open `DEV CLAUDE.xcworkspace`.
2. Select your physical device from the device dropdown.
3. Press **Cmd+R**. On first run, you may need to trust the developer certificate on the device:
   - Go to **Settings → General → VPN & Device Management** on your iPhone.
   - Tap your developer certificate and tap **Trust**.
4. Press **Cmd+R** again after trusting.

### Build & run via command line

```bash
cd "ios/DEV CLAUDE"

# List connected devices to get the device ID
xcrun xctrace list devices

# Build for device (replace DEVICE_ID and TEAM_ID)
xcodebuild \
  -workspace "DEV CLAUDE.xcworkspace" \
  -scheme "DEV CLAUDE" \
  -sdk iphoneos \
  -configuration Debug \
  -derivedDataPath ../build \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  CODE_SIGN_IDENTITY="Apple Development" \
  -destination "id=YOUR_DEVICE_ID" \
  build

# Install on device
xcrun devicectl device install app \
  --device YOUR_DEVICE_ID \
  ../build/Build/Products/Debug-iphoneos/DEV\ CLAUDE.app

# Launch the app
xcrun devicectl device process launch \
  --device YOUR_DEVICE_ID \
  sohan.DEV-CLAUDE
```

### Connecting to the server from a physical device

The iOS app connects to the server over your local network. Make sure:

1. Your Mac and iPhone are on the **same Wi-Fi network**.
2. Find your Mac's local IP:
   ```bash
   ipconfig getifaddr en0
   ```
3. In the iOS app, add a server with your Mac's IP address and port, e.g. `192.168.1.42:3333`.
4. Make sure your Mac's firewall allows incoming connections on port 3333.

> **Tip:** If you're on an enterprise/campus network that blocks peer traffic, use a USB connection and connect to `localhost:3333` (requires enabling the network conduit via Xcode's device window).

---

## 5. Release Build (Ad Hoc / App Store)

### Archive via Xcode

1. Open `DEV CLAUDE.xcworkspace`.
2. Select **Any iOS Device (arm64)** as the destination.
3. Product → Archive.
4. In the Organizer window, select the archive and click **Distribute App**.
5. Choose **Ad Hoc** (for direct installs) or **App Store Connect** (for TestFlight / App Store).

### Archive via command line

```bash
cd "ios/DEV CLAUDE"

# Create a release archive
xcodebuild \
  -workspace "DEV CLAUDE.xcworkspace" \
  -scheme "DEV CLAUDE" \
  -sdk iphoneos \
  -configuration Release \
  -archivePath ../build/DEV_CLAUDE.xcarchive \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  archive

# Export IPA for Ad Hoc distribution
xcodebuild -exportArchive \
  -archivePath ../build/DEV_CLAUDE.xcarchive \
  -exportPath ../build/ipa \
  -exportOptionsPlist ExportOptions.plist
```

You'll need an `ExportOptions.plist` for the export step. Xcode generates one when you distribute via the Organizer for the first time.

---

## Project Structure

```
claude-mobile/
├── server/                  # Node.js relay server
│   ├── src/
│   │   ├── index.ts         # HTTP + Socket.IO server
│   │   ├── agent.ts         # Claude Agent SDK wrapper
│   │   ├── agent-codex.ts   # OpenAI Codex SDK wrapper
│   │   ├── push.ts          # Web push notifications
│   │   ├── push-apns.ts     # APNs push notifications
│   │   └── types.ts         # Shared types
│   └── package.json
├── client/                  # React web client
│   ├── src/
│   │   ├── App.tsx
│   │   ├── hooks/           # Socket.IO session hooks
│   │   └── components/      # UI components
│   └── package.json
├── ios/DEV CLAUDE/          # iOS app
│   ├── DEV CLAUDE/
│   │   ├── DEV_CLAUDEApp.swift
│   │   ├── Models/          # Data models
│   │   ├── Services/        # Socket.IO, session, notifications
│   │   └── Views/           # SwiftUI views
│   ├── DEV CLAUDE.xcworkspace  # ← Open this in Xcode
│   ├── Podfile              # CocoaPods dependencies
│   └── Podfile.lock
├── maestro/                 # UI integration tests
├── package.json             # Workspace root (bun workspaces)
└── .env.example             # Environment variable template
```

---

## Troubleshooting

**"Failed to spawn Claude Code process: spawn node ENOENT"**
The server can't find `node` on PATH. This happens when running via `nohup` since shell profiles aren't sourced. The server auto-fixes this at startup, but make sure `node` is installed (check with `which node`).

**CocoaPods install fails**
Make sure you're running `pod install` inside `ios/DEV CLAUDE/` (where the `Podfile` is), not from the repo root.

**"Untrusted Developer" on device**
Go to Settings → General → VPN & Device Management on your iPhone, tap the certificate, and tap Trust.

**Can't connect from iPhone to server**
Verify both devices are on the same network. Check your Mac's IP with `ipconfig getifaddr en0` and ensure the firewall allows port 3333.
