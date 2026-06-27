import fs from 'node:fs'
import path from 'node:path'
import {
  createMainspringRuntimeId,
  inferRuntimeMimeType,
  resolveSessionMailboxPaths,
  sanitizeRuntimeFilename,
} from '#protocol'
import { assertPathContained } from '#protocol/node'

export type AttachmentDirection = 'inbox' | 'outbox'

export interface AttachmentStoreOptions {
  sessionPath: string
}

export interface AttachmentWriteInput {
  id?: string
  filename: string
  contentType?: string
  data: string | Uint8Array
}

export interface StoredAttachmentMetadata {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  mailboxPath: string
  direction: AttachmentDirection
}

export class AttachmentStore {
  private readonly sessionPath: string

  constructor(options: AttachmentStoreOptions) {
    this.sessionPath = path.resolve(options.sessionPath)
  }

  writeInbound(input: AttachmentWriteInput): StoredAttachmentMetadata {
    return this.write('inbox', input)
  }

  writeOutbound(input: AttachmentWriteInput): StoredAttachmentMetadata {
    return this.write('outbox', input)
  }

  private write(
    direction: AttachmentDirection,
    input: AttachmentWriteInput,
  ): StoredAttachmentMetadata {
    const directory = this.ensureDirectory(direction)
    const name = sanitizeRuntimeFilename(input.filename, 'upload')
    const target = assertPathContained(directory, path.join(directory, name))
    const data = typeof input.data === 'string' ? Buffer.from(input.data) : Buffer.from(input.data)

    let descriptor: number | undefined
    try {
      descriptor = fs.openSync(target, 'wx')
      fs.writeFileSync(descriptor, data)
    } catch (error) {
      if (isFileExistsError(error)) {
        throw new Error(`Attachment already exists: ${name}`, { cause: error })
      }
      throw error
    } finally {
      if (descriptor !== undefined) {
        fs.closeSync(descriptor)
      }
    }

    return {
      id: input.id?.trim() || createMainspringRuntimeId('attachment'),
      name,
      contentType: input.contentType?.trim() || inferRuntimeMimeType(name),
      sizeBytes: data.byteLength,
      mailboxPath: `${direction}/${name}`,
      direction,
    }
  }

  private ensureDirectory(direction: AttachmentDirection): string {
    const paths = resolveSessionMailboxPaths(this.sessionPath)
    const directory = direction === 'inbox' ? paths.inboxPath : paths.outboxPath
    const contained = assertPathContained(this.sessionPath, directory)
    fs.mkdirSync(contained, { recursive: true })
    return contained
  }
}

function isFileExistsError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
