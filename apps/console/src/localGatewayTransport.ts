import { isBrowserUnsafeBrowserAccessQueryKey } from 'mainspring/gateway/browser-safety'

export const defaultLocalGatewayUrl = 'http://127.0.0.1:8787'
export const localGatewayUrlSearchParam = 'mainspringGatewayUrl'

export function isAllowedLocalGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (url.username || url.password) return false
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  } catch {
    return false
  }
}

export function localGatewayUrlFromEnv(search = ''): string {
  const queryValue = new URLSearchParams(search).get(localGatewayUrlSearchParam)?.trim()
  if (queryValue && isAllowedLocalGatewayUrl(queryValue)) {
    return queryValue
  }

  const configured = import.meta.env.VITE_MAINSPRING_GATEWAY_URL?.trim()
  if (configured && isAllowedLocalGatewayUrl(configured)) {
    return configured
  }

  return defaultLocalGatewayUrl
}

export function localGatewayEventStreamUrl(
  baseUrl: string,
  input: { sessionId?: string; runId?: string; ticket?: string } = {},
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  const url = new URL(`${normalizedBaseUrl}/events/stream`)
  if (input.sessionId) url.searchParams.set('sessionId', input.sessionId)
  if (input.runId) url.searchParams.set('runId', input.runId)
  if (input.ticket) url.searchParams.set('ticket', input.ticket)
  return url.toString()
}

export function localGatewayArtifactUrl(
  baseUrl: string,
  artifactId: string,
  input: { ticket?: string } = {},
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  const url = new URL(`${normalizedBaseUrl}/artifacts/${encodeURIComponent(artifactId)}`)
  if (input.ticket) url.searchParams.set('ticket', input.ticket)
  return url.toString()
}

export function localGatewayArtifactDownloadUrl(
  baseUrl: string,
  artifactId: string,
  input: { ticket?: string } = {},
): string {
  const url = new URL(localGatewayArtifactUrl(baseUrl, artifactId, input))
  url.searchParams.set('download', '1')
  return url.toString()
}

export function deriveLocalGatewayArtifactAccessUrls(accessUrl: string): {
  previewUrl: string
  downloadUrl: string
} | undefined {
  try {
    const previewUrl = new URL(accessUrl)
    if (!isAllowedLocalGatewayUrl(previewUrl.toString())) return undefined
    if (!previewUrl.pathname.startsWith('/artifacts/')) return undefined
    if (hasUnsafeBrowserAccessQuery(previewUrl)) return undefined

    const downloadUrl = new URL(previewUrl)
    downloadUrl.searchParams.set('download', '1')
    return {
      previewUrl: previewUrl.toString(),
      downloadUrl: downloadUrl.toString(),
    }
  } catch {
    return undefined
  }
}

export function deriveLocalGatewayEventStreamAccessUrl(accessUrl: string): string | undefined {
  try {
    const streamUrl = new URL(accessUrl)
    if (!isAllowedLocalGatewayUrl(streamUrl.toString())) return undefined
    if (streamUrl.pathname !== '/events/stream') return undefined
    if (hasUnsafeBrowserAccessQuery(streamUrl)) return undefined
    return streamUrl.toString()
  } catch {
    return undefined
  }
}

function hasUnsafeBrowserAccessQuery(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (isBrowserUnsafeBrowserAccessQueryKey(key)) return true
  }
  return false
}
