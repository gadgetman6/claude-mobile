import SwiftUI
import Textual

/// Reusable unified diff view that renders line-by-line diffs with
/// line numbers, +/- coloring, and horizontal scroll for long lines.
///
/// Can accept either:
/// - Old/new strings which will be diffed via LCS
/// - Pre-parsed DiffLine array
struct UnifiedDiffView: View {
    let filePath: String
    let lines: [DiffLine]
    let maxLines: Int

    /// Initialize with old/new strings — computes diff via LCS.
    init(filePath: String, oldString: String, newString: String, maxLines: Int = 0) {
        self.filePath = filePath
        self.maxLines = maxLines
        self.lines = UnifiedDiffView.computeDiff(old: oldString, new: newString)
    }

    /// Initialize with pre-parsed diff lines (e.g. from git diff output).
    init(filePath: String, lines: [DiffLine], maxLines: Int = 0) {
        self.filePath = filePath
        self.lines = lines
        self.maxLines = maxLines
    }

    var body: some View {
        let displayLines = maxLines > 0 ? Array(lines.prefix(maxLines)) : lines

        if displayLines.isEmpty {
            Text("No changes")
                .font(.caption)
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(displayLines.enumerated()), id: \.offset) { _, line in
                    DiffLineRow(line: line)
                }
                if maxLines > 0 && lines.count > maxLines {
                    Text("  ... \(lines.count - maxLines) more lines")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 4)
                        .padding(.leading, 80)
                }
            }
        }
    }

    // MARK: - LCS Diff

    static func computeDiff(old: String, new: String) -> [DiffLine] {
        let oldLines = old.isEmpty ? [] : old.components(separatedBy: "\n")
        let newLines = new.isEmpty ? [] : new.components(separatedBy: "\n")
        if oldLines.isEmpty && newLines.isEmpty { return [] }

        // For very large files, fall back to simple diff
        if oldLines.count + newLines.count > 5000 {
            return simpleDiff(oldLines: oldLines, newLines: newLines)
        }

        let m = oldLines.count
        let n = newLines.count

        // LCS DP table
        var dp = Array(repeating: Array(repeating: 0, count: n + 1), count: m + 1)
        for i in 1...max(m, 1) {
            guard i <= m else { break }
            for j in 1...max(n, 1) {
                guard j <= n else { break }
                if oldLines[i - 1] == newLines[j - 1] {
                    dp[i][j] = dp[i - 1][j - 1] + 1
                } else {
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
                }
            }
        }

        // Backtrack
        var stack: [DiffLine] = []
        var i = m, j = n
        while i > 0 || j > 0 {
            if i > 0 && j > 0 && oldLines[i - 1] == newLines[j - 1] {
                stack.append(DiffLine(type: .context, text: oldLines[i - 1], oldNum: i, newNum: j))
                i -= 1; j -= 1
            } else if j > 0 && (i == 0 || dp[i][j - 1] >= dp[i - 1][j]) {
                stack.append(DiffLine(type: .addition, text: newLines[j - 1], oldNum: nil, newNum: j))
                j -= 1
            } else if i > 0 {
                stack.append(DiffLine(type: .deletion, text: oldLines[i - 1], oldNum: i, newNum: nil))
                i -= 1
            }
        }
        return stack.reversed()
    }

    private static func simpleDiff(oldLines: [String], newLines: [String]) -> [DiffLine] {
        var result: [DiffLine] = []
        for (i, line) in oldLines.enumerated() {
            result.append(DiffLine(type: .deletion, text: line, oldNum: i + 1, newNum: nil))
        }
        for (i, line) in newLines.enumerated() {
            result.append(DiffLine(type: .addition, text: line, oldNum: nil, newNum: i + 1))
        }
        return result
    }
}

/// Full-screen diff detail view with syntax highlighting.
struct DiffDetailView: View {
    let filePath: String
    let oldString: String
    let newString: String

    private var fileName: String {
        URL(fileURLWithPath: filePath).lastPathComponent
    }

    var body: some View {
        DiffCodeView(
            filePath: filePath,
            lines: UnifiedDiffView.computeDiff(old: oldString, new: newString)
        )
        .navigationTitle(fileName)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Full-screen diff detail view for pre-parsed unified diff lines.
struct UnifiedDiffDetailView: View {
    let filePath: String
    let lines: [DiffLine]

    private var fileName: String {
        URL(fileURLWithPath: filePath).lastPathComponent
    }

    var body: some View {
        DiffCodeView(filePath: filePath, lines: lines)
            .navigationTitle(fileName)
            .navigationBarTitleDisplayMode(.inline)
    }
}

/// Renders diff with colored line-by-line rows inside a scrollable container.
private struct DiffCodeView: View {
    let filePath: String
    let lines: [DiffLine]

    var body: some View {
        if lines.isEmpty {
            Text("No changes")
                .foregroundStyle(.secondary)
                .padding()
        } else {
            ScrollView([.horizontal, .vertical], showsIndicators: true) {
                UnifiedDiffView(filePath: filePath, lines: lines)
                    .padding(.vertical, 4)
            }
        }
    }
}

// MARK: - Diff Line Model

struct DiffLine {
    enum LineType {
        case context, addition, deletion, hunk
    }
    let type: LineType
    let text: String
    let oldNum: Int?
    let newNum: Int?
}

// MARK: - Diff Line Row

struct DiffLineRow: View {
    let line: DiffLine

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Line number gutter
            Text(line.oldNum.map { String($0) } ?? "")
                .frame(width: 32, alignment: .trailing)
                .foregroundStyle(.tertiary)
            Text(line.newNum.map { String($0) } ?? "")
                .frame(width: 32, alignment: .trailing)
                .foregroundStyle(.tertiary)

            // Prefix (+/-)
            Text(prefix)
                .frame(width: 16, alignment: .center)
                .foregroundStyle(prefixColor)

            // Content — no wrapping, parent provides horizontal scroll
            Text(line.text.isEmpty ? " " : line.text)
                .foregroundStyle(textColor)
                .fixedSize(horizontal: true, vertical: false)
                .textSelection(.enabled)
        }
        .font(.system(size: 11, design: .monospaced))
        .padding(.vertical, 0.5)
        .padding(.trailing, 16)
        .background(backgroundColor)
    }

    private var prefix: String {
        switch line.type {
        case .addition: return "+"
        case .deletion: return "-"
        case .hunk: return ""
        case .context: return ""
        }
    }

    private var prefixColor: Color {
        switch line.type {
        case .addition: return .green
        case .deletion: return .red
        default: return .secondary
        }
    }

    private var textColor: Color {
        switch line.type {
        case .addition: return .green
        case .deletion: return .red
        case .hunk: return .blue
        case .context: return .primary
        }
    }

    private var backgroundColor: Color {
        switch line.type {
        case .addition: return .green.opacity(0.1)
        case .deletion: return .red.opacity(0.1)
        case .hunk: return .blue.opacity(0.08)
        case .context: return .clear
        }
    }
}

/// Parses a unified diff string (from `git diff`) into DiffLine array.
func parseUnifiedDiff(_ diff: String) -> (lines: [DiffLine], additions: Int, deletions: Int) {
    var result: [DiffLine] = []
    var adds = 0
    var dels = 0
    var oldLineNum = 0
    var newLineNum = 0

    for rawLine in diff.components(separatedBy: "\n") {
        if rawLine.hasPrefix("@@") {
            let parts = rawLine.components(separatedBy: " ")
            if parts.count >= 3 {
                let newPart = parts[2]
                let nums = newPart.dropFirst().components(separatedBy: ",")
                newLineNum = Int(nums[0]) ?? 0
                let oldPart = parts[1]
                let oldNums = oldPart.dropFirst().components(separatedBy: ",")
                oldLineNum = Int(oldNums[0]) ?? 0
            }
            result.append(DiffLine(type: .hunk, text: rawLine, oldNum: nil, newNum: nil))
        } else if rawLine.hasPrefix("+++") || rawLine.hasPrefix("---") || rawLine.hasPrefix("diff ") || rawLine.hasPrefix("index ") {
            continue
        } else if rawLine.hasPrefix("+") {
            adds += 1
            result.append(DiffLine(type: .addition, text: String(rawLine.dropFirst()), oldNum: nil, newNum: newLineNum))
            newLineNum += 1
        } else if rawLine.hasPrefix("-") {
            dels += 1
            result.append(DiffLine(type: .deletion, text: String(rawLine.dropFirst()), oldNum: oldLineNum, newNum: nil))
            oldLineNum += 1
        } else if rawLine.hasPrefix(" ") {
            result.append(DiffLine(type: .context, text: String(rawLine.dropFirst()), oldNum: oldLineNum, newNum: newLineNum))
            oldLineNum += 1
            newLineNum += 1
        } else if rawLine.hasPrefix("\\") {
            continue
        }
    }
    return (result, adds, dels)
}
