import { randomUUID } from 'node:crypto'

export function nowIso(): string {
  return new Date().toISOString()
}

export function createRunLogId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}
