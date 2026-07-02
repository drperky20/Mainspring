#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const desktopPackagePath = 'apps/desktop/package.json'
const rootPackagePath = 'package.json'
const releaseWorkflowPath = '.github/workflows/release-check.yml'

const desktopPackage = JSON.parse(readFileSync(desktopPackagePath, 'utf8'))
const rootPackage = JSON.parse(readFileSync(rootPackagePath, 'utf8'))
const releaseWorkflow = readFileSync(releaseWorkflowPath, 'utf8')

const failures = []

assertDesktopPackageTargets()
assertRootScripts()
assertReleaseWorkflow()

if (failures.length > 0) {
  console.error('Mainspring desktop packaging check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_DESKTOP_PACKAGING_CHECK_OK')

function assertDesktopPackageTargets() {
  const build = desktopPackage.build ?? {}
  if (!build.win) failures.push(`${desktopPackagePath} must define the Windows build target`)
  if (build.linux) failures.push(`${desktopPackagePath} must not define a Linux desktop packaging target`)
  if (build.mac) failures.push(`${desktopPackagePath} must not define a macOS desktop packaging target`)

  const winTargets = normalizeTargets(build.win?.target)
  if (!winTargets.includes('nsis')) failures.push(`${desktopPackagePath} Windows target must include nsis`)

  for (const target of collectBuildTargets(build)) {
    if (['appimage', 'deb', 'rpm', 'snap', 'flatpak', 'pacman', 'apk', 'freebsd'].includes(target.toLowerCase())) {
      failures.push(`${desktopPackagePath} must not include Linux desktop target ${target}`)
    }
  }
}

function assertRootScripts() {
  const scripts = rootPackage.scripts ?? {}
  for (const [name, command] of Object.entries(scripts)) {
    const value = String(command)
    if (/desktop:.*(linux|appimage|deb|rpm|snap|flatpak)/i.test(`${name} ${value}`)) {
      failures.push(`${rootPackagePath} script "${name}" looks like a Linux desktop packaging lane`)
    }
  }
}

function assertReleaseWorkflow() {
  if (!releaseWorkflow.includes('desktop-windows:')) {
    failures.push(`${releaseWorkflowPath} must keep Windows desktop packaging in the desktop-windows job`)
  }
  if (!releaseWorkflow.includes('runs-on: windows-latest')) {
    failures.push(`${releaseWorkflowPath} desktop packaging must run on windows-latest`)
  }

  const lines = releaseWorkflow.split(/\r?\n/)
  let currentJob = ''
  for (const line of lines) {
    const jobMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/)
    if (jobMatch) currentJob = jobMatch[1]
    if (line.includes('pnpm run desktop:pack') && currentJob !== 'desktop-windows') {
      failures.push(`${releaseWorkflowPath} runs desktop packaging outside the desktop-windows job`)
    }
    if (/(AppImage|appimage|\.deb\b|rpm\b|snap\b|flatpak\b)/.test(line)) {
      failures.push(`${releaseWorkflowPath} must not reference Linux desktop package artifacts: ${line.trim()}`)
    }
  }
}

function collectBuildTargets(build) {
  const targets = []
  for (const key of ['win', 'linux', 'mac']) {
    targets.push(...normalizeTargets(build?.[key]?.target))
  }
  return targets
}

function normalizeTargets(target) {
  if (!target) return []
  if (typeof target === 'string') return [target]
  if (Array.isArray(target)) {
    return target.flatMap((entry) => {
      if (typeof entry === 'string') return [entry]
      if (entry && typeof entry === 'object' && typeof entry.target === 'string') return [entry.target]
      return []
    })
  }
  return []
}
