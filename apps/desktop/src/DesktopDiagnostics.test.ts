import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDesktopDiagnostics, desktopUpdaterDiagnostic } from './DesktopDiagnostics.js'
import { startDesktopLifecycle } from './DesktopLifecycle.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
  roots.length = 0
})

describe('desktop diagnostics', () => {
  it('reports only safe capability state until the embedded gateway is implemented', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-desktop-diagnostics-'))
    roots.push(userDataPath)
    const lifecycle = startDesktopLifecycle({ userDataPath, appVersion: '0.1.0' })
    const diagnostics = createDesktopDiagnostics({
      paths: lifecycle.paths,
      appVersion: '0.1.0',
      packaged: false,
      firstRun: lifecycle.firstRun,
      recoveredFromUncleanShutdown: lifecycle.recoveredFromUncleanShutdown,
      updateFeedConfigured: false,
      now: () => new Date('2026-07-09T00:00:00.000Z'),
    })

    expect(diagnostics).toMatchObject({
      gateway: { status: 'not-started' },
      worker: { status: 'not-started' },
      cells: { status: 'not-inspected' },
      vault: { status: 'not-configured' },
      updater: { status: 'disabled', configured: false },
    })
    expect(diagnostics.directories.every((directory) => directory.writable)).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain(userDataPath)
  })

  it('does not claim updater support merely because a feed was configured', () => {
    expect(desktopUpdaterDiagnostic({ updateFeedConfigured: true })).toEqual({
      status: 'unavailable',
      configured: true,
      reason: 'An update feed is configured, but this build has no packaged updater integration.',
    })
  })
})
