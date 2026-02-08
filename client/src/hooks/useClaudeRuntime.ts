import { useExternalStoreRuntime, SimpleImageAttachmentAdapter } from "@assistant-ui/react";
import type { ThreadMessageLike } from "@assistant-ui/react";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

type ClaudeRuntimeOptions = {
  messages: ThreadMessageLike[];
  isRunning: boolean;
  onNew: (content: string | ContentPart[]) => void;
  onCancel: () => void;
};

async function compressImage(file: File, maxDim = 1568, quality = 0.85): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      // Scale down if larger than maxDim
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mediaType: "image/jpeg" });
    };
    img.src = URL.createObjectURL(file);
  });
}

const imageAttachmentAdapter = new SimpleImageAttachmentAdapter();

export function useClaudeRuntime({ messages, isRunning, onNew, onCancel }: ClaudeRuntimeOptions) {
  return useExternalStoreRuntime({
    messages,
    isRunning,
    convertMessage: (msg) => msg,
    adapters: {
      attachments: imageAttachmentAdapter,
    },
    onNew: async (message) => {
      if (message.role !== "user") return;

      const textParts = message.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");

      // Collect image parts from both content and attachments
      const imageParts: { image: string | File }[] = [];

      // Check content for inline images
      for (const p of message.content) {
        if (p.type === "image") {
          imageParts.push(p as unknown as { image: string | File });
        }
      }

      // Check attachments (SimpleImageAttachmentAdapter puts images here, not in content)
      const attachments = (message as unknown as { attachments?: { type: string; content?: { type: string; image?: string }[] }[] }).attachments;
      if (attachments) {
        for (const att of attachments) {
          if (att.type === "image" && att.content) {
            for (const c of att.content) {
              if (c.type === "image" && c.image) {
                imageParts.push({ image: c.image });
              }
            }
          }
        }
      }

      if (imageParts.length === 0) {
        if (textParts) onNew(textParts);
        return;
      }

      // Build content array with text + images
      const contentArray: ContentPart[] = [];
      if (textParts) {
        contentArray.push({ type: "text", text: textParts });
      }
      for (const part of imageParts) {
        const imageVal = part.image;
        let base64: string;
        let mediaType: string;
        if (imageVal instanceof File) {
          const compressed = await compressImage(imageVal);
          base64 = compressed.base64;
          mediaType = compressed.mediaType;
        } else if (typeof imageVal === "string" && imageVal.startsWith("data:")) {
          const match = imageVal.match(/^data:(.*?);base64,(.*)$/);
          if (match) {
            mediaType = match[1];
            base64 = match[2];
          } else continue;
        } else if (typeof imageVal === "string") {
          continue;
        } else continue;

        contentArray.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        });
      }
      onNew(contentArray.length === 1 && contentArray[0].type === "text" ? textParts : contentArray);
    },
    onCancel: async () => {
      onCancel();
    },
  });
}
