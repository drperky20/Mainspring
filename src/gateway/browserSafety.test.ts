import { describe, expect, it } from 'vitest'
import {
  browserUnsafeBrowserAccessQueryKeys,
  browserUnsafeGatewayTextMarkers,
  browserUnsafeProviderCredentialMarkerPattern,
  browserUnsafeProviderCredentialMarkers,
  containsBrowserUnsafeGatewayText,
  isBrowserUnsafeBrowserAccessQueryKey,
  redactBrowserUnsafeGatewayText,
  redactBrowserUnsafeProviderCredentialMarkers,
} from './browserSafety.js'

describe('browser gateway safety helpers', () => {
  it('builds provider credential marker names from fragments', () => {
    const apiKey = `API_${'KEY'}`

    expect(browserUnsafeProviderCredentialMarkers()).toEqual([
      `OPENAI_${apiKey}`,
      `OPENROUTER_${apiKey}`,
      `ANTHROPIC_${apiKey}`,
      `GOOGLE_${apiKey}`,
      `GEMINI_${apiKey}`,
      `MISTRAL_${apiKey}`,
      `COHERE_${apiKey}`,
      `TOGETHER_${apiKey}`,
      `GROQ_${apiKey}`,
      `AZURE_OPENAI_${apiKey}`,
    ])
  })

  it('redacts provider credential marker names in browser-facing text', () => {
    const apiKey = `API_${'KEY'}`
    const text = `env:OPENAI_${apiKey} and env:ANTHROPIC_${apiKey}`

    expect(redactBrowserUnsafeProviderCredentialMarkers(text)).toBe(
      'env:[redacted] and env:[redacted]',
    )
    expect(browserUnsafeProviderCredentialMarkerPattern().test(`AZURE_OPENAI_${apiKey}`)).toBe(true)
  })

  it('exposes shared browser-unsafe gateway text markers', () => {
    const apiKey = `API_${'KEY'}`

    expect(browserUnsafeGatewayTextMarkers()).toEqual(
      expect.arrayContaining([
        'secretRef',
        'workspaceRoot',
        'artifactPath',
        'databasePath',
        `OPENROUTER_${apiKey}`,
        `ANTHROPIC_${apiKey}`,
        `BEGIN PRIVATE ${'KEY'}`,
      ]),
    )
  })

  it('redacts gateway path and secret markers in browser-facing text', () => {
    const apiKey = `API_${'KEY'}`
    const text =
      `failed workspaceRoot=E:/Mainspring/hidden artifactPath=C:\\secret\\artifact.md `
      + `databasePath=/var/lib/mainspring/gateway.sqlite env:OPENAI_${apiKey} `
      + `remoteRoot=/srv/mainspring`

    const redacted = redactBrowserUnsafeGatewayText(text)

    expect(redacted).not.toContain('workspaceRoot')
    expect(redacted).not.toContain('artifactPath')
    expect(redacted).not.toContain('databasePath')
    expect(redacted).not.toContain(`OPENAI_${apiKey}`)
    expect(redacted).not.toContain('E:/Mainspring')
    expect(redacted).not.toContain('C:\\secret')
    expect(redacted).not.toContain('/var/lib/mainspring')
    expect(redacted).not.toContain('/srv/mainspring')
  })

  it('detects browser-unsafe gateway text without duplicating regexes in callers', () => {
    expect(containsBrowserUnsafeGatewayText('relative trace path reports/next-step.txt')).toBe(
      false,
    )
    expect(containsBrowserUnsafeGatewayText('artifact at C:\\secret\\artifact.md')).toBe(true)
    expect(containsBrowserUnsafeGatewayText('artifact at /var/lib/mainspring/artifact.md')).toBe(
      true,
    )
    expect(containsBrowserUnsafeGatewayText(`BEGIN PRIVATE ${'KEY'}`)).toBe(true)
  })

  it('centralizes auth-like browser-access query keys for server and console URL checks', () => {
    expect(browserUnsafeBrowserAccessQueryKeys()).toEqual(
      expect.arrayContaining([
        'access-token',
        'access_token',
        'api-key',
        'api_key',
        'gateway-token',
        'gateway_token',
        'id-token',
        'id_token',
        'oauth-token',
        'oauth_token',
        'refresh-token',
        'refresh_token',
        'session-token',
        'session_token',
      ]),
    )
    expect(isBrowserUnsafeBrowserAccessQueryKey('session-token')).toBe(true)
    expect(isBrowserUnsafeBrowserAccessQueryKey('OAuth_Token')).toBe(true)
    expect(isBrowserUnsafeBrowserAccessQueryKey('ticket')).toBe(false)
    expect(isBrowserUnsafeBrowserAccessQueryKey('download')).toBe(false)
  })
})
