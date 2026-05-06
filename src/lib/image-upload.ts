import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export async function saveCompressedImage(file: File, folder = "orders") {
  if (!file || file.size === 0) {
    return undefined;
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return "__TOO_LARGE__";
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(uploadDir, { recursive: true });

  const safeName = `${Date.now()}-${randomUUID()}.webp`;
  const outputPath = path.join(uploadDir, safeName);
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  await sharp(inputBuffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(outputPath);

  return `/uploads/${folder}/${safeName}`;
}

export async function saveUploadedFile(file: File, folder = "orders") {
  if (!file || file.size === 0) {
    return undefined;
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return "__TOO_LARGE__";
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(uploadDir, { recursive: true });

  const ext = (() => {
    const raw = file.name || "";
    const dot = raw.lastIndexOf(".");
    const fromName = dot > -1 ? raw.slice(dot).toLowerCase() : "";
    const safeFromName = /^[.][a-z0-9]+$/.test(fromName) ? fromName : "";
    const fromMime = (() => {
      const type = String(file.type || "").toLowerCase();
      if (type.includes("mpeg")) return ".mp3";
      if (type.includes("mp4") || type.includes("m4a")) return ".m4a";
      if (type.includes("wav")) return ".wav";
      if (type.includes("aac")) return ".aac";
      if (type.includes("ogg")) return ".ogg";
      if (type.includes("webm")) return ".webm";
      if (type.includes("amr")) return ".amr";
      if (type.includes("3gpp")) return ".3gp";
      return "";
    })();
    return safeFromName || fromMime;
  })();

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const isAudio =
    String(file.type || "").toLowerCase().startsWith("audio/") ||
    [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm", ".amr", ".3gp"].includes(ext);

  // Audio is transcoded to mp3 to maximize browser playback compatibility (especially for .amr).
  if (isAudio) {
    const tempName = `${Date.now()}-${randomUUID()}${ext || ".bin"}`;
    const tempPath = path.join(uploadDir, tempName);
    const mp3Name = `${Date.now()}-${randomUUID()}.mp3`;
    const mp3Path = path.join(uploadDir, mp3Name);

    await writeFile(tempPath, inputBuffer);
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        tempPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ar",
        "44100",
        "-ac",
        "1",
        mp3Path,
      ]);
      await unlink(tempPath).catch(() => undefined);
      return `/uploads/${folder}/${mp3Name}`;
    } catch {
      await unlink(tempPath).catch(() => undefined);
      // Fallback to original file when ffmpeg is unavailable.
    }
  }

  const safeName = `${Date.now()}-${randomUUID()}${ext}`;
  const outputPath = path.join(uploadDir, safeName);
  await writeFile(outputPath, inputBuffer);
  return `/uploads/${folder}/${safeName}`;
}
