import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { completeDesktopLifecycle, startDesktopLifecycle } from './DesktopLifecycle.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
  roots.length = 0
})

describe('desktop lifecycle', () => {
  it('initializes private app directories and detects an unclean prior shutdown', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-desktop-lifecycle-'))
    roots.push(userDataPath)
    const first = startDesktopLifecycle({
      userDataPath,
      appVersion: '0.1.0',
      now: () => new Date('2026-07-09T00:00:00.000Z'),
    })

    expect(first.firstRun).toBe(true)
    expect(first.recoveredFromUncleanShutdown).toBe(false)
    expect(fs.existsSync(first.paths.lifecycleMarker)).toBe(true)
    expect(fs.statSync(first.paths.state).mode & 0o700).toBeTruthy()

    const restarted = startDesktopLifecycle({
      userDataPath,
      appVersion: '0.1.0',
      now: () => new Date('2026-07-09T00:01:00.000Z'),
    })
    expect(restarted.firstRun).toBe(false)
    expect(restarted.recoveredFromUncleanShutdown).toBe(true)

    completeDesktopLifecycle(restarted.paths)
    expect(fs.existsSync(restarted.paths.lifecycleMarker)).toBe(false)
  })
})
