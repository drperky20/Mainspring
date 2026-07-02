import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow(desktopWindowOptions(preloadPath()))
  hardenDesktopContents(window.webContents)
  await loadDesktopSurface(window)
  return window
}

app.whenReady().then(async () => {
  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
