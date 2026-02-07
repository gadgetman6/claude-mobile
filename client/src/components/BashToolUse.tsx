export function BashToolUse({
  input,
  isRunning,
}: {
  input: Record<string, unknown>;
  isRunning: boolean;
}) {
  const command = (input.command as string) ?? "";
  const description = input.description as string | undefined;

  return (
    <div className="tool-content">
      {description && <div className="bash-description">{description}</div>}
      <div className="bash-command">{command}</div>
      {isRunning && (
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <div className="spinner" />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Running...</span>
        </div>
      )}
    </div>
  );
}
