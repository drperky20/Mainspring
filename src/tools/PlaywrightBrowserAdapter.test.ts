import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunLogEvent, RuntimeToolSessionEvent } from '../core/types.js'
import {
  createPlaywrightBrowserRuntimeAdapter,
  createPlaywrightBrowserToolSessionFactory,
  type PlaywrightBrowserContextLike,
  type PlaywrightBrowserPageLike,
} from './PlaywrightBrowserAdapter.js'

const roots: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mainspring-playwright-'))
  roots.push(root)
  return root
}

function fakeBrowser(): {
  page: PlaywrightBrowserPageLike
  context: PlaywrightBrowserContextLike
  calls: {
    goto: string[]
    locators: string[]
    clicks: string[]
    fills: string[]
    presses: string[]
    screenshotPaths: string[]
    pageClosed: number
    contextClosed: number
    tracingStarted: number
    tracingStopped: string[]
  }
} {
  let currentUrl = ''
  const calls = {
    goto: [] as string[],
    locators: [] as string[],
    clicks: [] as string[],
    fills: [] as string[],
    presses: [] as string[],
    screenshotPaths: [] as string[],
    pageClosed: 0,
    contextClosed: 0,
    tracingStarted: 0,
    tracingStopped: [] as string[],
  }
  const page: PlaywrightBrowserPageLike = {
    goto: async (url) => {
      currentUrl = url
      calls.goto.push(url)
    },
    url: () => currentUrl,
    evaluate: async <T,>(expression: string) => {
      if (!expression.includes('data-mainspring-ref')) throw new Error('unexpected evaluate')
      return {
        text: 'A safe public page with a button and a search field.',
        refs: [
          { ref: '@e1', role: 'button', name: 'Continue' },
          { ref: '@e2', role: 'textbox', name: 'Search' },
        ],
      } as T
    },
    locator: (selector) => {
      calls.locators.push(selector)
      return {
        click: async () => {
          calls.clicks.push(selector)
        },
        fill: async (value) => {
          calls.fills.push(value)
        },
        press: async (key) => {
          calls.presses.push(key)
        },
      }
    },
    screenshot: async ({ path: filePath }) => {
      calls.screenshotPaths.push(filePath)
      await fs.writeFile(filePath, Buffer.from('png-bytes'))
    },
    close: async () => {
      calls.pageClosed += 1
    },
  }
  const context: PlaywrightBrowserContextLike = {
    tracing: {
      start: async () => {
        calls.tracingStarted += 1
      },
      stop: async ({ path: filePath }) => {
        calls.tracingStopped.push(filePath)
        await fs.writeFile(filePath, Buffer.from('trace-bytes'))
      },
    },
    close: async () => {
      calls.contextClosed += 1
    },
  }
  return { page, context, calls }
}

afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true })
})

describe('Playwright browser runtime adapter', () => {
  it('owns a bounded lease, refs, screenshot artifact, trace artifact, and release events', async () => {
    const root = await makeTempRoot()
    const events: RuntimeToolSessionEvent[] = []
    const browser = fakeBrowser()
    const adapter = await createPlaywrightBrowserRuntimeAdapter({
      page: browser.page,
      context: browser.context,
      artifactRoot: root,
      runId: 'run_browser_adapter',
      sessionId: 'session_browser_adapter',
      eventSink: (event) => {
        events.push(event)
        return {} as RunLogEvent
      },
      closeContext: true,
    })

    expect(events[0]).toMatchObject({
      type: 'browser.lease.created',
      payload: { runId: 'run_browser_adapter', traceEnabled: true },
    })
    await adapter.open({ url: 'https://192.0.2.1/start' })
    const snapshot = await adapter.snapshot({ format: 'aria', task: 'Find the button.' })
    expect(snapshot).toMatchObject({
      format: 'aria',
      text: 'A safe public page with a button and a search field.',
      taskProvided: true,
      refs: [
        { ref: '@e1', role: 'button', name: 'Continue' },
        { ref: '@e2', role: 'textbox', name: 'Search' },
      ],
    })

    await adapter.click({ ref: '@e1' })
    await expect(adapter.click({ ref: '@e1' })).rejects.toThrow('fresh browser snapshot')

    await adapter.snapshot({ format: 'text' })
    await adapter.type({ ref: '@e2', text: 'Mainspring', submit: true })
    expect(browser.calls.fills).toEqual(['Mainspring'])
    expect(browser.calls.presses).toEqual(['Enter'])

    await adapter.snapshot({ format: 'text' })
    const screenshot = await adapter.screenshot({ artifactLabel: 'Operator view' })
    expect(screenshot).toMatchObject({
      artifactLabel: 'Operator view',
      mediaType: 'image/png',
      url: `artifact://${screenshot.artifactId}`,
    })
    expect(path.dirname(browser.calls.screenshotPaths[0]!)).toBe(path.resolve(root))

    const closeResult = await adapter.close()
    expect(closeResult.traceArtifactId).toMatch(/^browser_trace_browser_lease_run_browser_adapter_/)
    expect(closeResult.traceBytes).toBeGreaterThan(0)
    expect((await fs.stat(browser.calls.screenshotPaths[0]!)).size).toBeGreaterThan(0)
    expect(browser.calls.tracingStarted).toBe(1)
    expect(browser.calls.tracingStopped).toHaveLength(1)
    expect(browser.calls.pageClosed).toBe(1)
    expect(browser.calls.contextClosed).toBe(1)
    expect(events.map((event) => event.type)).toEqual([
      'browser.lease.created',
      'artifact.created',
      'artifact.created',
      'browser.lease.released',
    ])

    await adapter.close()
    expect(browser.calls.pageClosed).toBe(1)
  })

  it('rejects private navigation even when called directly and exposes a RunLog tool-session bridge', async () => {
    const root = await makeTempRoot()
    const events: RuntimeToolSessionEvent[] = []
    const browser = fakeBrowser()
    const adapter = await createPlaywrightBrowserRuntimeAdapter({
      page: browser.page,
      artifactRoot: root,
      runId: 'run_browser_private',
      sessionId: 'session_browser_private',
    })

    await expect(adapter.open({ url: 'http://127.0.0.1:8787' })).rejects.toThrow(
      'private or local network hosts',
    )
    await adapter.close()

    const sessionFactory = createPlaywrightBrowserToolSessionFactory({
      createLease: async () => {
        const sessionBrowser = fakeBrowser()
        return await createPlaywrightBrowserRuntimeAdapter({
          page: sessionBrowser.page,
          artifactRoot: root,
          runId: 'run_browser_factory',
          sessionId: 'session_browser_factory',
        })
      },
    })
    const session = await sessionFactory({
      run: {
        runId: 'run_browser_factory',
        agentId: 'agent_browser_factory',
        sessionId: 'session_browser_factory',
        status: 'running',
        input: 'browse',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      workspaceRoot: root,
      signal: new AbortController().signal,
      emitEvent: (event) => {
        events.push(event)
        return {} as RunLogEvent
      },
    })
    expect(session.tools.map((tool) => tool.manifest.key)).toEqual([
      'browser.open',
      'browser.snapshot',
      'browser.click',
      'browser.type',
      'browser.screenshot',
    ])
    await session.close?.()
  })
})
