export const AUDIO_FILE_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm", ".amr", ".3gp"] as const;

export function isLikelyAudioFileName(name: string) {
  const lower = String(name || "").toLowerCase();
  return AUDIO_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isLikelyAudioUpload(file: Pick<File, "name" | "type">) {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("audio/")) {
    return true;
  }
  return isLikelyAudioFileName(file.name || "");
}

export function base64ToFile(base64: string, fileName: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType || "audio/mpeg" });
}

export function formatAudioFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
