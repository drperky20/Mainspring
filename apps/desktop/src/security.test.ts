import { describe, expect, it, vi } from 'vitest'
import {
  desktopContentSecurityPolicy,
  desktopWindowOptions,
  hardenDesktopContents,
  isAllowedDesktopNavigation,
  isAllowedDesktopUrl,
} from './security.js'

describe('isAllowedDesktopUrl', () => {
  it('allows file URLs and local http origins only', () => {
    expect(isAllowedDesktopUrl('file:///tmp/index.html')).toBe(true)
    expect(isAllowedDesktopUrl('http://127.0.0.1:5173')).toBe(true)
    expect(isAllowedDesktopUrl('https://localhost:9443/app')).toBe(true)
    expect(isAllowedDesktopUrl('https://example.com')).toBe(false)
    expect(isAllowedDesktopUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedDesktopUrl('not a url')).toBe(false)
  })
})

describe('isAllowedDesktopNavigation', () => {
  it('keeps packaged windows on the exact packaged console file', () => {
    const consoleUrl = 'file:///Applications/Mainspring/console/index.html'
    expect(isAllowedDesktopNavigation(consoleUrl, consoleUrl)).toBe(true)
    expect(isAllowedDesktopNavigation(`${consoleUrl}#runs`, consoleUrl)).toBe(true)
    expect(isAllowedDesktopNavigation('file:///etc/passwd', consoleUrl)).toBe(false)
  })

  it('allows a development surface origin without allowing remote navigation', () => {
    const developmentUrl = 'http://127.0.0.1:5173'
    expect(isAllowedDesktopNavigation('http://127.0.0.1:5173/runs', developmentUrl)).toBe(true)
    expect(isAllowedDesktopNavigation('http://localhost:5173', developmentUrl)).toBe(false)
    expect(isAllowedDesktopNavigation('https://example.com', developmentUrl)).toBe(false)
  })
})

describe('desktopWindowOptions', () => {
  it('keeps the Electron renderer on hardened defaults', () => {
    const options = desktopWindowOptions('/tmp/preload.js')
    expect(options.title).toBe('Mainspring')
    expect(options.autoHideMenuBar).toBe(true)
    expect(options.webPreferences).toMatchObject({
      preload: '/tmp/preload.js',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    })
  })
})

describe('hardenDesktopContents', () => {
  it('denies popup windows, remote navigation, and permissions while injecting CSP', () => {
    const willNavigateHandlers: Array<(event: { preventDefault: () => void }, url: string) => void> = []
    type PermissionHandler = (wc: unknown, permission: string, callback: (allowed: boolean) => void) => void
    type HeaderResponse = { cancel: boolean; responseHeaders?: Record<string, string[]> }
    type HeaderHandler = (
      details: { responseHeaders?: Record<string, string[]> },
      callback: (response: HeaderResponse) => void,
    ) => void
    let permissionHandler: PermissionHandler | undefined
    let headerHandler: HeaderHandler | undefined
    const setWindowOpenHandler = vi.fn()

    const webContents = {
      setWindowOpenHandler,
      on: vi.fn((event: string, handler: (event: { preventDefault: () => void }, url: string) => void) => {
        if (event === 'will-navigate') willNavigateHandlers.push(handler)
      }),
      session: {
        setPermissionRequestHandler: vi.fn((handler: typeof permissionHandler) => {
          permissionHandler = handler
        }),
        webRequest: {
          onHeadersReceived: vi.fn((handler: typeof headerHandler) => {
            headerHandler = handler
          }),
        },
      },
    }

    hardenDesktopContents(webContents as never, 'http://127.0.0.1:5173')

    expect(setWindowOpenHandler).toHaveBeenCalledOnce()
    expect(setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function))
    const windowOpenDecision = setWindowOpenHandler.mock.calls[0]?.[0]?.()
    expect(windowOpenDecision).toEqual({ action: 'deny' })

    expect(permissionHandler).toBeDefined()
    let permissionAllowed = true
    permissionHandler?.({}, 'notifications', (allowed: boolean) => {
      permissionAllowed = allowed
    })
    expect(permissionAllowed).toBe(false)

    expect(willNavigateHandlers).toHaveLength(1)
    let prevented = false
    willNavigateHandlers[0]?.({ preventDefault: () => (prevented = true) }, 'https://example.com')
    expect(prevented).toBe(true)

    prevented = false
    willNavigateHandlers[0]?.({ preventDefault: () => (prevented = true) }, 'http://127.0.0.1:5173')
    expect(prevented).toBe(false)

    expect(headerHandler).toBeDefined()
    let headerResponse: HeaderResponse | null = null
    headerHandler?.({ responseHeaders: { 'X-Test': ['ok'] } }, (response: HeaderResponse) => {
      headerResponse = response
    })
    expect(headerResponse).toEqual({
      cancel: false,
      responseHeaders: {
        'X-Test': ['ok'],
        'Content-Security-Policy': [desktopContentSecurityPolicy],
      },
    })
  })
})
