import type { TokenUsage } from "../types";

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function TokenUsageBar({ usage }: { usage: TokenUsage }) {
  const contextPct =
    usage.contextWindow > 0 && usage.currentContextTokens > 0
      ? Math.round((usage.currentContextTokens / usage.contextWindow) * 100)
      : 0;

  return (
    <div className="usage-bar">
      {usage.currentContextTokens > 0 && (
        <div className="usage-item">
          <span className="usage-label">Ctx:</span>
          <span className="usage-value">{formatNum(usage.currentContextTokens)}</span>
        </div>
      )}
      {contextPct > 0 && (
        <div className="usage-item">
          <span className="usage-value" style={{ color: contextPct > 80 ? "var(--danger)" : contextPct > 50 ? "var(--warning)" : undefined }}>
            {contextPct}%
          </span>
        </div>
      )}
      {usage.costUsd > 0 && (
        <div className="usage-item">
          <span className="usage-cost">${usage.costUsd.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}
