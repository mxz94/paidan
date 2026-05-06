import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

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

  const safeName = `${Date.now()}-${randomUUID()}${ext}`;
  const outputPath = path.join(uploadDir, safeName);
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  await writeFile(outputPath, inputBuffer);

  return `/uploads/${folder}/${safeName}`;
}
