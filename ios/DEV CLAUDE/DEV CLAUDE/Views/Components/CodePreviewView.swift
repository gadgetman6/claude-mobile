import SwiftUI
import Textual

/// Syntax-highlighted code preview using Textual's StructuredText.
/// Wraps code in a markdown fenced code block for rendering.
/// Escapes any triple-backtick sequences in the content to prevent broken markdown.
struct CodePreviewView: View {
    let code: String
    let language: String
    let maxLines: Int

    init(code: String, language: String = "", maxLines: Int = 0) {
        self.code = code
        self.language = language
        self.maxLines = maxLines
    }

    private var displayCode: String {
        var result = code

        // Truncate to maxLines if set
        if maxLines > 0 {
            let lines = result.components(separatedBy: "\n")
            if lines.count > maxLines {
                result = lines.prefix(maxLines).joined(separator: "\n") + "\n..."
            }
        }

        // Truncate very long content to prevent memory issues
        if result.count > 8000 {
            result = String(result.prefix(8000)) + "\n... (truncated)"
        }

        return result
    }

    /// Uses a fence with enough backticks to avoid collisions with content.
    private var markdownWrapped: String {
        let cleaned = displayCode
        // Find the longest run of backticks in the content and use one more
        let maxRun = longestBacktickRun(in: cleaned)
        let fence = String(repeating: "`", count: max(3, maxRun + 1))
        return "\(fence)\(language)\n\(cleaned)\n\(fence)"
    }

    var body: some View {
        StructuredText(markdown: markdownWrapped)
            .textual.structuredTextStyle(.gitHub)
            .textual.textSelection(.enabled)
    }

    private func longestBacktickRun(in text: String) -> Int {
        var maxRun = 0
        var currentRun = 0
        for char in text {
            if char == "`" {
                currentRun += 1
                maxRun = max(maxRun, currentRun)
            } else {
                currentRun = 0
            }
        }
        return maxRun
    }
}

/// Detects language from a file path extension.
func detectLanguage(from filePath: String) -> String {
    let ext = (filePath as NSString).pathExtension.lowercased()
    let map: [String: String] = [
        "swift": "swift", "ts": "typescript", "tsx": "tsx", "js": "javascript",
        "jsx": "jsx", "py": "python", "rb": "ruby", "rs": "rust", "go": "go",
        "java": "java", "kt": "kotlin", "c": "c", "cpp": "cpp", "h": "c",
        "m": "objc", "cs": "csharp", "html": "html", "css": "css", "scss": "scss",
        "json": "json", "yaml": "yaml", "yml": "yaml", "toml": "toml",
        "xml": "xml", "sql": "sql", "sh": "bash", "bash": "bash", "zsh": "bash",
        "md": "markdown", "txt": "", "dockerfile": "dockerfile",
        "makefile": "makefile", "tf": "hcl", "vue": "vue", "svelte": "svelte",
    ]
    return map[ext] ?? ""
}
