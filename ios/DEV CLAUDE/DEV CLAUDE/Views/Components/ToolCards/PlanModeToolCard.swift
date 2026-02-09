import SwiftUI
import Textual
#if canImport(UIKit)
import UIKit
#endif

/// Tool card for ExitPlanMode — renders the plan as markdown inline with approve/reject buttons.
/// Works both for live permission requests and resumed sessions where the tool is pending.
struct PlanModeToolCard: View {
    let toolCall: ToolCallPart
    @Environment(SessionStore.self) private var sessionStore
    @State private var showPlanSheet = false
    @State private var planRenderMode: SafeMarkdownView.RenderMode
    @State private var showRejectInput = false
    @State private var rejectFeedback = ""

    init(toolCall: ToolCallPart) {
        self.toolCall = toolCall

        let plan = toolCall.args["plan"] as? String ?? ""
        let isLargePlan = Self.isLargeMarkdown(plan)
        _planRenderMode = State(initialValue: isLargePlan ? .plainText : .structuredText)
    }

    /// The plan markdown content from the tool input.
    private var planContent: String {
        if let plan = toolCall.args["plan"] as? String, !plan.isEmpty {
            return plan
        }
        return ""
    }

    /// The allowed prompts (permissions the plan needs).
    private var allowedPrompts: [[String: Any]] {
        toolCall.args["allowedPrompts"] as? [[String: Any]] ?? []
    }

    /// Whether the plan is waiting for user approval.
    private var isPending: Bool {
        toolCall.result == nil
    }

    /// Whether there's a live permission request waiting on the server.
    private var hasLivePermission: Bool {
        sessionStore.pendingPermission?.toolUseId == toolCall.id
    }

    private var planPreview: String {
        guard !planContent.isEmpty else { return "" }
        let lines = planContent.split(separator: "\n", omittingEmptySubsequences: false)
        let preview = lines.prefix(4).joined(separator: "\n")
        return lines.count > 4 ? preview + "\n…" : preview
    }

    private static func isLargeMarkdown(_ text: String) -> Bool {
        // Heuristic: large docs are expensive to render as StructuredText (many SwiftUI subviews).
        if text.count > 6000 { return true }
        let lineCount = text.reduce(into: 1) { count, ch in if ch == "\n" { count += 1 } }
        return lineCount > 180
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack(spacing: 6) {
                Image(systemName: "doc.text.magnifyingglass")
                    .font(.caption)
                    .foregroundStyle(.blue)
                Text("Plan for Approval")
                    .font(.caption.bold())
                Spacer()
                statusBadge
            }

            // Plan content (open in sheet to avoid rendering huge markdown inline in the message thread)
            if !planContent.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Button {
                            showPlanSheet = true
                        } label: {
                            Text("View plan")
                                .font(.caption2.bold())
                        }
                        .buttonStyle(.borderless)

                        Spacer()

                        Button {
                            #if canImport(UIKit)
                            UIPasteboard.general.string = planContent
                            #endif
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Copy plan")
                    }

                    if !planPreview.isEmpty {
                        Text(planPreview)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(6)
                    }
                }
                .sheet(isPresented: $showPlanSheet) {
                    PlanDetailSheet(plan: planContent, renderMode: $planRenderMode)
                }
            }

            // Allowed prompts
            if !allowedPrompts.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Requested permissions:")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    ForEach(Array(allowedPrompts.enumerated()), id: \.offset) { _, prompt in
                        HStack(spacing: 4) {
                            Image(systemName: "terminal")
                                .font(.caption2)
                                .foregroundStyle(.green)
                            Text(prompt["prompt"] as? String ?? "")
                                .font(.caption2)
                        }
                    }
                }
                .padding(8)
                .background(Color(.systemGray5))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            // Approve / Reject buttons (only when pending)
            if isPending {
                if showRejectInput {
                    VStack(spacing: 8) {
                        TextField("Additional instructions...", text: $rejectFeedback, axis: .vertical)
                            .font(.caption)
                            .padding(8)
                            .background(Color(.systemGray5))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .lineLimit(3...6)

                        HStack(spacing: 12) {
                            Button(action: rejectPlan) {
                                Text("Send")
                                    .font(.caption.bold())
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                                    .background(.red)
                                    .foregroundStyle(.white)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .contentShape(Rectangle())

                            Button(action: { showRejectInput = false }) {
                                Text("Cancel")
                                    .font(.caption.bold())
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                                    .background(Color(.systemGray5))
                                    .foregroundStyle(.primary)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .contentShape(Rectangle())
                        }
                    }
                } else {
                    HStack(spacing: 12) {
                        Button(action: approvePlan) {
                            HStack(spacing: 4) {
                                Image(systemName: "checkmark")
                                Text("Approve")
                            }
                            .font(.caption.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(.green)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .contentShape(Rectangle())

                        Button(action: { showRejectInput = true }) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.uturn.left")
                                Text("Reject")
                            }
                            .font(.caption.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(Color(.systemGray5))
                            .foregroundStyle(.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .contentShape(Rectangle())
                    }
                }
            }

            // Show result if already responded
            if let result = toolCall.result, !result.isEmpty {
                Text(result)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func approvePlan() {
        if hasLivePermission {
            // Live session — respond to the pending permission request
            sessionStore.respondPermission(toolUseId: toolCall.id, allow: true)
        } else {
            // Resumed session — send a user message to approve
            sessionStore.sendMessage("Yes, approve the plan and proceed with implementation.")
        }
    }

    private func rejectPlan() {
        let message = rejectFeedback.trimmingCharacters(in: .whitespacesAndNewlines)
        if hasLivePermission {
            // Live session — deny the permission request
            sessionStore.respondPermission(
                toolUseId: toolCall.id,
                allow: false,
                denyMessage: message.isEmpty ? "User rejected the plan" : message
            )
        } else {
            // Resumed session — send rejection as a user message
            let feedback = message.isEmpty ? "I'd like changes to this plan." : message
            sessionStore.sendMessage(feedback)
        }
        showRejectInput = false
        rejectFeedback = ""
    }

    @ViewBuilder
    private var statusBadge: some View {
        if isPending {
            Text("Awaiting approval")
                .font(.caption2)
                .foregroundStyle(.orange)
        } else if toolCall.result != nil {
            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
        } else {
            ProgressView().controlSize(.mini)
        }
    }
}

private struct PlanDetailSheet: View {
    let plan: String
    @Binding var renderMode: SafeMarkdownView.RenderMode
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Picker("Render", selection: $renderMode) {
                        Text("Plain").tag(SafeMarkdownView.RenderMode.plainText)
                        Text("Markdown").tag(SafeMarkdownView.RenderMode.structuredText)
                    }
                    .pickerStyle(.segmented)

                    SafeMarkdownView(
                        text: plan,
                        enableSelection: false,
                        renderMode: renderMode
                    )
                }
                .padding()
            }
            .navigationTitle("Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Copy") {
                        #if canImport(UIKit)
                        UIPasteboard.general.string = plan
                        #endif
                    }
                }
            }
        }
    }
}
