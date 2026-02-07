export function GitStatusPanel({
  gitStatus,
  onRefresh,
  onClose,
}: {
  gitStatus: { status: string; diff: string; branch: string } | null;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <div className="settings-overlay">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="git-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="settings-title">Git Status</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-icon" onClick={onRefresh} title="Refresh">
              &#8635;
            </button>
            <button className="btn-icon" onClick={onClose}>&#10005;</button>
          </div>
        </div>

        {gitStatus ? (
          <>
            <div className="git-branch">
              &#9733; {gitStatus.branch}
            </div>

            {gitStatus.status ? (
              <div className="git-files">
                {gitStatus.status.split("\n").map((line, i) => {
                  const code = line.slice(0, 2).trim();
                  let className = "";
                  if (code.includes("M")) className = "git-file-m";
                  else if (code.includes("A") || code === "??") className = "git-file-a";
                  else if (code.includes("D")) className = "git-file-d";
                  else if (code.includes("U")) className = "git-file-u";

                  return (
                    <div key={i} className={className}>
                      {line}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                Working tree clean
              </div>
            )}

            {gitStatus.diff && (
              <div style={{ marginTop: 12 }}>
                <div className="settings-label">Diff Stats</div>
                <div className="git-files" style={{ fontSize: 11 }}>
                  {gitStatus.diff}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}
