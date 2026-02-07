import type { TokenUsage } from "../types";

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function TokenUsageBar({ usage }: { usage: TokenUsage }) {
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const contextPct =
    usage.contextWindow > 0
      ? Math.round((totalTokens / usage.contextWindow) * 100)
      : 0;

  return (
    <div className="usage-bar">
      <div className="usage-item">
        <span className="usage-label">In:</span>
        <span className="usage-value">{formatNum(usage.inputTokens)}</span>
      </div>
      <div className="usage-item">
        <span className="usage-label">Out:</span>
        <span className="usage-value">{formatNum(usage.outputTokens)}</span>
      </div>
      {usage.cacheReadTokens > 0 && (
        <div className="usage-item">
          <span className="usage-label">Cache:</span>
          <span className="usage-value">{formatNum(usage.cacheReadTokens)}</span>
        </div>
      )}
      {usage.contextWindow > 0 && (
        <div className="usage-item">
          <span className="usage-label">Ctx:</span>
          <span className="usage-value">{contextPct}%</span>
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
