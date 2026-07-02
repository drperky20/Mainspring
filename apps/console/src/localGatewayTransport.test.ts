import { describe, expect, it } from 'vitest'
import {
  deriveLocalGatewayArtifactAccessUrls,
  deriveLocalGatewayEventStreamAccessUrl,
  defaultLocalGatewayUrl,
  isAllowedLocalGatewayUrl,
  localGatewayArtifactUrl,
  localGatewayArtifactDownloadUrl,
  localGatewayEventStreamUrl,
  localGatewayUrlFromEnv,
  localGatewayUrlSearchParam,
} from './localGatewayTransport'

describe('localGatewayTransport', () => {
  it('accepts only local http gateway URLs', () => {
    expect(isAllowedLocalGatewayUrl('http://127.0.0.1:8787')).toBe(true)
    expect(isAllowedLocalGatewayUrl('https://localhost:9443')).toBe(true)
    expect(isAllowedLocalGatewayUrl('http://192.168.1.10:8787')).toBe(false)
    expect(isAllowedLocalGatewayUrl('https://example.com')).toBe(false)
    expect(isAllowedLocalGatewayUrl('http://token@127.0.0.1:8787')).toBe(false)
    expect(isAllowedLocalGatewayUrl('http://operator:secret@localhost:8787')).toBe(false)
    expect(isAllowedLocalGatewayUrl('javascript:alert(1)')).toBe(false)
  })

  it('prefers a valid local query override and otherwise fails closed to the default URL', () => {
    expect(
      localGatewayUrlFromEnv(`?${localGatewayUrlSearchParam}=${encodeURIComponent('http://localhost:9999')}`),
    ).toBe('http://localhost:9999')
    expect(
      localGatewayUrlFromEnv(`?${localGatewayUrlSearchParam}=${encodeURIComponent('https://example.com')}`),
    ).toBe(defaultLocalGatewayUrl)
    expect(
      localGatewayUrlFromEnv(`?${localGatewayUrlSearchParam}=${encodeURIComponent('http://token@127.0.0.1:8787')}`),
    ).toBe(defaultLocalGatewayUrl)
  })

  it('builds the default event stream URL without extra params', () => {
    expect(localGatewayEventStreamUrl(defaultLocalGatewayUrl)).toBe(
      'http://127.0.0.1:8787/events/stream',
    )
  })

  it('includes session and run selectors for live trace streaming', () => {
    expect(
      localGatewayEventStreamUrl('http://127.0.0.1:8787/', {
        sessionId: 'session_1',
        runId: 'run_1',
        ticket: 'ticket_1',
      }),
    ).toBe(
      'http://127.0.0.1:8787/events/stream?sessionId=session_1&runId=run_1&ticket=ticket_1',
    )
  })

  it('builds an artifact URL without exposing filesystem paths', () => {
    expect(
      localGatewayArtifactUrl('http://127.0.0.1:8787/', 'artifact/report 1', {
        ticket: 'ticket_1',
      }),
    ).toBe(
      'http://127.0.0.1:8787/artifacts/artifact%2Freport%201?ticket=ticket_1',
    )
  })

  it('builds an artifact download URL without exposing filesystem paths', () => {
    expect(
      localGatewayArtifactDownloadUrl('http://127.0.0.1:8787/', 'artifact/report 1', {
        ticket: 'ticket_1',
      }),
    ).toBe(
      'http://127.0.0.1:8787/artifacts/artifact%2Freport%201?ticket=ticket_1&download=1',
    )
  })

  it('derives preview and download URLs only from local artifact browser-access routes', () => {
    expect(
      deriveLocalGatewayArtifactAccessUrls(
        'http://127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1',
      ),
    ).toEqual({
      previewUrl: 'http://127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1',
      downloadUrl: 'http://127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1&download=1',
    })

    expect(
      deriveLocalGatewayArtifactAccessUrls(
        'http://127.0.0.1:8787/events/stream?ticket=ticket_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayArtifactAccessUrls(
        'https://example.com/artifacts/artifact_1?ticket=ticket_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayArtifactAccessUrls(
        'http://127.0.0.1:8787/artifacts/artifact_1?sessionToken=hosted_token_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayArtifactAccessUrls(
        'http://127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1&session-token=hosted_token_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayArtifactAccessUrls(
        'http://127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1&access_token=hosted_token_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayArtifactAccessUrls(
        'http://token@127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1',
      ),
    ).toBeUndefined()
  })

  it('derives event stream URLs only from local event-stream browser-access routes', () => {
    expect(
      deriveLocalGatewayEventStreamAccessUrl(
        'http://127.0.0.1:8787/events/stream?sessionId=session_1&runId=run_1&ticket=ticket_1',
      ),
    ).toBe(
      'http://127.0.0.1:8787/events/stream?sessionId=session_1&runId=run_1&ticket=ticket_1',
    )
    expect(
      deriveLocalGatewayEventStreamAccessUrl(
        'http://localhost:8787/events/stream?ticket=ticket_1',
      ),
    ).toBe('http://localhost:8787/events/stream?ticket=ticket_1')

    expect(
      deriveLocalGatewayEventStreamAccessUrl(
        'http://127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayEventStreamAccessUrl(
        'https://example.com/events/stream?ticket=ticket_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayEventStreamAccessUrl(
        'http://127.0.0.1:8787/events/stream?gatewayToken=hosted_token_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayEventStreamAccessUrl(
        'http://127.0.0.1:8787/events/stream?sessionId=session_1&runId=run_1&ticket=ticket_1&id_token=hosted_token_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayEventStreamAccessUrl(
        'http://127.0.0.1:8787/events/stream?sessionId=session_1&runId=run_1&ticket=ticket_1&oauth-token=hosted_token_1',
      ),
    ).toBeUndefined()
    expect(
      deriveLocalGatewayEventStreamAccessUrl(
        'http://operator:secret@localhost:8787/events/stream?ticket=ticket_1',
      ),
    ).toBeUndefined()
  })
})
