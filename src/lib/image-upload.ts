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
