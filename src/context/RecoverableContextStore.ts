import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  ContextBlockKind,
  ContextRehydrateSpan,
  RecoverableContextRecord,
  RecoverableContextStore,
  RehydratedContext,
} from './types.js'

function bytesFromContent(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content)
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function stableId(input: {
  blockId: string
  sourceKind: ContextBlockKind
  sha256: string
}): string {
  const suffix = createHash('sha256')
    .update(`${input.blockId}:${input.sourceKind}`)
    .digest('hex')
    .slice(0, 10)
  return `ctx_${input.sha256.slice(0, 16)}_${suffix}`
}

function safeRecoverableId(value: string): boolean {
  return /^ctx_[a-f0-9]{16}_[a-f0-9]{10}$/.test(value)
}

function lineSpan(bytes: Uint8Array, span: ContextRehydrateSpan): Uint8Array | null {
  if (span.startLine === undefined && span.endLine === undefined) return null
  const text = Buffer.from(bytes).toString('utf8')
  const lines = text.split(/\r?\n/)
  const start = Math.max(0, (span.startLine ?? 1) - 1)
  const end = Math.min(lines.length, span.endLine ?? lines.length)
  return Buffer.from(lines.slice(start, end).join('\n'), 'utf8')
}

function byteSpan(bytes: Uint8Array, span: ContextRehydrateSpan): Uint8Array {
  const start = Math.max(0, Math.floor(span.startByte ?? 0))
  const end = Math.min(bytes.byteLength, Math.floor(span.endByte ?? bytes.byteLength))
  return bytes.slice(start, Math.max(start, end))
}

function applySpan(bytes: Uint8Array, span: ContextRehydrateSpan | undefined): Uint8Array {
  if (!span) return bytes
  const byLine = lineSpan(bytes, span)
  if (byLine) return byLine
  return byteSpan(bytes, span)
}

function asRehydrated(
  record: RecoverableContextRecord,
  span: ContextRehydrateSpan | undefined,
): RehydratedContext {
  const maxBytes = Math.max(1, Math.floor(span?.maxBytes ?? 64 * 1024))
  const selected = applySpan(record.bytes, span)
  const truncated = selected.byteLength > maxBytes
  const returned = selected.slice(0, maxBytes)
  const base = {
    recoverableId: record.recoverableId,
    sha256: record.sha256,
    byteLength: record.byteLength,
    returnedBytes: returned.byteLength,
    truncated,
    mediaType: record.mediaType,
  }
  if (record.mediaType.startsWith('text/') || record.mediaType === 'application/json') {
    return {
      ...base,
      text: Buffer.from(returned).toString('utf8'),
    }
  }
  return {
    ...base,
    base64: Buffer.from(returned).toString('base64'),
  }
}

export class InMemoryRecoverableContextStore implements RecoverableContextStore {
  private readonly records = new Map<string, RecoverableContextRecord>()

  put(input: {
    blockId: string
    sourceKind: ContextBlockKind
    content: string | Uint8Array
    mediaType?: string
    metadata?: Record<string, unknown>
  }): RecoverableContextRecord {
    const bytes = bytesFromContent(input.content)
    const digest = sha256(bytes)
    const recoverableId = stableId({
      blockId: input.blockId,
      sourceKind: input.sourceKind,
      sha256: digest,
    })
    const existing = this.records.get(recoverableId)
    if (existing) return existing

    const record: RecoverableContextRecord = {
      recoverableId,
      blockId: input.blockId,
      sourceKind: input.sourceKind,
      sha256: digest,
      bytes,
      byteLength: bytes.byteLength,
      mediaType: input.mediaType ?? (typeof input.content === 'string' ? 'text/plain' : 'application/octet-stream'),
      createdAt: new Date().toISOString(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }
    this.records.set(recoverableId, record)
    return record
  }

  get(recoverableId: string): RecoverableContextRecord | null {
    return this.records.get(recoverableId) ?? null
  }

  rehydrate(recoverableId: string, span?: ContextRehydrateSpan): RehydratedContext {
    const record = this.get(recoverableId)
    if (!record) throw new Error(`Unknown recoverable context id: ${recoverableId}`)
    return asRehydrated(record, span)
  }
}

/**
 * Durable local implementation for context that may need to be rehydrated by a
 * later process or worker. Content is addressed by the same deterministic id as
 * the in-memory store; metadata deliberately contains no inline bytes.
 */
export class FilesystemRecoverableContextStore implements RecoverableContextStore {
  constructor(private readonly rootPath: string) {}

  put(input: {
    blockId: string
    sourceKind: ContextBlockKind
    content: string | Uint8Array
    mediaType?: string
    metadata?: Record<string, unknown>
  }): RecoverableContextRecord {
    const bytes = bytesFromContent(input.content)
    const digest = sha256(bytes)
    const recoverableId = stableId({
      blockId: input.blockId,
      sourceKind: input.sourceKind,
      sha256: digest,
    })
    const existing = this.get(recoverableId)
    if (existing) return existing

    const record: RecoverableContextRecord = {
      recoverableId,
      blockId: input.blockId,
      sourceKind: input.sourceKind,
      sha256: digest,
      bytes,
      byteLength: bytes.byteLength,
      mediaType: input.mediaType ?? (typeof input.content === 'string' ? 'text/plain' : 'application/octet-stream'),
      createdAt: new Date().toISOString(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }
    const directory = this.recordsDirectory()
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.atomicWrite(this.bytesPath(recoverableId), bytes)
    const { bytes: _bytes, ...persisted } = record
    this.atomicWrite(this.metadataPath(recoverableId), Buffer.from(JSON.stringify(persisted), 'utf8'))
    return record
  }

  get(recoverableId: string): RecoverableContextRecord | null {
    if (!safeRecoverableId(recoverableId)) return null
    const metadataPath = this.metadataPath(recoverableId)
    const bytesPath = this.bytesPath(recoverableId)
    if (!fs.existsSync(metadataPath) || !fs.existsSync(bytesPath)) return null
    try {
      const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Omit<RecoverableContextRecord, 'bytes'>
      const bytes = fs.readFileSync(bytesPath)
      if (
        parsed.recoverableId !== recoverableId
        || typeof parsed.blockId !== 'string'
        || typeof parsed.sourceKind !== 'string'
        || typeof parsed.sha256 !== 'string'
        || typeof parsed.byteLength !== 'number'
        || typeof parsed.mediaType !== 'string'
        || typeof parsed.createdAt !== 'string'
        || bytes.byteLength !== parsed.byteLength
        || sha256(bytes) !== parsed.sha256
      ) {
        return null
      }
      return { ...parsed, bytes }
    } catch {
      return null
    }
  }

  rehydrate(recoverableId: string, span?: ContextRehydrateSpan): RehydratedContext {
    const record = this.get(recoverableId)
    if (!record) throw new Error(`Unknown or corrupt recoverable context id: ${recoverableId}`)
    return asRehydrated(record, span)
  }

  private recordsDirectory(): string {
    const root = path.resolve(this.rootPath)
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    return path.join(fs.realpathSync.native(root), 'records')
  }

  private bytesPath(recoverableId: string): string {
    return path.join(this.recordsDirectory(), `${recoverableId}.bin`)
  }

  private metadataPath(recoverableId: string): string {
    return path.join(this.recordsDirectory(), `${recoverableId}.json`)
  }

  private atomicWrite(destination: string, bytes: Uint8Array): void {
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`
    try {
      fs.writeFileSync(temporary, bytes, { mode: 0o600 })
      fs.renameSync(temporary, destination)
      fs.chmodSync(destination, 0o600)
    } finally {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true })
    }
  }
}

export function hashContextBytes(content: string | Uint8Array): string {
  return sha256(bytesFromContent(content))
}

export function contextByteLength(content: string | Uint8Array): number {
  return bytesFromContent(content).byteLength
}
