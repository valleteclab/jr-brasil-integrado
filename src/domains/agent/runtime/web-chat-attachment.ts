import type { TenantScope } from "@/lib/auth/dev-session";
import { transcribeWhisperAudio } from "@/lib/stt/whisper-client";
import { analyzeOpenRouterAttachment } from "@/domains/ai/openrouter-service";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_TEXT_CHARS = 40_000;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TEXT_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/xml",
  "application/xml",
  "application/json"
]);
const TEXT_EXTENSIONS = new Set(["txt", "csv", "xml", "json"]);
const AUDIO_EXTENSIONS = new Set(["webm", "ogg", "oga", "mp3", "wav", "m4a", "aac", "flac"]);

export class WebChatAttachmentError extends Error {}

function cleanFilename(value: string): string {
  return value.replace(/[^\p{L}\p{N}._() -]/gu, "_").slice(0, 120) || "anexo";
}

function extension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function isAudio(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension(file.name));
}

function isText(file: File): boolean {
  return TEXT_TYPES.has(file.type) || TEXT_EXTENSIONS.has(extension(file.name));
}

function imageMimeType(file: File): string | null {
  if (IMAGE_TYPES.has(file.type)) return file.type;
  const ext = extension(file.name);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return null;
}

function displaySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function prepareWebChatAttachment(
  scope: TenantScope,
  input: { file: File; message?: string }
): Promise<{ agentMessage: string; attachmentLabel: string; attachmentKind: "audio" | "file" }> {
  const file = input.file;
  const filename = cleanFilename(file.name);
  const userMessage = input.message?.trim() ?? "";

  if (!file.size) throw new WebChatAttachmentError("O anexo está vazio.");
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new WebChatAttachmentError("O anexo excede o limite de 10 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const attachmentLabel = `${filename} (${displaySize(file.size)})`;

  if (isAudio(file)) {
    if (file.size > MAX_AUDIO_BYTES) {
      throw new WebChatAttachmentError("O áudio excede o limite de 6 MB.");
    }
    let transcript: string;
    try {
      transcript = await transcribeWhisperAudio({
        audio: buffer,
        filename,
        mimeType: file.type || null
      });
    } catch (error) {
      throw new WebChatAttachmentError(
        error instanceof Error ? error.message : "Não foi possível transcrever o áudio."
      );
    }
    return {
      attachmentLabel,
      attachmentKind: "audio",
      agentMessage: [
        userMessage,
        `[Áudio anexado: ${filename}]`,
        `Transcrição: ${transcript}`
      ].filter(Boolean).join("\n\n")
    };
  }

  const imageMime = imageMimeType(file);
  const isPdf = file.type === "application/pdf" || extension(file.name) === "pdf";
  if (imageMime || isPdf) {
    let analysis: string;
    try {
      analysis = await analyzeOpenRouterAttachment(scope, {
        prompt: userMessage || "Analise este anexo e extraia os dados necessários para atender ao usuário.",
        filename,
        mimeType: isPdf ? "application/pdf" : imageMime!,
        buffer
      });
    } catch (error) {
      throw new WebChatAttachmentError(
        error instanceof Error ? error.message : "Não foi possível ler o anexo."
      );
    }
    return {
      attachmentLabel,
      attachmentKind: "file",
      agentMessage: [
        userMessage || "Analise o anexo enviado.",
        `[Conteúdo extraído do anexo ${filename}]`,
        analysis
      ].join("\n\n")
    };
  }

  if (isText(file)) {
    const text = buffer
      .toString("utf8")
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, MAX_TEXT_CHARS);
    if (!text) throw new WebChatAttachmentError("Não foi encontrado texto legível no anexo.");
    return {
      attachmentLabel,
      attachmentKind: "file",
      agentMessage: [
        userMessage || "Analise o arquivo enviado.",
        `[Conteúdo do anexo ${filename}]`,
        text,
        buffer.toString("utf8").length > MAX_TEXT_CHARS
          ? `[Conteúdo limitado aos primeiros ${MAX_TEXT_CHARS.toLocaleString("pt-BR")} caracteres.]`
          : ""
      ].filter(Boolean).join("\n\n")
    };
  }

  throw new WebChatAttachmentError(
    "Formato não suportado. Envie imagem (JPG, PNG ou WebP), PDF, áudio, TXT, CSV, XML ou JSON."
  );
}
