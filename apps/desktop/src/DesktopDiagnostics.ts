import fs from 'node:fs'
import type { DesktopDataPaths } from './DesktopLifecycle.js'

export type DesktopDirectoryDiagnostic = {
  name: 'state' | 'gateway' | 'runLog' | 'diagnostics'
  exists: boolean
  writable: boolean
  availableBytes?: number
}

export type DesktopDiagnostics = {
  generatedAt: string
  app: {
    version: string
    packaged: boolean
    platform: NodeJS.Platform
    runtime: {
      electron: string | undefined
      node: string
    }
  }
  lifecycle: {
    firstRun: boolean
    recoveredFromUncleanShutdown: boolean
  }
  directories: DesktopDirectoryDiagnostic[]
  database: {
    status: 'not-initialized'
    migrationStatus: 'not-started'
  }
  gateway: {
    status: 'not-started'
    reason: string
  }
  worker: {
    status: 'not-started'
  }
  cells: {
    status: 'not-inspected'
  }
  vault: {
    status: 'not-configured'
    reason: string
  }
  updater: DesktopUpdaterDiagnostic
  recentFailures: Array<{ code: string; at: string }>
}

export type DesktopUpdaterDiagnostic = {
  status: 'disabled' | 'unavailable'
  configured: boolean
  reason: string
}

export function desktopUpdaterDiagnostic(input: {
  updateFeedConfigured: boolean
}): DesktopUpdaterDiagnostic {
  if (!input.updateFeedConfigured) {
    return {
      status: 'disabled',
      configured: false,
      reason: 'No desktop update feed is configured.',
    }
  }
  return {
    status: 'unavailable',
    configured: true,
    reason: 'An update feed is configured, but this build has no packaged updater integration.',
  }
}

function directoryDiagnostic(
  name: DesktopDirectoryDiagnostic['name'],
  directoryPath: string,
): DesktopDirectoryDiagnostic {
  const exists = fs.existsSync(directoryPath)
  let writable = false
  let availableBytes: number | undefined

  if (exists) {
    const probePath = `${directoryPath}/.mainspring-write-probe-${process.pid}`
    try {
      fs.writeFileSync(probePath, '')
      fs.rmSync(probePath, { force: true })
      writable = true
    } catch {
      writable = false
    }
    try {
      const stats = fs.statfsSync(directoryPath)
      availableBytes = Number(stats.bavail) * Number(stats.bsize)
    } catch {
      // Disk space is diagnostic-only and platform filesystems can omit it.
    }
  }

  return {
    name,
    exists,
    writable,
    ...(typeof availableBytes === 'number' && Number.isFinite(availableBytes)
      ? { availableBytes }
      : {}),
  }
}

/**
 * This intentionally returns health classifications rather than filesystem
 * paths, provider errors, environment values, or user content. It is safe to
 * expose through the preload bridge and can later be included in a redacted
 * diagnostic bundle.
 */
export function createDesktopDiagnostics(input: {
  paths: DesktopDataPaths
  appVersion: string
  packaged: boolean
  firstRun: boolean
  recoveredFromUncleanShutdown: boolean
  updateFeedConfigured: boolean
  now?: () => Date
}): DesktopDiagnostics {
  return {
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    app: {
      version: input.appVersion,
      packaged: input.packaged,
      platform: process.platform,
      runtime: {
        electron: process.versions.electron,
        node: process.versions.node,
      },
    },
    lifecycle: {
      firstRun: input.firstRun,
      recoveredFromUncleanShutdown: input.recoveredFromUncleanShutdown,
    },
    directories: [
      directoryDiagnostic('state', input.paths.state),
      directoryDiagnostic('gateway', input.paths.gateway),
      directoryDiagnostic('runLog', input.paths.runLog),
      directoryDiagnostic('diagnostics', input.paths.diagnostics),
    ],
    database: { status: 'not-initialized', migrationStatus: 'not-started' },
    gateway: {
      status: 'not-started',
      reason: 'Embedded gateway startup is not enabled in this desktop build.',
    },
    worker: { status: 'not-started' },
    cells: { status: 'not-inspected' },
    vault: {
      status: 'not-configured',
      reason: 'Desktop secure storage is not configured in this build.',
    },
    updater: desktopUpdaterDiagnostic({ updateFeedConfigured: input.updateFeedConfigured }),
    recentFailures: [],
  }
}
