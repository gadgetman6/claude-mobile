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

            HStack(alignment: .bottom, spacing: 8) {
                // Photo picker
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Image(systemName: "paperclip")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .onChange(of: selectedPhoto) { _, newItem in
                    Task { await loadImage(from: newItem) }
                }

                // Text input
                TextField("Send a message...", text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    .focused($isFocused)
                    .onSubmit { send() }

                // Send or Cancel button
                if sessionStore.isStreaming {
                    Button {
                        sessionStore.interrupt()
                    } label: {
                        Image(systemName: "stop.fill")
                            .font(.caption)
                            .foregroundStyle(.white)
                            .frame(width: 32, height: 32)
                            .background(.red)
                            .clipShape(Circle())
                    }
                } else {
                    Button {
                        send()
                    } label: {
                        Image(systemName: "arrow.up")
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .frame(width: 32, height: 32)
                            .background(canSend ? Color.accentColor : Color.gray)
                            .clipShape(Circle())
                    }
                    .disabled(!canSend)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(.bar)
    }

    private var canSend: Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && sessionStore.connectionState == .connected
    }

    private func send() {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if let imageData = attachedImageData {
            // Send text + image
            let base64 = imageData.base64EncodedString()
            let blocks: [[String: Any]] = [
                ["type": "text", "text": trimmed],
                ["type": "image", "source": [
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64,
                ]],
            ]
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
