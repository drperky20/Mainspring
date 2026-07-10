import type { BrowserWindowConstructorOptions, WebContents } from 'electron'

export const desktopContentSecurityPolicy =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:*;"

export function isAllowedDesktopUrl(target: string): boolean {
  try {
    const url = new URL(target)
    if (url.protocol === 'file:') return true
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  } catch {
    return false
  }
}

/**
 * Loading a development surface is different from allowing renderer
 * navigation. Development can use an explicit loopback URL, while a packaged
 * app must remain on its packaged console file.
 */
export function isAllowedDesktopNavigation(target: string, trustedSurface: string): boolean {
  try {
    const destination = new URL(target)
    const trusted = new URL(trustedSurface)
    if (trusted.protocol === 'file:') {
      return destination.protocol === 'file:' && destination.pathname === trusted.pathname
    }
    return destination.origin === trusted.origin
  } catch {
    return false
  }
}

export function desktopWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    title: 'Mainspring',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  }
}

export function hardenDesktopContents(
  contents: WebContents,
  trustedSurface?: string,
): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))

  contents.on('will-navigate', (event, url) => {
    if (!trustedSurface || !isAllowedDesktopNavigation(url, trustedSurface)) event.preventDefault()
  })

  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })

  contents.session.webRequest.onHeadersReceived((details, callback) => {
    if (!details.responseHeaders) {
      callback({ cancel: false })
      return
    }
    callback({
      cancel: false,
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [desktopContentSecurityPolicy],
      },
    })
  })
}
