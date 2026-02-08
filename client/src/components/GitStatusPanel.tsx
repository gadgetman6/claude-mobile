import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import ReactDiffViewer from "react-diff-viewer-continued";
import { useDiffHighlighter, getLangFromPath } from "@/components/SyntaxHighlight";

const diffStyles = {
  variables: {
    dark: {
      diffViewerBackground: "var(--bg-primary)",
      gutterBackground: "var(--bg-secondary)",
      addedBackground: "rgba(76, 175, 80, 0.12)",
      addedColor: "#66bb6a",
      removedBackground: "rgba(244, 67, 54, 0.12)",
      removedColor: "#ef5350",
      wordAddedBackground: "rgba(76, 175, 80, 0.25)",
      wordRemovedBackground: "rgba(244, 67, 54, 0.25)",
      addedGutterBackground: "rgba(76, 175, 80, 0.08)",
      removedGutterBackground: "rgba(244, 67, 54, 0.08)",
      gutterColor: "var(--text-muted)",
      codeFoldBackground: "var(--bg-tertiary)",
      codeFoldGutterBackground: "var(--bg-tertiary)",
      codeFoldContentColor: "var(--text-muted)",
      emptyLineBackground: "var(--bg-primary)",
    },
  },
  diffContainer: {
    tableLayout: "auto",
    width: "auto",
    minWidth: "100%",
    "& pre": { whiteSpace: "pre" },
  },
  lineContent: {
    overflow: "visible",
    width: "auto",
  },
  contentText: {
    fontSize: "12px",
    lineHeight: "1.4",
    fontFamily: '"SF Mono", "Fira Code", monospace',
    whiteSpace: "pre",
    lineBreak: "auto",
  },
  gutter: {
    minWidth: "28px",
    padding: "0 4px",
    fontSize: "10px",
  },
  line: {
    padding: "0 6px",
  },
};

type FileDiff = {
  filePath: string;
  oldContent: string;
  newContent: string;
};

function DiffOverlay({ diff, onClose }: { diff: FileDiff; onClose: () => void }) {
  const renderContent = useDiffHighlighter(diff.filePath);
  const lang = getLangFromPath(diff.filePath);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg-primary)", display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
        background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer", padding: 4, display: "flex" }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {diff.filePath.split("/").pop()}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {diff.filePath}
          </div>
        </div>
        <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 6px", background: "var(--bg-tertiary)", borderRadius: 4 }}>
          {lang}
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto", WebkitOverflowScrolling: "touch" }}>
        <ReactDiffViewer
          oldValue={diff.oldContent}
          newValue={diff.newContent}
          splitView={false}
          useDarkTheme={true}
          showDiffOnly={false}
          styles={diffStyles}
          hideLineNumbers={false}
          renderContent={renderContent}
        />
      </div>
    </div>
  );
}

export function GitStatusPanel({
  gitStatus,
  cwd,
  onRefresh,
  onClose,
}: {
  gitStatus: { status: string; diff: string; branch: string } | null;
  cwd: string;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [activeDiff, setActiveDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const openFileDiff = async (line: string) => {
    const filePath = line.replace(/^.{2}\s+/, "").replace(/^"(.*)"$/, "$1").trim();
    if (!filePath) return;
    setLoading(filePath);
    try {
      const res = await fetch(`/api/git-diff?cwd=${encodeURIComponent(cwd)}&file=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.oldContent != null && data.newContent != null) {
        setActiveDiff({ filePath: data.filePath ?? `${cwd}/${filePath}`, oldContent: data.oldContent, newContent: data.newContent });
      }
    } catch {} finally {
      setLoading(null);
    }
  };

  return (
    <>
      <div className="settings-overlay">
        <div className="settings-backdrop" onClick={onClose} />
        <div className="git-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="settings-title">Git Status</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-icon" onClick={onRefresh} title="Refresh">&#8635;</button>
              <button className="btn-icon" onClick={onClose}>&#10005;</button>
            </div>
          </div>

          {gitStatus ? (
            <>
              <div className="git-branch">&#9733; {gitStatus.branch}</div>

              {gitStatus.status ? (
                <div className="git-files">
                  {gitStatus.status.split("\n").map((line, i) => {
                    const code = line.slice(0, 2).trim();
                    let className = "";
                    if (code.includes("M")) className = "git-file-m";
                    else if (code.includes("A") || code === "??") className = "git-file-a";
                    else if (code.includes("D")) className = "git-file-d";
                    else if (code.includes("U")) className = "git-file-u";
                    const isDeleted = code.includes("D");
                    const filePath = line.replace(/^.{2}\s+/, "").replace(/^"(.*)"$/, "$1").trim();
                    const isLoading = loading === filePath;

                    return (
                      <div
                        key={i}
                        className={`${className} git-file-item`}
                        onClick={isDeleted ? undefined : () => openFileDiff(line)}
                        style={{
                          cursor: isDeleted ? undefined : "pointer",
                          padding: "4px 6px",
                          borderRadius: 4,
                          opacity: isLoading ? 0.5 : 1,
                        }}
                      >
                        {line}
                        {isLoading && <span style={{ marginLeft: 6, fontSize: 10 }}>...</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Working tree clean</div>
              )}

              {gitStatus.diff && (
                <div style={{ marginTop: 12 }}>
                  <div className="settings-label">Diff Stats</div>
                  <div className="git-files" style={{ fontSize: 11 }}>{gitStatus.diff}</div>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading...</div>
          )}
        </div>
      </div>
      {activeDiff && <DiffOverlay diff={activeDiff} onClose={() => setActiveDiff(null)} />}
    </>
  );
}
