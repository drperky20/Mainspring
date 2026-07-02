import { describe, expect, it } from 'vitest'
import { sanitizeGatewayResponse } from './sanitize.js'

describe('sanitizeGatewayResponse', () => {
  it('drops browser-unsafe secret and filesystem fields while keeping relative trace paths', () => {
    const sanitized = sanitizeGatewayResponse({
      providerProfile: {
        profileId: 'provider_profile_1',
        secretRef: 'env:OPENROUTER_API_KEY',
        secretValue: 'sk-managed-secret-value',
      },
      workspace: {
        workspaceId: 'workspace_1',
        workspaceRoot: 'E:/Mainspring/workspaces/northline',
        root: 'E:/Mainspring/workspaces/northline',
      },
      artifact: {
        artifactId: 'artifact_1',
        path: 'C:\\Users\\drper\\.mainspring\\artifacts\\artifact_1.md',
        databasePath: 'C:\\Users\\drper\\.mainspring\\gateway.sqlite',
        filePath: '/var/lib/mainspring/artifacts/artifact_1.md',
      },
      deploymentTarget: {
        targetId: 'deployment_target_1',
        remoteRoot: '/srv/mainspring',
        envFilePath: '/etc/mainspring/northline.env',
        caddyConfigPath: '/etc/caddy/northline.conf',
      },
      session: {
        sessionId: 'session_1',
        sessionPath: 'E:/Mainspring/.mainspring/sessions/session_1',
        mailboxPath: 'E:/Mainspring/.mainspring/sessions/session_1/inbound.db',
      },
      event: {
        type: 'tool_call',
        input: {
          path: 'notes/output.md',
          cwd: '.',
        },
      },
    })

    expect(sanitized).toEqual({
      providerProfile: {
        profileId: 'provider_profile_1',
      },
      workspace: {
        workspaceId: 'workspace_1',
      },
      artifact: {
        artifactId: 'artifact_1',
      },
      deploymentTarget: {
        targetId: 'deployment_target_1',
      },
      session: {
        sessionId: 'session_1',
      },
      event: {
        type: 'tool_call',
        input: {
          path: 'notes/output.md',
          cwd: '.',
        },
      },
    })
    expect(JSON.stringify(sanitized)).not.toContain('OPENROUTER_API_KEY')
    expect(JSON.stringify(sanitized)).not.toContain('sk-managed-secret-value')
    expect(JSON.stringify(sanitized)).not.toContain('E:/Mainspring')
    expect(JSON.stringify(sanitized)).not.toContain('C:\\Users')
    expect(JSON.stringify(sanitized)).not.toContain('/var/lib/mainspring')
  })

  it('redacts browser-unsafe markers and absolute paths embedded inside text payloads', () => {
    const sanitized = sanitizeGatewayResponse({
      runEvent: {
        type: 'runtime.warning',
        message:
          `failed at workspaceRoot=E:/Mainspring/browser-surface-hidden sessionPath=/tmp/mainspring/session mailboxPath=C:\\Users\\drper\\.mainspring\\mailbox env:OPENAI_API_${'KEY'}`,
        detail:
          `artifactPath=C:\\browser-surface-hidden\\artifact.md filePath=/srv/browser-surface-hidden/file.md databasePath=/var/lib/mainspring/gateway.sqlite dbPath=/tmp/mainspring/gateway.sqlite remoteRoot=/srv/mainspring envFilePath=/etc/mainspring/northline.env caddyConfigPath=/etc/caddy/northline.conf env:ANTHROPIC_API_${'KEY'}`,
      },
      browserAccess: {
        url: 'http://127.0.0.1:8787/events/stream?sessionId=session_1&ticket=already-redacted',
      },
    })
    const serialized = JSON.stringify(sanitized)

    expect(serialized).not.toContain('workspaceRoot=E:/Mainspring')
    expect(serialized).not.toContain('sessionPath=/tmp')
    expect(serialized).not.toContain('mailboxPath=C:\\Users')
    expect(serialized).not.toContain('artifactPath=C:\\browser-surface-hidden')
    expect(serialized).not.toContain('filePath=/srv/browser-surface-hidden')
    expect(serialized).not.toContain('databasePath=/var/lib/mainspring')
    expect(serialized).not.toContain('dbPath=/tmp')
    expect(serialized).not.toContain('remoteRoot=/srv/mainspring')
    expect(serialized).not.toContain('envFilePath=/etc/mainspring')
    expect(serialized).not.toContain('caddyConfigPath=/etc/caddy')
    expect(serialized).not.toContain(`OPENAI_API_${'KEY'}`)
    expect(serialized).not.toContain(`ANTHROPIC_API_${'KEY'}`)
    expect(serialized).not.toContain('/srv/browser-surface-hidden')
    expect(serialized).not.toContain('/srv/mainspring')
    expect(serialized).not.toContain('/etc/mainspring')
    expect(serialized).not.toContain('/etc/caddy')
    expect(serialized).not.toContain('C:\\browser-surface-hidden')
    expect(sanitized.browserAccess.url).toContain('/events/stream')
  })
})
