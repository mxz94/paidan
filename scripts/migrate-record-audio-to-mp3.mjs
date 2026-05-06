import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

function isLegacyAudioUrl(url) {
  const value = String(url || "").toLowerCase();
  return value.endsWith(".amr") || value.endsWith(".3gp");
}

function toAbsolutePublicPath(urlPath) {
  const clean = String(urlPath || "").replace(/^\/+/, "");
  return path.join(process.cwd(), "public", clean);
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await prisma.dispatchOrderRecord.findMany({
    where: {
      photoUrl: {
        not: null,
      },
    },
    select: {
      id: true,
      photoUrl: true,
    },
    orderBy: { id: "asc" },
  });

  const targets = rows.filter((row) => isLegacyAudioUrl(row.photoUrl));
  console.log(`[audio-migrate] scanned=${rows.length} targets=${targets.length} dryRun=${dryRun ? "yes" : "no"}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const row of targets) {
    const oldUrl = String(row.photoUrl || "");
    const srcAbs = toAbsolutePublicPath(oldUrl);
    const srcExists = await fileExists(srcAbs);
    if (!srcExists) {
      skipped += 1;
      failures.push({ id: row.id, reason: "missing_source", src: srcAbs });
      continue;
    }

    const folder = path.posix.dirname(oldUrl);
    const outName = `${Date.now()}-${randomUUID()}.mp3`;
    const outUrl = `${folder}/${outName}`.replace(/\/{2,}/g, "/");
    const outAbs = toAbsolutePublicPath(outUrl);

    if (dryRun) {
      ok += 1;
      continue;
    }

    await ensureDir(outAbs);
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        srcAbs,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ar",
        "44100",
        "-ac",
        "1",
        outAbs,
      ]);

      await prisma.dispatchOrderRecord.update({
        where: { id: row.id },
        data: { photoUrl: outUrl },
      });
      ok += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        id: row.id,
        reason: "ffmpeg_or_update_failed",
        src: srcAbs,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`[audio-migrate] done ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failures.length > 0) {
    const reportPath = path.join(process.cwd(), "audio-migrate-failures.json");
    await fs.writeFile(reportPath, JSON.stringify(failures, null, 2), "utf8");
    console.log(`[audio-migrate] failures saved: ${reportPath}`);
  }
}

main()
  .catch((error) => {
    console.error("[audio-migrate] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

