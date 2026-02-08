import SwiftUI
import PhotosUI

/// Message input bar with send/cancel and image attachment.
struct MessageComposerView: View {
    @Environment(SessionStore.self) private var sessionStore
    @State private var text = ""
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var attachedImageData: Data?
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            // Attached image preview
            if let imageData = attachedImageData {
                attachmentPreview(imageData)
            }

            // Full-width input with buttons inside
            HStack(alignment: .bottom, spacing: 0) {
                // Attachment button (inside, left)
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Image(systemName: "paperclip")
                        .font(.system(size: 18))
                        .foregroundStyle(.secondary)
                        .frame(width: 36, height: 36)
                }
                .onChange(of: selectedPhoto) { _, newItem in
                    Task { await loadImage(from: newItem) }
                }
                .padding(.leading, 4)

                // Text input
                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("Send a message...")
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 10)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $text)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 36, maxHeight: 160)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, 2)
                        .focused($isFocused)
                        .accessibilityIdentifier("messageInput")
                }

                // Send or Cancel button (inside, right)
                if sessionStore.isStreaming {
                    Button {
                        sessionStore.interrupt()
                    } label: {
                        Image(systemName: "stop.fill")
                            .font(.caption)
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(.red)
                            .clipShape(Circle())
                    }
                    .padding(.trailing, 4)
                    .padding(.bottom, 3)
                } else {
                    Button {
                        send()
                    } label: {
                        Image(systemName: "arrow.up")
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(canSend ? Color.accentColor : Color.gray.opacity(0.4))
                            .clipShape(Circle())
                    }
                    .disabled(!canSend)
                    .padding(.trailing, 4)
                    .padding(.bottom, 3)
                    .accessibilityIdentifier("sendButton")
                    .accessibilityLabel("Send")
                }
            }
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
        }
        .background(.bar)
    }

    private var canSend: Bool {
        let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasImage = attachedImageData != nil
        return (hasText || hasImage) && sessionStore.connectionState == .connected
    }

    private func send() {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasText = !trimmed.isEmpty
        let hasImage = attachedImageData != nil

        guard hasText || hasImage else { return }

        if let imageData = attachedImageData {
            // Send image with optional text
            let base64 = imageData.base64EncodedString()
            var blocks: [[String: Any]] = []
            if hasText {
                blocks.append(["type": "text", "text": trimmed])
            }
            blocks.append(["type": "image", "source": [
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64,
            ]])
            sessionStore.sendContentBlocks(blocks)
            attachedImageData = nil
            selectedPhoto = nil
        } else {
            sessionStore.sendMessage(trimmed)
        }

        text = ""
    }

    private func loadImage(from item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }

        // Compress image
        guard let uiImage = UIImage(data: data) else { return }
        let maxDim: CGFloat = 1568
        var size = uiImage.size
        if size.width > maxDim || size.height > maxDim {
            let ratio = min(maxDim / size.width, maxDim / size.height)
            size = CGSize(width: size.width * ratio, height: size.height * ratio)
        }
        let renderer = UIGraphicsImageRenderer(size: size)
        let compressed = renderer.jpegData(withCompressionQuality: 0.85) { ctx in
            uiImage.draw(in: CGRect(origin: .zero, size: size))
        }
        await MainActor.run {
            attachedImageData = compressed
        }
    }

    private func attachmentPreview(_ data: Data) -> some View {
        HStack {
            if let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 80)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            Spacer()
            Button {
                attachedImageData = nil
                selectedPhoto = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }
}
