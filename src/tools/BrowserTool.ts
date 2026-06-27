import { parsePublicHttpUrl } from '../containment/UrlPolicy.js'
import { builtinManifest, inputRecord, type RuntimeTool } from './ToolRegistry.js'

export interface BrowserRuntimeAdapter {
  open: (input: { url: string }) => unknown | Promise<unknown>
  snapshot?: (input: { format?: 'aria' | 'text'; task?: string }) => unknown | Promise<unknown>
  click?: (input: { ref: string; task?: string }) => unknown | Promise<unknown>
  type?: (input: {
    ref: string
    text: string
    submit?: boolean
    task?: string
  }) => unknown | Promise<unknown>
  screenshot: (input: { fullPage?: boolean; artifactLabel?: string }) => unknown | Promise<unknown>
}

export interface BrowserToolOptions {
  adapter?: BrowserRuntimeAdapter
}

function requireBrowserAdapter(adapter: BrowserRuntimeAdapter | undefined): BrowserRuntimeAdapter {
  if (!adapter) throw new Error('Browser execution requires an approved browser runtime adapter.')
  return adapter
}

function browserRef(value: unknown, fieldName: string): string {
  const ref = typeof value === 'string' ? value.trim() : ''
  if (!ref) throw new Error(`Browser input.${fieldName} must be a non-empty string.`)
  if (!/^@?[A-Za-z][\w:-]{0,127}$/.test(ref)) {
    throw new Error(`Browser input.${fieldName} must be a compact element ref such as @e5.`)
  }
  return ref.startsWith('@') ? ref : `@${ref}`
}

function optionalBrowserTask(value: unknown): string | undefined {
  const task = typeof value === 'string' ? value.trim() : ''
  return task ? task.slice(0, 240) : undefined
}

function requireBrowserMethod<T extends keyof BrowserRuntimeAdapter>(
  adapter: BrowserRuntimeAdapter | undefined,
  method: T,
): NonNullable<BrowserRuntimeAdapter[T]> {
  const runtime = requireBrowserAdapter(adapter)
  const value = runtime[method]
  if (typeof value !== 'function') {
    throw new Error(`Browser runtime adapter does not implement ${String(method)}.`)
  }
  return value as NonNullable<BrowserRuntimeAdapter[T]>
}

export function createBrowserOpenTool(options: BrowserToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'browser.open',
      name: 'Browser Open',
      description: 'Requests browser navigation through the Mainspring browser runtime.',
      permissions: { browser: true, network: 'open' },
      approval: {},
      toolType: 'browser',
    }),
    execute: ({ input }) => {
      const record = inputRecord(input)
      const url = typeof record.url === 'string' ? record.url.trim() : ''
      if (!url) throw new Error('Browser open input.url must be a non-empty string.')
      return requireBrowserAdapter(options.adapter).open({
        url: parsePublicHttpUrl(url, 'Browser open input.url').toString(),
      })
    },
  }
}

export function createBrowserScreenshotTool(options: BrowserToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'browser.screenshot',
      name: 'Browser Screenshot',
      description: 'Captures a screenshot through the Mainspring browser runtime.',
      permissions: { browser: true },
      approval: {},
      toolType: 'browser',
    }),
    execute: ({ input }) => {
      const record = inputRecord(input)
      return requireBrowserAdapter(options.adapter).screenshot({
        fullPage: typeof record.fullPage === 'boolean' ? record.fullPage : undefined,
        artifactLabel:
          typeof record.artifactLabel === 'string' && record.artifactLabel.trim()
            ? record.artifactLabel.trim().slice(0, 120)
            : undefined,
      })
    },
  }
}

export function createBrowserSnapshotTool(options: BrowserToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'browser.snapshot',
      name: 'Browser Snapshot',
      description:
        'Captures a lightweight browser page snapshot for text-first agent reasoning.',
      permissions: { browser: true },
      approval: {},
      toolType: 'browser',
    }),
    execute: ({ input }) => {
      const record = inputRecord(input)
      const format = record.format === 'text' ? 'text' : 'aria'
      return requireBrowserMethod(options.adapter, 'snapshot')({
        format,
        task: optionalBrowserTask(record.task),
      })
    },
  }
}

export function createBrowserClickTool(options: BrowserToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'browser.click',
      name: 'Browser Click',
      description: 'Clicks a referenced browser element through the Mainspring browser runtime.',
      permissions: { browser: true },
      approval: {},
      toolType: 'browser',
    }),
    execute: ({ input }) => {
      const record = inputRecord(input)
      return requireBrowserMethod(options.adapter, 'click')({
        ref: browserRef(record.ref, 'ref'),
        task: optionalBrowserTask(record.task),
      })
    },
  }
}

export function createBrowserTypeTool(options: BrowserToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'browser.type',
      name: 'Browser Type',
      description:
        'Types text into a referenced browser element through the Mainspring browser runtime.',
      permissions: { browser: true },
      approval: {},
      toolType: 'browser',
    }),
    execute: ({ input }) => {
      const record = inputRecord(input)
      const text = typeof record.text === 'string' ? record.text : ''
      if (!text) throw new Error('Browser type input.text must be a non-empty string.')
      return requireBrowserMethod(options.adapter, 'type')({
        ref: browserRef(record.ref, 'ref'),
        text: text.slice(0, 20_000),
        submit: typeof record.submit === 'boolean' ? record.submit : undefined,
        task: optionalBrowserTask(record.task),
      })
    },
  }
}

export function createBrowserTools(options: BrowserToolOptions = {}): RuntimeTool[] {
  return [
    createBrowserOpenTool(options),
    createBrowserSnapshotTool(options),
    createBrowserClickTool(options),
    createBrowserTypeTool(options),
    createBrowserScreenshotTool(options),
  ]
}

export const createBrowserTool = createBrowserOpenTool
