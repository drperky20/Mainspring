import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { BlobAdapter, BlobRef, BlobWriteInput } from '../../core/types.js'

function bytesFromInput(bytes: string | Uint8Array): Uint8Array {
  return typeof bytes === 'string' ? Buffer.from(bytes) : bytes
}

export class LocalBlobStore implements BlobAdapter {
  constructor(private readonly rootPath: string) {
    fs.mkdirSync(rootPath, { recursive: true })
  }

  write(input: BlobWriteInput): BlobRef {
    const bytes = bytesFromInput(input.bytes)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const shard = sha256.slice(0, 2)
    const dir = path.join(this.rootPath, shard)
    const filePath = path.join(dir, sha256)
    fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, bytes)
    }
    return {
      blobId: `blob_${sha256}`,
      sha256,
      byteLength: bytes.byteLength,
      uri: filePath,
      mediaType: input.mediaType,
      metadata: input.metadata,
    }
  }

  read(ref: BlobRef | string): Uint8Array {
    const filePath = typeof ref === 'string' ? path.join(this.rootPath, ref.slice(0, 2), ref) : ref.uri
    return fs.readFileSync(filePath)
  }
}
