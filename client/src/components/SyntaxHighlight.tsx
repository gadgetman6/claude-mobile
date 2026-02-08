import { useEffect, useState, useRef, memo, type ReactElement } from "react";
import { codeToHtml, createHighlighter, type HighlighterGeneric } from "shiki";

const THEME = "dark-plus";

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", rb: "ruby", rs: "rust", go: "go",
  java: "java", kt: "kotlin", swift: "swift", c: "c",
  cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
  css: "css", scss: "scss", html: "html", xml: "xml",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "markdown", sh: "bash", bash: "bash", zsh: "bash",
  sql: "sql", graphql: "graphql", dockerfile: "dockerfile",
  vue: "vue", svelte: "svelte", php: "php", lua: "lua",
};

export function getLangFromPath(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  if (name === "Dockerfile") return "dockerfile";
  if (name === "Makefile") return "makefile";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "text";
}

// --- Shared highlighter instance for sync rendering (diff viewer) ---

let highlighterPromise: Promise<HighlighterGeneric<string, string>> | null = null;

function getHighlighter(lang: string) {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [THEME], langs: [lang] });
  }
  return highlighterPromise;
}

/**
 * Hook that returns a renderContent function for react-diff-viewer-continued.
 * Highlights code lines using shiki, falling back to plain text until loaded.
 */
export function useDiffHighlighter(filePath: string): ((source: string) => ReactElement) | undefined {
  const lang = getLangFromPath(filePath);
  const [hl, setHl] = useState<HighlighterGeneric<string, string> | null>(null);
  const langRef = useRef(lang);

  useEffect(() => {
    let cancelled = false;
    getHighlighter(lang).then(async (h) => {
      const loaded = h.getLoadedLanguages();
      if (!loaded.includes(lang) && lang !== "text") {
        await h.loadLanguage(lang as Parameters<typeof h.loadLanguage>[0]);
      }
      if (!cancelled) setHl(h);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [lang]);

  if (!hl) return undefined;

  return (source: string) => {
    try {
      const html = hl.codeToHtml(source, { lang: langRef.current, theme: THEME });
      return <span className="syntax-highlight-inline" dangerouslySetInnerHTML={{ __html: html }} />;
    } catch {
      return <span>{source}</span>;
    }
  };
}

// --- Full block syntax highlight component ---

type Props = {
  code: string;
  lang?: string;
  filePath?: string;
  fontSize?: number;
  maxHeight?: number;
};

function SyntaxHighlightInner({ code, lang, filePath, fontSize = 11, maxHeight }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const language = lang ?? (filePath ? getLangFromPath(filePath) : "text");

  useEffect(() => {
    let cancelled = false;
    codeToHtml(code, { lang: language, theme: THEME })
      .then((result) => { if (!cancelled) setHtml(result); })
      .catch(() => { if (!cancelled) setHtml(null); });
    return () => { cancelled = true; };
  }, [code, language]);

  if (!html) {
    return (
      <pre
        style={{
          fontSize,
          lineHeight: 1.5,
          fontFamily: '"SF Mono", "Fira Code", monospace',
          whiteSpace: "pre",
          color: "var(--text-secondary)",
          padding: "8px 10px",
          margin: 0,
          maxHeight,
          overflowX: "auto",
          overflowY: maxHeight ? "auto" : undefined,
        }}
      >
        {code}
      </pre>
    );
  }

  return (
    <div
      className="syntax-highlight"
      style={{ maxHeight, overflow: maxHeight ? "auto" : undefined }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export const SyntaxHighlight = memo(SyntaxHighlightInner);
