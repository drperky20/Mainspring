export const DEFAULT_FILE_READ_MAX_BYTES = 64 * 1024
export const MAX_FILE_READ_MAX_BYTES = 256 * 1024

export interface CappedBufferResult {
  buffer: Buffer
  bytesRead: number
  truncated: boolean
}

export function boundedPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback
}

export function capBuffer(buffer: Buffer, maxBytes: number): CappedBufferResult {
  if (buffer.byteLength <= maxBytes) {
    return {
      buffer,
      bytesRead: buffer.byteLength,
      truncated: false,
    }
  }
  return {
    buffer: buffer.subarray(0, maxBytes),
    bytesRead: maxBytes,
    truncated: true,
  }
}
