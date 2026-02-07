import type { ModelInfo, PermissionMode } from "../types";

const THINKING_PRESETS = [
  { value: null, label: "Default", desc: "Model decides" },
  { value: 8000, label: "Low", desc: "~8k thinking tokens" },
  { value: 16000, label: "Medium", desc: "~16k thinking tokens" },
  { value: 32000, label: "High", desc: "~32k thinking tokens" },
  { value: 64000, label: "Max", desc: "~64k thinking tokens" },
];

export function Settings({
  models,
  currentModel,
  permissionMode,
  maxThinkingTokens,
  onChangeModel,
  onChangePermissionMode,
  onChangeThinkingTokens,
  onClose,
}: {
  models: ModelInfo[];
  currentModel: string;
  permissionMode: PermissionMode;
  maxThinkingTokens: number | null;
  onChangeModel: (model: string) => void;
  onChangePermissionMode: (mode: PermissionMode) => void;
  onChangeThinkingTokens: (tokens: number | null) => void;
  onClose: () => void;
}) {
  const permModes: { value: PermissionMode; label: string; desc: string }[] = [
    { value: "default", label: "Default", desc: "Prompts for dangerous operations" },
    { value: "acceptEdits", label: "Accept Edits", desc: "Auto-accept file edits" },
    { value: "bypassPermissions", label: "Bypass All", desc: "Skip all permission checks" },
    { value: "plan", label: "Plan Mode", desc: "No execution, planning only" },
  ];

  return (
    <div className="settings-overlay">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="settings-title">Settings</div>
          <button className="btn-icon" onClick={onClose}>&#10005;</button>
        </div>

        <div className="settings-section">
          <div className="settings-label">Model</div>
          <select
            className="settings-select"
            value={currentModel}
            onChange={(e) => onChangeModel(e.target.value)}
          >
            {models.length > 0 ? (
              models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.displayName}
                </option>
              ))
            ) : (
              <option value={currentModel}>{currentModel}</option>
            )}
          </select>
        </div>

        <div className="settings-section">
          <div className="settings-label">Reasoning Effort</div>
          {THINKING_PRESETS.map((preset) => (
            <div
              key={preset.label}
              className={`question-option ${maxThinkingTokens === preset.value ? "selected" : ""}`}
              style={{ marginBottom: 4 }}
              onClick={() => onChangeThinkingTokens(preset.value)}
            >
              <div>
                <div className="question-option-label">{preset.label}</div>
                <div className="question-option-desc">{preset.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="settings-section">
          <div className="settings-label">Permission Mode</div>
          {permModes.map((pm) => (
            <div
              key={pm.value}
              className={`question-option ${permissionMode === pm.value ? "selected" : ""}`}
              style={{ marginBottom: 4 }}
              onClick={() => onChangePermissionMode(pm.value)}
            >
              <div>
                <div className="question-option-label">{pm.label}</div>
                <div className="question-option-desc">{pm.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="settings-section">
          <div className="settings-label" style={{ color: "var(--text-muted)", fontSize: 11 }}>
            To enable 1M context mode, start a new session with it enabled from the start screen.
          </div>
        </div>
      </div>
    </div>
  );
}
