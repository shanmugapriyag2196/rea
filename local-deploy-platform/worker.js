"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const zlib = require("zlib");
const { parentPort, workerData } = require("worker_threads");

// Build worker: runs in isolated thread for safe ZIP extraction
// This prevents path traversal and limits resource usage

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
const MAX_FILES = 10000;
const MAX_TOTAL_SIZE = 1024 * 1024 * 1024; // 1 GB

function isSafeZipEntry(entryName) {
  const normalized = path.normalize(entryName);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return false;
  }
  const parts = normalized.split(path.sep);
  for (const part of parts) {
    if (part === "..") return false;
  }
  return true;
}

function parseZipBuffer(buffer) {
  const entries = [];
  let offset = 0;
  const maxLen = buffer.length;

  while (offset < maxLen - 4) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > maxLen) break;

    const fileName = buffer.slice(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    entries.push({
      name: fileName,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      dataStart,
      dataEnd,
    });

    offset = dataEnd;
  }

  return entries;
}

function extractZip(zipBuffer, destDir) {
  const entries = parseZipBuffer(zipBuffer);
  const extracted = [];
  let totalSize = 0;
  let fileCount = 0;

  if (entries.length > MAX_FILES) {
    throw new Error(`Too many files in archive: ${entries.length} (max ${MAX_FILES})`);
  }

  for (const entry of entries) {
    if (!isSafeZipEntry(entry.name)) {
      throw new Error(`Unsafe ZIP entry detected: ${entry.name}`);
    }

    if (entry.name.endsWith("/") || entry.name.endsWith("\\")) {
      continue;
    }

    const targetPath = path.join(destDir, entry.name);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (entry.compressionMethod === 0) {
      fs.writeFileSync(targetPath, zipBuffer.slice(entry.dataStart, entry.dataEnd));
    } else if (entry.compressionMethod === 8) {
      const compressed = zipBuffer.slice(entry.dataStart, entry.dataEnd);
      try {
        const decompressed = zlib.inflateRawSync(compressed);
        fs.writeFileSync(targetPath, decompressed);
      } catch (err) {
        throw new Error(`Failed to decompress entry ${entry.name}: ${err.message}`);
      }
    } else {
      throw new Error(`Unsupported compression method ${entry.compressionMethod} for ${entry.name}`);
    }

    const stat = fs.statSync(targetPath);
    totalSize += stat.size;
    fileCount++;

    if (totalSize > MAX_TOTAL_SIZE) {
      throw new Error(`Archive exceeds maximum total size of ${MAX_TOTAL_SIZE} bytes`);
    }

    if (fileCount > MAX_FILES) {
      throw new Error(`Too many files: ${fileCount} (max ${MAX_FILES})`);
    }

    extracted.push({ name: entry.name, size: stat.size });
  }

  return { extracted, fileCount, totalSize };
}

// Listen for messages from parent
parentPort.on("message", (msg) => {
  const { zipPath, destDir, requestId } = msg;

  try {
    // Validate zip path is within allowed directory
    const resolvedZip = path.resolve(zipPath);
    const tmpDir = path.resolve(__dirname, "logs", "tmp-uploads");
    if (!resolvedZip.startsWith(tmpDir + path.sep) && resolvedZip !== tmpDir) {
      parentPort.postMessage({
        requestId,
        success: false,
        error: "ZIP file path outside allowed directory",
      });
      return;
    }

    if (!fs.existsSync(zipPath)) {
      parentPort.postMessage({
        requestId,
        success: false,
        error: "ZIP file not found",
      });
      return;
    }

    const zipBuffer = fs.readFileSync(zipPath);
    const { extracted, fileCount, totalSize } = extractZip(zipBuffer, destDir);

    // Clean up temp file
    try { fs.unlinkSync(zipPath); } catch (e) {}

    parentPort.postMessage({
      requestId,
      success: true,
      extracted,
      fileCount,
      totalSize,
    });
  } catch (err) {
    // Clean up on failure
    try { fs.unlinkSync(zipPath); } catch (e) {}
    try { fs.rmSync(destDir, { recursive: true, force: true }); } catch (e) {}

    parentPort.postMessage({
      requestId,
      success: false,
      error: err.message,
    });
  }
});

// Notify parent that worker is ready
parentPort.postMessage({ type: "ready" });
