import { sanitizeRuntimeResponse } from '#protocol'
import { assertPublicNetworkTarget, parsePublicHttpUrl } from '../containment/UrlPolicy.js'
import { builtinManifest, inputRecord, positiveInt, type RuntimeTool } from './ToolRegistry.js'

export interface WebFetchToolOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
}

type SearchResult = {
  title: string
  url: string
  snippet?: string
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BYTES = 64 * 1024
const DEFAULT_MAX_SEARCH_RESULTS = 5
const DEFAULT_MAX_REDIRECTS = 5

function inputUrl(input: unknown): URL {
  const value = inputRecord(input, 'Web tool input must be an object.').url
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Web tool input.url must be a non-empty string.')
  }
  return parsePublicHttpUrl(value, 'Web tool input.url')
}

function inputQuery(input: unknown): string {
  const value = inputRecord(input, 'Web tool input must be an object.').query
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Web search input.query must be a non-empty string.')
  }
  return value.trim().slice(0, 500)
}

async function readCappedResponseText(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text()
    const bytes = Buffer.from(text, 'utf8')
    return {
      text: bytes.subarray(0, maxBytes).toString('utf8'),
      truncated: bytes.byteLength > maxBytes,
    }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytesRead = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    const remaining = maxBytes - bytesRead
    if (remaining <= 0) {
      truncated = true
      await reader.cancel()
      break
    }

    if (value.byteLength > remaining) {
      chunks.push(value.subarray(0, remaining))
      bytesRead += remaining
      truncated = true
      await reader.cancel()
      break
    }

    chunks.push(value)
    bytesRead += value.byteLength
  }

  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
  return {
    text,
    truncated,
  }
}

function readableTextFromHtml(html: string): { title?: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = decodeHtmlEntities(withoutScripts.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  return {
    title: title ? decodeHtmlEntities(title).replace(/\s+/g, ' ').trim() : undefined,
    text,
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function responseContentType(response: Response): string {
  return response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || 'text/plain'
}

function duckDuckGoSearchUrl(query: string): string {
  const url = new URL('https://duckduckgo.com/html/')
  url.searchParams.set('q', query)
  return url.toString()
}

function decodeSearchResultUrl(value: string): string {
  const decoded = decodeHtmlEntities(value.trim())
  try {
    const url = new URL(decoded)
    const redirect = url.searchParams.get('uddg')
    return redirect ? new URL(redirect).toString() : url.toString()
  } catch {
    return decoded
  }
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const resultPattern =
    /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>|<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi
  for (const match of html.matchAll(resultPattern)) {
    const url = decodeSearchResultUrl(match[1] ?? '')
    const title = stripHtml(match[2] ?? '')
    const snippet = stripHtml(match[3] ?? '')
    if (!url || !title) continue
    results.push({
      title,
      url,
      ...(snippet ? { snippet } : {}),
    })
    if (results.length >= maxResults) break
  }
  return results.filter((result) => {
    try {
      parsePublicHttpUrl(result.url, 'Web search result URL')
      return true
    } catch {
      return false
    }
  })
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Web request timed out after ${timeoutMs}ms.`))
  }, timeoutMs)

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

async function fetchPublicUrl(
  fetchImpl: typeof fetch,
  url: URL,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<{ response: Response; finalUrl: URL; redirectCount: number }> {
  let currentUrl = url

  for (let redirectCount = 0; redirectCount <= DEFAULT_MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicNetworkTarget(currentUrl)
    const response = await fetchWithTimeout(fetchImpl, currentUrl.toString(), timeoutMs, {
      ...init,
      redirect: 'manual',
    })

    if (!isRedirectStatus(response.status)) {
      return {
        response,
        finalUrl: currentUrl,
        redirectCount,
      }
    }

    const location = response.headers.get('location')
    if (!location) {
      return {
        response,
        finalUrl: currentUrl,
        redirectCount,
      }
    }

    if (redirectCount >= DEFAULT_MAX_REDIRECTS) {
      throw new Error(`Web request exceeded ${DEFAULT_MAX_REDIRECTS} redirects.`)
    }

    currentUrl = parsePublicHttpUrl(new URL(location, currentUrl).toString(), 'Web redirect target')
  }

  throw new Error(`Web request exceeded ${DEFAULT_MAX_REDIRECTS} redirects.`)
}

export function createWebSearchTool(options: WebFetchToolOptions = {}): RuntimeTool {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = positiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 60_000)
  const maxBytes = positiveInt(options.maxBytes, DEFAULT_MAX_BYTES, 256 * 1024)

  return {
    manifest: builtinManifest({
      key: 'web.search',
      name: 'Search Web',
      description: 'Searches the public web and returns sanitized result summaries.',
      permissions: { network: 'limited' },
      approval: {},
      toolType: 'web',
    }),
    execute: async ({ input }) => {
      const record = inputRecord(input, 'Web tool input must be an object.')
      const query = inputQuery(input)
      const maxResults = positiveInt(record.maxResults, DEFAULT_MAX_SEARCH_RESULTS, 10)
      const { response } = await fetchPublicUrl(
        fetchImpl,
        parsePublicHttpUrl(duckDuckGoSearchUrl(query), 'Web search URL'),
        timeoutMs,
        {
        method: 'GET',
        headers: {
          accept: 'text/html,*/*;q=0.2',
        },
        },
      )
      const body = await readCappedResponseText(response, maxBytes)
      return sanitizeRuntimeResponse({
        query,
        status: response.status,
        ok: response.ok,
        source: 'duckduckgo-html',
        results: parseDuckDuckGoResults(body.text, maxResults),
        truncated: body.truncated,
      })
    },
  }
}

export function createWebFetchTool(options: WebFetchToolOptions = {}): RuntimeTool {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = positiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 60_000)
  const defaultMaxBytes = positiveInt(options.maxBytes, DEFAULT_MAX_BYTES, 256 * 1024)

  return {
    manifest: builtinManifest({
      key: 'web.fetch',
      name: 'Fetch Web Page',
      description: 'Fetches and extracts text from a public web page under Mainspring policy.',
      permissions: { network: 'limited' },
      approval: {},
      toolType: 'web',
    }),
    execute: async ({ input }) => {
      const record = inputRecord(input, 'Web tool input must be an object.')
      const url = inputUrl(input)
      const maxBytes = positiveInt(record.maxBytes, defaultMaxBytes, 256 * 1024)

      const { response, finalUrl } = await fetchPublicUrl(fetchImpl, url, timeoutMs, {
        method: 'GET',
        headers: {
          accept: 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.2',
        },
      })
      const contentType = responseContentType(response)
      const body = await readCappedResponseText(response, maxBytes)
      const readable = contentType.includes('html')
        ? readableTextFromHtml(body.text)
        : { text: body.text.replace(/\s+/g, ' ').trim() }

      return sanitizeRuntimeResponse({
        url: finalUrl.toString(),
        status: response.status,
        ok: response.ok,
        contentType,
        title: readable.title,
        text: readable.text,
        truncated: body.truncated,
      })
    },
  }
}

export function createWebTools(options: WebFetchToolOptions = {}): RuntimeTool[] {
  return [createWebSearchTool(options), createWebFetchTool(options)]
}
