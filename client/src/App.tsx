import { useCallback, useEffect, useState } from "react";
import { useAgent, getSavedSession, clearSavedSession } from "./hooks/useAgent";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { ChatView } from "./components/ChatView";
import { ChatInput } from "./components/ChatInput";
import { TokenUsageBar } from "./components/TokenUsageBar";
import { PermissionPrompt } from "./components/PermissionPrompt";
import { Settings } from "./components/Settings";
import { GitStatusPanel } from "./components/GitStatusPanel";

const CWD_KEY = "claude-mobile-cwd";

type RecentSession = {
  id: string;
  timestamp: string;
  firstMessage: string;
  model?: string;
  isRunning?: boolean;
};

const PERM_LABELS: Record<string, { label: string; cls: string }> = {
  default: { label: "default", cls: "default" },
  acceptEdits: { label: "accept edits", cls: "acceptEdits" },
  bypassPermissions: { label: "YOLO", cls: "bypassPermissions" },
  plan: { label: "plan", cls: "plan" },
  dontAsk: { label: "don't ask", cls: "default" },
};

export function App() {
  const agent = useAgent();
  usePushNotifications();
  const [showSettings, setShowSettings] = useState(false);
  const [showGit, setShowGit] = useState(false);

  // Start session form state — restore last cwd from localStorage
  const [cwd, setCwd] = useState(() => {
    try { return localStorage.getItem(CWD_KEY) ?? "/home/debian"; } catch { return "/home/debian"; }
  });
  const [startModel, setStartModel] = useState("claude-opus-4-6");
  const [startPermMode, setStartPermMode] = useState<"default" | "acceptEdits" | "bypassPermissions">("default");
  const [enable1m, setEnable1m] = useState(true);
  const [inSession, setInSession] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  // Push notifications handled by usePushNotifications hook

  // Auto-restore session from localStorage on mount
  useEffect(() => {
    const saved = getSavedSession();
    if (saved) {
      setCwd(saved.cwd);
      setStartModel(saved.model);
      setStartPermMode(saved.permissionMode as any);
      if (agent.wsState === "connected") {
        setInSession(true);
      }
    }
  }, [agent.wsState]);

  // Save cwd to localStorage and fetch recent sessions when it changes
  useEffect(() => {
    const dir = cwd.trim();
    if (dir) {
      try { localStorage.setItem(CWD_KEY, dir); } catch {}
    }
    if (!dir || inSession) return;
    fetch(`/api/sessions?cwd=${encodeURIComponent(dir)}`)
      .then((r) => r.json())
      .then((data) => setRecentSessions(data))
      .catch(() => setRecentSessions([]));
  }, [cwd, inSession]);

  const handleStartSession = useCallback((resumeId?: string) => {
    const dir = cwd.trim() || undefined;
    if (!dir) return;
    setInSession(true);
    agent.startSession(dir, startModel, startPermMode, enable1m, resumeId);
  }, [cwd, startModel, startPermMode, enable1m, agent]);

  const handleBack = useCallback(() => {
    setInSession(false);
    clearSavedSession();
    // Don't close the server session — it continues in background
  }, []);

  const handleOpenGit = useCallback(() => {
    setShowGit(true);
    agent.fetchGitStatus(cwd || undefined);
  }, [agent, cwd]);

  const perm = PERM_LABELS[agent.permissionMode] ?? PERM_LABELS.default;

  // Start screen
  if (!inSession) {
    return (
      <div className="app">
        <div className="header">
          <div className="header-left">
            <h1>Claude Mobile</h1>
          </div>
          <div className="header-right">
            <div className={`connection-dot ${agent.wsState}`} title={agent.wsState} />
          </div>
        </div>

        <div className="start-screen">
          <div className="start-title">Start a Session</div>
          <div className="start-subtitle">
            Enter the working directory for Claude to operate in
          </div>

          <div className="start-form">
            <input
              className="start-input"
              placeholder="/path/to/project"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
            />

            <select
              className="settings-select"
              value={startModel}
              onChange={(e) => setStartModel(e.target.value)}
            >
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            </select>

            <select
              className="settings-select"
              value={startPermMode}
              onChange={(e) => setStartPermMode(e.target.value as any)}
            >
              <option value="default">Default permissions</option>
              <option value="acceptEdits">Accept edits</option>
              <option value="bypassPermissions">Bypass all (dangerous)</option>
            </select>

            <div className="settings-toggle">
              <span style={{ fontSize: 13 }}>1M Context (Opus 4.6)</span>
              <div
                className={`toggle-switch ${enable1m ? "active" : ""}`}
                onClick={() => setEnable1m(!enable1m)}
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", padding: "12px", opacity: (!cwd.trim() || agent.wsState !== "connected") ? 0.5 : 1 }}
              onClick={() => handleStartSession()}
              disabled={!cwd.trim() || agent.wsState !== "connected"}
            >
              {agent.wsState !== "connected" ? "Connecting..." : "New Session"}
            </button>

            {agent.error && (
              <div style={{ color: "var(--danger)", fontSize: 12, textAlign: "center" }}>
                {agent.error}
              </div>
            )}

            {recentSessions.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="settings-label">Resume Recent Session</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {recentSessions.map((s) => (
                    <div
                      key={s.id}
                      className="question-option"
                      onClick={() => handleStartSession(s.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="question-option-label" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.firstMessage}
                        </div>
                        <div className="question-option-desc">
                          {s.isRunning && <span style={{ color: "var(--success)", marginRight: 4 }}>&#9679; running</span>}
                          {new Date(s.timestamp).toLocaleDateString()} {new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active session
  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <button className="btn-icon" onClick={handleBack} title="Back to sessions" style={{ fontSize: 14 }}>
            &#8592;
          </button>
          <div className={`connection-dot ${agent.wsState}`} title={agent.wsState} />
          <h1>Claude</h1>
          <span className={`perm-badge ${perm.cls}`}>{perm.label}</span>
        </div>
        <div className="header-right">
          <button className="btn-icon" onClick={handleOpenGit} title="Git status">
            G
          </button>
          <button className="btn-icon" onClick={() => { setShowSettings(true); agent.fetchModels(); }} title="Settings">
            &#9881;
          </button>
        </div>
      </div>

      {/* Compacting indicator */}
      {agent.isCompacting && (
        <div className="usage-bar" style={{ justifyContent: "center", color: "var(--warning)" }}>
          <div className="spinner" style={{ width: 12, height: 12 }} />
          <span>Compacting context...</span>
        </div>
      )}

      {/* Token usage */}
      <TokenUsageBar usage={agent.usage} />

      {/* Messages */}
      <ChatView messages={agent.messages} />

      {/* Permission prompt overlay */}
      {agent.pendingPermission && (
        <PermissionPrompt
          request={agent.pendingPermission}
          onRespond={agent.respondPermission}
          onRespondQuestion={agent.respondAskQuestion}
        />
      )}

      {/* Chat input */}
      <ChatInput
        onSend={agent.sendMessage}
        onInterrupt={agent.interrupt}
        isStreaming={agent.isStreaming}
        disabled={agent.wsState !== "connected"}
      />

      {/* Settings panel */}
      {showSettings && (
        <Settings
          models={agent.models}
          currentModel={agent.currentModel}
          permissionMode={agent.permissionMode}
          maxThinkingTokens={agent.maxThinkingTokens}
          onChangeModel={agent.changeModel}
          onChangePermissionMode={agent.changePermissionMode}
          onChangeThinkingTokens={agent.changeThinkingTokens}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Git status panel */}
      {showGit && (
        <GitStatusPanel
          gitStatus={agent.gitStatus}
          onRefresh={() => agent.fetchGitStatus(cwd || undefined)}
          onClose={() => setShowGit(false)}
        />
      )}
    </div>
  );
}
