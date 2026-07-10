import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createDesktopDiagnostics } from './DesktopDiagnostics.js'
import {
  completeDesktopLifecycle,
  startDesktopLifecycle,
  type DesktopLifecycleStartResult,
} from './DesktopLifecycle.js'
import { renderDesktopFallbackHtml } from './renderer.js'
import {
  desktopContentSecurityPolicy,
  desktopWindowOptions,
  hardenDesktopContents,
  isAllowedDesktopUrl,
} from './security.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function consoleIndexPath(): string {
  return path.resolve(__dirname, '..', '..', 'console', 'dist', 'index.html')
}

function preloadPath(): string {
  return path.resolve(__dirname, 'preload.js')
}

function desktopConsoleUrlFromEnv(): string | null {
  const value = process.env.MAINSPRING_DESKTOP_CONSOLE_URL?.trim()
  if (!value) return null
  return isAllowedDesktopUrl(value) ? value : null
}

async function loadDesktopSurface(window: BrowserWindow): Promise<void> {
  const devUrl = desktopConsoleUrlFromEnv()
  if (devUrl) {
    await window.loadURL(devUrl)
    return
  }

  const builtConsole = consoleIndexPath()
  if (fs.existsSync(builtConsole)) {
    await window.loadURL(pathToFileURL(builtConsole).toString())
    return
  }

  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      renderDesktopFallbackHtml({
        csp: desktopContentSecurityPolicy,
        consolePath: builtConsole,
      }),
    )}`,
  )
}

function desktopSurfaceUrl(): string {
  const devUrl = desktopConsoleUrlFromEnv()
  if (devUrl) return devUrl
  const builtConsole = consoleIndexPath()
  if (fs.existsSync(builtConsole)) return pathToFileURL(builtConsole).toString()
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    renderDesktopFallbackHtml({
      csp: desktopContentSecurityPolicy,
      consolePath: builtConsole,
    }),
  )}`
}

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow(desktopWindowOptions(preloadPath()))
  hardenDesktopContents(window.webContents, desktopSurfaceUrl())
  await loadDesktopSurface(window)
  return window
}

let lifecycle: DesktopLifecycleStartResult | null = null
let isQuittingNormally = false

function registerDesktopIpc(): void {
  ipcMain.removeHandler('mainspring:diagnostics.get')
  ipcMain.handle('mainspring:diagnostics.get', () => {
    if (!lifecycle) throw new Error('Desktop lifecycle has not initialized.')
    return createDesktopDiagnostics({
      paths: lifecycle.paths,
      appVersion: app.getVersion(),
      packaged: app.isPackaged,
      firstRun: lifecycle.firstRun,
      recoveredFromUncleanShutdown: lifecycle.recoveredFromUncleanShutdown,
      updateFeedConfigured: Boolean(process.env.MAINSPRING_DESKTOP_UPDATE_URL?.trim()),
    })
  })
}

function focusMainWindow(): void {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => focusMainWindow())

  app.whenReady().then(async () => {
    lifecycle = startDesktopLifecycle({
      userDataPath: app.getPath('userData'),
      appVersion: app.getVersion(),
    })
    registerDesktopIpc()
    await createMainWindow()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow()
      }
    })
  })

  app.on('before-quit', () => {
    isQuittingNormally = true
  })

  app.on('will-quit', () => {
    if (isQuittingNormally && lifecycle) completeDesktopLifecycle(lifecycle.paths)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
