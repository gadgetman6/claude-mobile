import { useState } from "react";
import type { PermissionRequest } from "../types";

export function PermissionPrompt({
  request,
  onRespond,
  onRespondQuestion,
}: {
  request: PermissionRequest;
  onRespond: (toolUseId: string, allow: boolean, denyMessage?: string) => void;
  onRespondQuestion: (
    toolUseId: string,
    questions: unknown[],
    answers: Record<string, string>
  ) => void;
}) {
  // AskUserQuestion handling
  if (request.toolName === "AskUserQuestion") {
    return (
      <AskQuestionPrompt
        request={request}
        onRespond={onRespondQuestion}
      />
    );
  }

  return (
    <div className="permission-overlay">
      <div className="permission-card">
        <div className="permission-title">
          Allow <span className="permission-tool">{request.toolName}</span>?
        </div>

        {request.decisionReason && (
          <div className="permission-reason">{request.decisionReason}</div>
        )}

        <div className="permission-detail">
          {request.toolName === "Bash"
            ? `$ ${(request.input as any).command ?? ""}`
            : request.toolName === "Edit"
            ? `Edit: ${(request.input as any).file_path ?? ""}`
            : request.toolName === "Write"
            ? `Write: ${(request.input as any).file_path ?? ""}`
            : JSON.stringify(request.input, null, 2)}
        </div>

        <div className="permission-actions">
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => onRespond(request.toolUseId, true)}
          >
            Allow
          </button>
          <button
            className="btn btn-danger"
            style={{ flex: 1 }}
            onClick={() => onRespond(request.toolUseId, false, "User denied")}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function AskQuestionPrompt({
  request,
  onRespond,
}: {
  request: PermissionRequest;
  onRespond: (
    toolUseId: string,
    questions: unknown[],
    answers: Record<string, string>
  ) => void;
}) {
  const questions = ((request.input as any).questions ?? []) as Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});

  const handleSelect = (question: string, label: string, multiSelect: boolean) => {
    setAnswers((prev) => {
      if (multiSelect) {
        const current = prev[question] ?? "";
        const labels = current ? current.split(", ") : [];
        const idx = labels.indexOf(label);
        if (idx >= 0) {
          labels.splice(idx, 1);
        } else {
          labels.push(label);
        }
        return { ...prev, [question]: labels.join(", ") };
      }
      return { ...prev, [question]: label };
    });
  };

  const handleSubmit = () => {
    const finalAnswers: Record<string, string> = {};
    for (const q of questions) {
      const ans = answers[q.question];
      if (ans === "__other__") {
        finalAnswers[q.question] = otherTexts[q.question] ?? "";
      } else {
        finalAnswers[q.question] = ans ?? q.options[0]?.label ?? "";
      }
    }
    onRespond(request.toolUseId, questions, finalAnswers);
  };

  return (
    <div className="permission-overlay">
      <div className="question-card">
        {questions.map((q) => (
          <div key={q.question} style={{ marginBottom: 12 }}>
            <div className="question-text">
              <strong>{q.header}:</strong> {q.question}
            </div>
            <div className="question-options">
              {q.options.map((opt) => {
                const isSelected = q.multiSelect
                  ? (answers[q.question] ?? "").split(", ").includes(opt.label)
                  : answers[q.question] === opt.label;

                return (
                  <div
                    key={opt.label}
                    className={`question-option ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelect(q.question, opt.label, q.multiSelect)}
                  >
                    <div>
                      <div className="question-option-label">{opt.label}</div>
                      <div className="question-option-desc">{opt.description}</div>
                    </div>
                  </div>
                );
              })}
              <div
                className={`question-option ${answers[q.question] === "__other__" ? "selected" : ""}`}
                onClick={() => setAnswers((p) => ({ ...p, [q.question]: "__other__" }))}
              >
                <div className="question-option-label">Other</div>
              </div>
            </div>
            {answers[q.question] === "__other__" && (
              <input
                className="question-other-input"
                placeholder="Type your answer..."
                value={otherTexts[q.question] ?? ""}
                onChange={(e) =>
                  setOtherTexts((p) => ({ ...p, [q.question]: e.target.value }))
                }
              />
            )}
          </div>
        ))}
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleSubmit}>
          Submit
        </button>
      </div>
    </div>
  );
}
