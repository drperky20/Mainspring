import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AttachmentStore } from './AttachmentStore.js'

let tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots = []
})

function makeStore(): { root: string; sessionPath: string; store: AttachmentStore } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-attachment-store-'))
  tempRoots.push(root)
  const sessionPath = path.join(root, 'sessions', 'default')
  return {
    root,
    sessionPath,
    store: new AttachmentStore({ sessionPath }),
  }
}

describe('AttachmentStore', () => {
  it('sanitizes traversal, absolute, and empty inbound filenames into contained metadata', () => {
    const { root, sessionPath, store } = makeStore()

    const traversal = store.writeInbound({
      id: 'att_traversal',
      filename: '../escape.txt',
      contentType: 'text/plain',
      data: Buffer.from('contained'),
    })
    const absolute = store.writeInbound({
      id: 'att_absolute',
      filename: path.join(os.tmpdir(), 'Absolute Report.pdf'),
      contentType: 'application/pdf',
      data: Buffer.from('pdf'),
    })
    const empty = store.writeInbound({
      id: 'att_empty',
      filename: '',
      contentType: 'application/octet-stream',
      data: Buffer.from('empty'),
    })

    expect(traversal).toMatchObject({
      id: 'att_traversal',
      name: 'escape.txt',
      contentType: 'text/plain',
      sizeBytes: 9,
      mailboxPath: 'inbox/escape.txt',
      direction: 'inbox',
    })
    expect(absolute).toMatchObject({
      name: 'Absolute-Report.pdf',
      mailboxPath: 'inbox/Absolute-Report.pdf',
    })
    expect(empty).toMatchObject({
      name: 'upload',
      mailboxPath: 'inbox/upload',
    })
    expect(traversal).not.toHaveProperty('originalName')
    expect(traversal).not.toHaveProperty('path')
    expect(traversal).not.toHaveProperty('absolutePath')
    expect(fs.readFileSync(path.join(sessionPath, traversal.mailboxPath), 'utf8')).toBe('contained')
    expect(fs.existsSync(path.join(root, 'sessions', 'escape.txt'))).toBe(false)
    expect(JSON.stringify([traversal, absolute, empty])).not.toContain('..')
    expect(JSON.stringify([traversal, absolute, empty])).not.toContain(os.tmpdir())
  })

  it('rejects symlink escapes before writing through an inbox filename', () => {
    const { sessionPath, store } = makeStore()
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-attachment-outside-'))
    tempRoots.push(outside)
    const outsideFile = path.join(outside, 'owned.txt')
    fs.writeFileSync(outsideFile, 'do not overwrite')

    const inboxPath = path.join(sessionPath, 'inbox')
    fs.mkdirSync(inboxPath, { recursive: true })
    fs.symlinkSync(outsideFile, path.join(inboxPath, 'link.txt'))

    expect(() =>
      store.writeInbound({
        filename: 'link.txt',
        contentType: 'text/plain',
        data: Buffer.from('escape'),
      }),
    ).toThrow('Path escapes root')
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('do not overwrite')
  })

  it('uses exclusive create writes for inbox and outbox attachments', () => {
    const { sessionPath, store } = makeStore()

    const inbound = store.writeInbound({
      filename: 'result.txt',
      contentType: 'text/plain',
      data: Buffer.from('inbound'),
    })
    const outbound = store.writeOutbound({
      filename: 'result.txt',
      contentType: 'text/plain',
      data: Buffer.from('outbound'),
    })

    expect(inbound.mailboxPath).toBe('inbox/result.txt')
    expect(outbound.mailboxPath).toBe('outbox/result.txt')
    expect(fs.readFileSync(path.join(sessionPath, inbound.mailboxPath), 'utf8')).toBe('inbound')
    expect(fs.readFileSync(path.join(sessionPath, outbound.mailboxPath), 'utf8')).toBe('outbound')
    expect(() =>
      store.writeInbound({
        filename: 'result.txt',
        contentType: 'text/plain',
        data: Buffer.from('again'),
      }),
    ).toThrow('Attachment already exists')
  })
})
