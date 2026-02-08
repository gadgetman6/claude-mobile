import SwiftUI

/// Overlay for permission requests and AskUserQuestion prompts.
struct PermissionOverlay: View {
    @Environment(SessionStore.self) private var sessionStore

    var body: some View {
        if let perm = sessionStore.pendingPermission {
            ZStack {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()

                if perm.toolName == "AskUserQuestion" {
                    AskQuestionCard(permission: perm)
                } else {
                    PermissionCard(permission: perm)
                }
            }
            .transition(.opacity)
            .onAppear {
                // Haptic feedback when permission is requested
                let impact = UIImpactFeedbackGenerator(style: .heavy)
                impact.impactOccurred()
            }
        }
    }
}

// MARK: - Standard Permission Card

private struct PermissionCard: View {
    let permission: PermissionRequest
    @Environment(SessionStore.self) private var sessionStore

    var body: some View {
        VStack(spacing: 16) {
            Text("Allow **\(permission.toolName)**?")
                .font(.headline)

            if let reason = permission.decisionReason {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            detailText
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .lineLimit(8)

            HStack(spacing: 12) {
                Button {
                    sessionStore.respondPermission(toolUseId: permission.toolUseId, allow: true)
                } label: {
                    Text("Allow")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)

                Button(role: .destructive) {
                    sessionStore.respondPermission(toolUseId: permission.toolUseId, allow: false, denyMessage: "User denied")
                } label: {
                    Text("Deny")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(20)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(24)
    }

    @ViewBuilder
    private var detailText: some View {
        switch permission.toolName {
        case "Bash":
            Text("$ \(permission.input["command"] as? String ?? "")")
        case "Edit":
            Text("Edit: \(permission.input["file_path"] as? String ?? "")")
        case "Write":
            Text("Write: \(permission.input["file_path"] as? String ?? "")")
        default:
            let json = (try? JSONSerialization.data(withJSONObject: permission.input, options: .prettyPrinted))
                .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
            Text(json)
        }
    }
}

// MARK: - Ask Question Card

private struct AskQuestionCard: View {
    let permission: PermissionRequest
    @Environment(SessionStore.self) private var sessionStore
    @State private var answers: [String: String] = [:]
    @State private var otherTexts: [String: String] = [:]

    private var questions: [[String: Any]] {
        permission.input["questions"] as? [[String: Any]] ?? []
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ForEach(Array(questions.enumerated()), id: \.offset) { _, q in
                    questionView(q)
                }

                Button {
                    submit()
                } label: {
                    Text("Submit")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(20)
        }
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(24)
    }

    private func questionView(_ q: [String: Any]) -> some View {
        let header = q["header"] as? String ?? ""
        let question = q["question"] as? String ?? ""
        let options = q["options"] as? [[String: String]] ?? []
        let isMulti = q["multiSelect"] as? Bool ?? false

        return VStack(alignment: .leading, spacing: 8) {
            Text("**\(header):** \(question)")
                .font(.subheadline)

            ForEach(options, id: \.self) { opt in
                let label = opt["label"] ?? ""
                let desc = opt["description"] ?? ""
                let isSelected = answers[question]?.contains(label) ?? false

                Button {
                    select(question: question, label: label, multi: isMulti)
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(label).font(.subheadline.bold())
                            if !desc.isEmpty { Text(desc).font(.caption).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        if isSelected {
                            Image(systemName: "checkmark").foregroundStyle(.blue)
                        }
                    }
                    .padding(10)
                    .background(isSelected ? Color.blue.opacity(0.1) : Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func select(question: String, label: String, multi: Bool) {
        if multi {
            var current = answers[question] ?? ""
            let labels = current.isEmpty ? [] : current.components(separatedBy: ", ")
            if labels.contains(label) {
                let filtered = labels.filter { $0 != label }
                current = filtered.joined(separator: ", ")
            } else {
                current = (labels + [label]).joined(separator: ", ")
            }
            answers[question] = current
        } else {
            answers[question] = label
        }
    }

    private func submit() {
        sessionStore.respondAskQuestion(
            toolUseId: permission.toolUseId,
            questions: questions,
            answers: answers
        )
    }
}
