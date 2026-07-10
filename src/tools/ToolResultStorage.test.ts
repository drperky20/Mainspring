import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolResultStorage } from './ToolResultStorage.js'

let tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots = []
})

describe('ToolResultStorage', () => {
  it('keeps small tool results inline', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-tool-result-inline-'))
    tempRoots.push(root)
    const storage = new ToolResultStorage({ inlineMaxBytes: 128 })

    const prepared = storage.prepare({
      runId: 'run_1',
      workspaceRoot: root,
      toolName: 'file.read',
      output: { path: 'notes/input.txt', text: 'small' },
    })

    expect(prepared).toMatchObject({
      spilled: false,
      output: { path: 'notes/input.txt', text: 'small' },
    })
  })

  it('spills large tool results into a workspace-backed file summary', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-tool-result-large-'))
    tempRoots.push(root)
    const storage = new ToolResultStorage({ inlineMaxBytes: 128 })
    const text = 'x'.repeat(1024)

    const prepared = storage.prepare({
      runId: 'run_large',
      workspaceRoot: root,
      toolName: 'file.read',
      output: { path: 'notes/large.txt', text },
    })

    expect(prepared.spilled).toBe(true)
    expect(prepared.output).toMatchObject({
      storage: 'workspace-file',
      path: expect.stringMatching(/^\.mainspring\/tool-results\/run_large\/tool_result_/),
      summary: {
        path: 'notes/large.txt',
        text: `${'x'.repeat(240)}...`,
      },
    })
    const storedPath = path.join(root, String(prepared.relativePath).replace(/\//g, path.sep))
    expect(fs.existsSync(storedPath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(storedPath, 'utf8'))).toMatchObject({
      path: 'notes/large.txt',
      text,
    })
  })

  it('rejects spill directories that escape the workspace root', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-tool-result-contained-'))
    tempRoots.push(parent)
    const root = path.join(parent, 'workspace')
    fs.mkdirSync(root)
    const storage = new ToolResultStorage({
      inlineMaxBytes: 128,
      resultsDirectory: '../outside-results',
    })

    expect(() =>
      storage.prepare({
        runId: 'run_escape',
        workspaceRoot: root,
        toolName: 'file.read',
        output: { path: 'notes/large.txt', text: 'x'.repeat(1024) },
      }),
    ).toThrow('Path escapes root')

    expect(fs.existsSync(path.join(parent, 'outside-results'))).toBe(false)
  })
})
