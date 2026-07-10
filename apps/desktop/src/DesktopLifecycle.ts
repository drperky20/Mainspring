import fs from 'node:fs'
import path from 'node:path'

export interface DesktopDataPaths {
  root: string
  state: string
  gateway: string
  runLog: string
  diagnostics: string
  lifecycleMarker: string
}

export interface DesktopLifecycleMarker {
  version: 1
  startedAt: string
  appVersion: string
}

export interface DesktopLifecycleStartResult {
  paths: DesktopDataPaths
  firstRun: boolean
  recoveredFromUncleanShutdown: boolean
}

function atomicWriteFile(targetPath: string, contents: string): void {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, targetPath)
}

function hasExistingData(paths: DesktopDataPaths): boolean {
  return [paths.state, paths.gateway, paths.runLog, paths.diagnostics].some((target) =>
    fs.existsSync(target),
  )
}

export function desktopDataPaths(userDataPath: string): DesktopDataPaths {
  const root = path.resolve(userDataPath, 'mainspring')
  return {
    root,
    state: path.join(root, 'state'),
    gateway: path.join(root, 'gateway'),
    runLog: path.join(root, 'runlog'),
    diagnostics: path.join(root, 'diagnostics'),
    lifecycleMarker: path.join(root, 'state', 'unclean-shutdown.json'),
  }
}

/**
 * A marker is written before window creation and removed only during a normal
 * quit. It gives a future embedded gateway a reliable recovery signal without
 * treating a missing marker as proof that no prior data exists.
 */
export function startDesktopLifecycle(input: {
  userDataPath: string
  appVersion: string
  now?: () => Date
}): DesktopLifecycleStartResult {
  const paths = desktopDataPaths(input.userDataPath)
  const firstRun = !hasExistingData(paths)
  const recoveredFromUncleanShutdown = fs.existsSync(paths.lifecycleMarker)

  for (const directory of [paths.root, paths.state, paths.gateway, paths.runLog, paths.diagnostics]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  }

  const marker: DesktopLifecycleMarker = {
    version: 1,
    startedAt: (input.now?.() ?? new Date()).toISOString(),
    appVersion: input.appVersion,
  }
  atomicWriteFile(paths.lifecycleMarker, `${JSON.stringify(marker)}\n`)

  return { paths, firstRun, recoveredFromUncleanShutdown }
}

export function completeDesktopLifecycle(paths: DesktopDataPaths): void {
  fs.rmSync(paths.lifecycleMarker, { force: true })
}
