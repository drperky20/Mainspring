import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { redactRuntimeSensitiveText, sanitizeRuntimeUrl } from '#protocol'
import { assertPublicNetworkTarget, parsePublicHttpUrl } from '../containment/UrlPolicy.js'
import type {
  RunRecord,
  RuntimeToolSession,
  RuntimeToolSessionEventEmitter,
  RuntimeToolSessionFactory,
} from '../core/types.js'
import {
  createBrowserTools,
  type BrowserRuntimeAdapter,
} from './BrowserTool.js'

export interface PlaywrightBrowserLocatorLike {
  click: () => Promise<void>
  fill: (value: string) => Promise<void>
  press?: (key: string) => Promise<void>
}

/**
 * Small structural surface so the optional Playwright runtime does not make
 * the core package depend on a particular Playwright release. Hosts inject a
 * page/context from the browser process they own.
 */
export interface PlaywrightBrowserPageLike {
  goto: (
    url: string,
    options?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle'; timeout?: number },
  ) => Promise<unknown>
  url: () => string
  evaluate: <T>(expression: string) => Promise<T>
  locator: (selector: string) => PlaywrightBrowserLocatorLike
  screenshot: (options: {
    path: string
    fullPage?: boolean
  }) => Promise<Uint8Array | void>
  close?: () => Promise<void>
}

export interface PlaywrightBrowserTracingLike {
  start: (options: {
    screenshots: boolean
    snapshots: boolean
    sources: boolean
  }) => Promise<void>
  stop: (options: { path: string }) => Promise<void>
}

export interface PlaywrightBrowserContextLike {
  tracing?: PlaywrightBrowserTracingLike
  close?: () => Promise<void>
}

export interface PlaywrightBrowserElementRef {
  ref: string
  role: string
  name?: string
}

export interface PlaywrightBrowserArtifact {
  artifactId: string
  artifactLabel: string
  mediaType: string
  byteLength: number
  url: string
}

export interface PlaywrightBrowserLeaseCloseResult {
  leaseId: string
  traceArtifactId?: string
  traceBytes?: number
  traceError?: boolean
}

export interface PlaywrightBrowserRuntimeAdapterOptions {
  page: PlaywrightBrowserPageLike
  context?: PlaywrightBrowserContextLike
  artifactRoot: string
  runId: string
  sessionId: string
  leaseId?: string
  eventSink?: RuntimeToolSessionEventEmitter
  maxSnapshotChars?: number
  maxInteractiveElements?: number
  maxArtifactBytes?: number
  navigationTimeoutMs?: number
  closePage?: boolean
  closeContext?: boolean
}

export interface CreatePlaywrightBrowserToolSessionFactoryOptions {
  createLease: (input: {
    run: RunRecord
    workspaceRoot: string
    signal: AbortSignal
    emitEvent: RuntimeToolSessionEventEmitter
  }) => Promise<PlaywrightBrowserRuntimeAdapter>
}

const DEFAULT_MAX_SNAPSHOT_CHARS = 32_000
const DEFAULT_MAX_INTERACTIVE_ELEMENTS = 100
const DEFAULT_MAX_ARTIFACT_BYTES = 50 * 1024 * 1024
const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000

function safePart(value: string, fallback: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^[_-]+|[_-]+$/g, '')
  return (normalized || fallback).slice(0, 48)
}

function safeLabel(value: unknown, fallback: string): string {
  const text = typeof value === 'string' && value.trim() ? value.trim() : fallback
  return redactRuntimeSensitiveText(text.replace(/[\r\n\t]+/g, ' ').slice(0, 120))
}

function boundedText(value: unknown, maxChars: number): { value: string; truncated: boolean } {
  const raw = typeof value === 'string' ? value : ''
  const redacted = redactRuntimeSensitiveText(raw)
  return redacted.length > maxChars
    ? { value: redacted.slice(0, maxChars), truncated: true }
    : { value: redacted, truncated: false }
}

function normalizedRef(value: string): string {
  const trimmed = value.trim()
  const candidate = trimmed.startsWith('@') ? trimmed : `@${trimmed}`
  if (!/^@e[0-9]{1,4}$/.test(candidate)) {
    throw new Error('Browser element ref is invalid; capture a fresh browser snapshot.')
  }
  return candidate
}

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}

function sanitizeBrowserUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.hash = ''
    return sanitizeRuntimeUrl(url.toString())
  } catch {
    return redactRuntimeSensitiveText(value)
  }
}

function browserCancellationError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Browser lease creation was cancelled.')
}

function assertBrowserSignalActive(signal: AbortSignal): void {
  if (signal.aborted) throw browserCancellationError(signal)
}

/**
 * A host-owned Playwright lease for the existing BrowserTool contract.
 *
 * The adapter deliberately receives an already-created page/context instead
 * of importing Playwright. That keeps Playwright optional for package users,
 * leaves browser process ownership with the host, and makes the security
 * boundary explicit. Each lease owns a bounded ref generation, screenshot
 * artifacts below `artifactRoot`, and an optional Playwright trace artifact.
 */
export class PlaywrightBrowserRuntimeAdapter implements BrowserRuntimeAdapter {
  private readonly artifactRoot: string
  private readonly maxSnapshotChars: number
  private readonly maxInteractiveElements: number
  private readonly maxArtifactBytes: number
  private readonly navigationTimeoutMs: number
  private readonly leaseId: string
  private readonly refs = new Set<string>()
  private started = false
  private closed = false
  private tracingStarted = false
  private closeResult: PlaywrightBrowserLeaseCloseResult | null = null

  constructor(private readonly options: PlaywrightBrowserRuntimeAdapterOptions) {
    this.artifactRoot = path.resolve(options.artifactRoot)
    this.maxSnapshotChars = Math.min(
      Math.max(Math.floor(options.maxSnapshotChars ?? DEFAULT_MAX_SNAPSHOT_CHARS), 1_000),
      200_000,
    )
    this.maxInteractiveElements = Math.min(
      Math.max(Math.floor(options.maxInteractiveElements ?? DEFAULT_MAX_INTERACTIVE_ELEMENTS), 1),
      500,
    )
    this.maxArtifactBytes = Math.min(
      Math.max(Math.floor(options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES), 1_024),
      250 * 1024 * 1024,
    )
    this.navigationTimeoutMs = Math.min(
      Math.max(Math.floor(options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS), 1_000),
      120_000,
    )
    this.leaseId = options.leaseId?.trim()
      ? safePart(options.leaseId, 'browser_lease')
      : `browser_lease_${safePart(options.runId, 'run')}_${randomUUID().slice(0, 12)}`
  }

  async start(): Promise<this> {
    if (this.closed) throw new Error('Browser lease is already closed.')
    if (this.started) return this

    await fs.mkdir(this.artifactRoot, { recursive: true })
    if (this.options.context?.tracing?.start) {
      await this.options.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
      })
      this.tracingStarted = true
    }
    this.started = true
    this.emit({
      type: 'browser.lease.created',
      visibility: 'public',
      payload: {
        leaseId: this.leaseId,
        runId: this.options.runId,
        sessionId: this.options.sessionId,
        traceEnabled: this.tracingStarted,
      },
    })
    return this
  }

  async open(input: { url: string }): Promise<{ url?: string }> {
    this.assertOpen()
    const url = parsePublicHttpUrl(input.url, 'Browser lease navigation target')
    await assertPublicNetworkTarget(url)
    this.refs.clear()
    await this.options.page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: this.navigationTimeoutMs,
    })
    const currentUrl = await this.assertCurrentUrlPublic('Browser lease current URL after open')
    return { url: currentUrl ?? sanitizeBrowserUrl(url.toString()) }
  }

  currentUrl(): string | undefined {
    if (this.closed) return undefined
    const url = this.options.page.url().trim()
    return url ? sanitizeBrowserUrl(url) : undefined
  }

  async snapshot(input: {
    format?: 'aria' | 'text'
    task?: string
  }): Promise<{
    format: 'aria' | 'text'
    url?: string
    text: string
    aria?: string
    refs: PlaywrightBrowserElementRef[]
    truncated: boolean
    taskProvided: boolean
  }> {
    this.assertOpen()
    await this.assertCurrentUrlPublic('Browser lease current URL before snapshot')
    const raw = await this.options.page.evaluate<{
      text?: unknown
      refs?: unknown
    }>(`(() => {
      const max = ${JSON.stringify(this.maxInteractiveElements)};
      for (const element of Array.from(document.querySelectorAll('[data-mainspring-ref]'))) {
        element.removeAttribute('data-mainspring-ref');
      }
      const selector = 'button, a[href], input, textarea, select, [role="button"], [contenteditable="true"]';
      const refs = Array.from(document.querySelectorAll(selector)).slice(0, max).map((element, index) => {
        const ref = 'e' + String(index + 1);
        element.setAttribute('data-mainspring-ref', ref);
        const role = element.getAttribute('role') || element.tagName.toLowerCase();
        const name = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder') || element.textContent || '';
        return { ref: '@' + ref, role, name: String(name).trim().slice(0, 160) };
      });
      return { text: document.body ? document.body.innerText : '', refs };
    })()`)

    const refs = Array.isArray(raw?.refs)
      ? raw.refs.filter((value): value is PlaywrightBrowserElementRef => {
          if (!value || typeof value !== 'object') return false
          const record = value as Record<string, unknown>
          return typeof record.ref === 'string'
            && /^@e[0-9]{1,4}$/.test(record.ref)
            && typeof record.role === 'string'
        }).map((value) => ({
          ref: value.ref,
          role: value.role,
          ...(typeof value.name === 'string' && value.name.trim()
            ? { name: safeLabel(value.name, 'interactive element') }
            : {}),
        }))
      : []
    const currentUrl = await this.assertCurrentUrlPublic('Browser lease current URL after snapshot')
    this.refs.clear()
    for (const ref of refs) this.refs.add(ref.ref)

    const text = boundedText(raw?.text, this.maxSnapshotChars)
    const format = input.format === 'text' ? 'text' : 'aria'
    const aria = refs
      .map((ref) => `${ref.ref} ${ref.role}${ref.name ? ` ${ref.name}` : ''}`)
      .join('\n')
    return {
      format,
      ...(currentUrl ? { url: currentUrl } : {}),
      text: text.value,
      ...(format === 'aria' ? { aria: boundedText(aria, this.maxSnapshotChars).value } : {}),
      refs,
      truncated: text.truncated,
      taskProvided: typeof input.task === 'string' && input.task.trim().length > 0,
    }
  }

  async click(input: { ref: string; task?: string }): Promise<{ ref: string; taskProvided: boolean }> {
    this.assertOpen()
    await this.assertCurrentUrlPublic('Browser lease current URL before click')
    const ref = normalizedRef(input.ref)
    const locator = this.locatorFor(ref)
    try {
      await locator.click()
    } finally {
      this.refs.clear()
    }
    await this.assertCurrentUrlPublic('Browser lease current URL after click')
    return {
      ref,
      taskProvided: typeof input.task === 'string' && input.task.trim().length > 0,
    }
  }

  async type(input: {
    ref: string
    text: string
    submit?: boolean
    task?: string
  }): Promise<{ ref: string; textLength: number; submitted: boolean; taskProvided: boolean }> {
    this.assertOpen()
    await this.assertCurrentUrlPublic('Browser lease current URL before type')
    const ref = normalizedRef(input.ref)
    const locator = this.locatorFor(ref)
    const text = input.text.slice(0, 20_000)
    try {
      await locator.fill(text)
      if (input.submit) {
        if (!locator.press) throw new Error('Browser lease cannot submit typed text.')
        await locator.press('Enter')
      }
    } finally {
      this.refs.clear()
    }
    await this.assertCurrentUrlPublic('Browser lease current URL after type')
    return {
      ref,
      textLength: text.length,
      submitted: input.submit === true,
      taskProvided: typeof input.task === 'string' && input.task.trim().length > 0,
    }
  }

  async screenshot(input: {
    fullPage?: boolean
    artifactLabel?: string
  }): Promise<PlaywrightBrowserArtifact> {
    this.assertOpen()
    await this.assertCurrentUrlPublic('Browser lease current URL before screenshot')
    const artifactId = this.createArtifactId('browser_screenshot')
    const filePath = path.join(this.artifactRoot, `${artifactId}.png`)
    try {
      const returned = await this.options.page.screenshot({
        path: filePath,
        ...(typeof input.fullPage === 'boolean' ? { fullPage: input.fullPage } : {}),
      })
      if (!(await this.fileExists(filePath)) && isBytes(returned)) {
        await fs.writeFile(filePath, returned)
      }
      const byteLength = await this.assertArtifactSize(filePath)
      await this.assertCurrentUrlPublic('Browser lease current URL after screenshot')
      const artifactLabel = safeLabel(input.artifactLabel, 'Browser screenshot')
      this.emit({
        type: 'artifact.created',
        visibility: 'public',
        payload: {
          artifactId,
          kind: 'image',
          mediaType: 'image/png',
          artifactLabel,
          byteLength,
        },
      })
      return {
        artifactId,
        artifactLabel,
        mediaType: 'image/png',
        byteLength,
        url: `artifact://${artifactId}`,
      }
    } catch (error) {
      await fs.rm(filePath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  async close(): Promise<PlaywrightBrowserLeaseCloseResult> {
    if (this.closeResult) return this.closeResult
    this.closed = true
    this.refs.clear()
    let traceArtifactId: string | undefined
    let traceBytes: number | undefined
    let traceError = false

    if (this.tracingStarted && this.options.context?.tracing?.stop) {
      const candidateId = this.createArtifactId('browser_trace')
      const filePath = path.join(this.artifactRoot, `${candidateId}.zip`)
      try {
        await this.options.context.tracing.stop({ path: filePath })
        const bytes = await this.assertArtifactSize(filePath)
        traceArtifactId = candidateId
        traceBytes = bytes
        this.emit({
          type: 'artifact.created',
          visibility: 'public',
          payload: {
            artifactId: candidateId,
            kind: 'browser-trace',
            mediaType: 'application/zip',
            artifactLabel: 'Browser trace',
            byteLength: bytes,
          },
        })
      } catch {
        traceError = true
        await fs.rm(filePath, { force: true }).catch(() => undefined)
        this.emit({
          type: 'runtime.warning',
          visibility: 'public',
          payload: {
            message: 'Browser trace capture failed during lease release.',
            phase: 'browser.trace',
          },
        })
      }
    }

    if (this.options.closePage !== false && this.options.page.close) {
      await this.options.page.close().catch(() => undefined)
    }
    if (this.options.closeContext === true && this.options.context?.close) {
      await this.options.context.close().catch(() => undefined)
    }

    this.emit({
      type: 'browser.lease.released',
      visibility: 'public',
      payload: {
        leaseId: this.leaseId,
        runId: this.options.runId,
        sessionId: this.options.sessionId,
        status: 'released',
        ...(traceArtifactId ? { traceArtifactId } : {}),
      },
    })
    this.closeResult = {
      leaseId: this.leaseId,
      ...(traceArtifactId ? { traceArtifactId } : {}),
      ...(traceBytes !== undefined ? { traceBytes } : {}),
      ...(traceError ? { traceError: true } : {}),
    }
    return this.closeResult
  }

  private assertOpen(): void {
    if (!this.started) throw new Error('Browser lease has not been started.')
    if (this.closed) throw new Error('Browser lease is already closed.')
  }

  private async assertCurrentUrlPublic(label: string): Promise<string | undefined> {
    const currentUrl = this.currentUrl()
    if (!currentUrl) return undefined
    try {
      const url = parsePublicHttpUrl(currentUrl, label)
      await assertPublicNetworkTarget(url)
      return sanitizeBrowserUrl(url.toString())
    } catch (error) {
      await this.close().catch(() => undefined)
      throw error
    }
  }

  private locatorFor(ref: string): PlaywrightBrowserLocatorLike {
    if (!this.refs.has(ref)) {
      throw new Error(`Unknown browser element ref ${ref}; capture a fresh browser snapshot.`)
    }
    return this.options.page.locator(`[data-mainspring-ref="${ref.slice(1)}"]`)
  }

  private createArtifactId(prefix: string): string {
    return `${prefix}_${safePart(this.leaseId, 'lease')}_${randomUUID().replaceAll('-', '').slice(0, 16)}`
  }

  private async fileExists(filePath: string): Promise<boolean> {
    return await fs.stat(filePath).then(() => true).catch(() => false)
  }

  private async assertArtifactSize(filePath: string): Promise<number> {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0) {
      await fs.rm(filePath, { force: true }).catch(() => undefined)
      throw new Error('Browser artifact was not a non-empty file.')
    }
    if (stat.size > this.maxArtifactBytes) {
      await fs.rm(filePath, { force: true }).catch(() => undefined)
      throw new Error('Browser artifact exceeded the configured size limit.')
    }
    return stat.size
  }

  private emit(event: Parameters<RuntimeToolSessionEventEmitter>[0]): void {
    this.options.eventSink?.(event)
  }
}

export async function createPlaywrightBrowserRuntimeAdapter(
  options: PlaywrightBrowserRuntimeAdapterOptions,
): Promise<PlaywrightBrowserRuntimeAdapter> {
  const adapter = new PlaywrightBrowserRuntimeAdapter(options)
  await adapter.start()
  return adapter
}

export async function createPlaywrightBrowserToolSession(
  options: PlaywrightBrowserRuntimeAdapterOptions,
): Promise<RuntimeToolSession> {
  const adapter = await createPlaywrightBrowserRuntimeAdapter(options)
  return {
    tools: createBrowserTools({ adapter }),
    close: async () => {
      await adapter.close()
    },
  }
}

/** Bridges a host-owned Playwright lease factory into the RunLog executor. */
export function createPlaywrightBrowserToolSessionFactory(
  options: CreatePlaywrightBrowserToolSessionFactoryOptions,
): RuntimeToolSessionFactory {
  return async ({ run, workspaceRoot, signal, emitEvent }) => {
    assertBrowserSignalActive(signal)
    let adapter: PlaywrightBrowserRuntimeAdapter | undefined
    try {
      adapter = await options.createLease({ run, workspaceRoot, signal, emitEvent })
      assertBrowserSignalActive(signal)
    } catch (error) {
      await adapter?.close().catch(() => undefined)
      throw error
    }
    if (!adapter) throw new Error('Browser lease factory did not return an adapter.')
    const activeAdapter = adapter

    let closePromise: Promise<void> | undefined
    let onAbort: () => void = () => {}
    const close = async (): Promise<void> => {
      if (closePromise) return closePromise
      signal.removeEventListener('abort', onAbort)
      closePromise = activeAdapter.close().then(() => undefined)
      return closePromise
    }
    onAbort = () => {
      void close().catch(() => undefined)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      await close()
      throw browserCancellationError(signal)
    }
    return {
      tools: createBrowserTools({ adapter: activeAdapter }),
      close,
    }
  }
}
