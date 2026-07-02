import fs from 'node:fs'
import path from 'node:path'

const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.avi',
  '.bin',
  '.bmp',
  '.class',
  '.dll',
  '.dmg',
  '.doc',
  '.docx',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.psd',
  '.pyc',
  '.sqlite',
  '.tar',
  '.tgz',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.xls',
  '.xlsx',
  '.zip',
])

export type WorkspaceEntryType = 'file' | 'directory'

export interface WorkspaceFileState {
  path: string
  exists: boolean
  entryType: WorkspaceEntryType | null
  sizeBytes: number | null
  extension: string | null
  binary: boolean | null
  createdAt: string | null
  modifiedAt: string | null
}

export function binaryExtension(extension: string | null): boolean {
  return Boolean(extension && BINARY_EXTENSIONS.has(extension.toLowerCase()))
}

export function bufferLooksBinary(buffer: Buffer): boolean {
  if (buffer.byteLength === 0) return false
  let suspicious = 0
  const limit = Math.min(buffer.byteLength, 512)
  for (let index = 0; index < limit; index += 1) {
    const value = buffer[index]
    if (value === 0) return true
    const isCommonWhitespace = value === 9 || value === 10 || value === 13
    const isPrintableAscii = value >= 32 && value <= 126
    if (!isCommonWhitespace && !isPrintableAscii) suspicious += 1
  }
  return suspicious / limit > 0.3
}

function readFileProbe(absolutePath: string, maxBytes = 512): Buffer {
  const descriptor = fs.openSync(absolutePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(maxBytes)
    const bytesRead = fs.readSync(descriptor, buffer, 0, maxBytes, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    fs.closeSync(descriptor)
  }
}

export function summarizeWorkspaceEntry(
  relativePath: string,
  absolutePath: string,
): WorkspaceFileState {
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      exists: false,
      entryType: null,
      sizeBytes: null,
      extension: null,
      binary: null,
      createdAt: null,
      modifiedAt: null,
    }
  }

  const stats = fs.statSync(absolutePath)
  const entryType: WorkspaceEntryType = stats.isDirectory() ? 'directory' : 'file'
  const extension =
    entryType === 'file' ? path.extname(absolutePath).toLowerCase() || null : null
  const binary =
    entryType === 'file'
      ? binaryExtension(extension) ||
        (stats.size > 0 ? bufferLooksBinary(readFileProbe(absolutePath)) : false)
      : null

  return {
    path: relativePath,
    exists: true,
    entryType,
    sizeBytes: stats.size,
    extension,
    binary,
    createdAt: new Date(stats.birthtimeMs || stats.ctimeMs).toISOString(),
    modifiedAt: new Date(stats.mtimeMs).toISOString(),
  }
}
