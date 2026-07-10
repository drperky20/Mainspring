import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assertSafeMainspringConfigPatch,
  asRecord,
  assertSafeMainspringRuntimeProfile,
  ArtifactRecordSchema,
  ApprovalResponseInboundContentSchema,
  assertMailboxStoreOwner,
  BrowserEventSchema,
  buildApprovalResponseInboundContent,
  buildMainspringComputer,
  buildGatewayAcceptedMailboxResponse,
  buildGatewayComputerCommandResult,
  buildRunCancelInboundContent,
  mainspringComputerBrowserProfileRef,
  mainspringComputerContainerName,
  mainspringComputerIdFromRuntimeMetadata,
  mainspringComputerRuntimeCellMetadata,
  mainspringComputerStorageRefs,
  mainspringComputerVolumeRef,
  MainspringComputerSessionSchema,
  MainspringApprovalKindSchema,
  mainspringEventFromOutboundMailboxRow,
  MainspringNativeEventTypeSchema,
  mainspringRuntimeProfileIncludesBrowser,
  mainspringRuntimeProfileIncludesMemory,
  mainspringRuntimeProfileFromOptions,
  MainspringCapabilityDecisionSchema,
  MainspringControlMethodSchema,
  MainspringRuntimeDiagnosticsSchema,
  MainspringRuntimeDiagnosticStatusSchema,
  MainspringRuntimeSnapshotSchema,
  MAINSPRING_APP_MODEL_ID,
  MAINSPRING_APP_PROVIDER_ID,
  MAINSPRING_ALLOWED_MODEL_IDS,
  MAINSPRING_ALLOWED_PROVIDER_IDS,
  MAINSPRING_RUNTIME_PROFILES,
  coerceApprovalDecision,
  createMainspringRuntimeId,
  createMailboxMessageId,
  currentIsoTimestamp,
  DangerousConfigPatchKeys,
  DEFAULT_MAINSPRING_COMPUTER_DESIRED_STATE,
  DEFAULT_MAINSPRING_COMPUTER_DISPLAY_NAME,
  DEFAULT_MAINSPRING_COMPUTER_IMAGE_REF,
  DEFAULT_MAINSPRING_COMPUTER_STATUS,
  DEFAULT_MAINSPRING_COMPUTER_ROOT,
  DEFAULT_MAINSPRING_SESSIONS_ROOT,
  DEFAULT_MAINSPRING_WORKSPACE_ROOT,
  DEFAULT_MAINSPRING_RUNTIME_GATEWAY_PORT,
  DEFAULT_MAINSPRING_RUNTIME_PROFILE,
  DEFAULT_RUNTIME_CELL_IMAGE_REF,
  eventMailboxRowFromSql,
  GatewayAcceptedCancelSchema,
  GatewayAcceptedRunSchema,
  GatewayApprovalResolutionSchema,
  GatewayComputerCommandResultSchema,
  GatewayComputerStatusSchema,
  GatewayComputerLifecycleActionSchema,
  GatewayComputerHealthSchema,
  GatewayComputerHealthSessionStateSchema,
  GatewayComputerRuntimeStateSchema,
  GatewayRunFramesResponseSchema,
  GatewayRunOutboundResponseSchema,
  GatewayRunRouteSchema,
  getUnsafeMainspringConfigKeys,
  runtimeCellInternalGatewayUrl,
  runtimeCellContainerName,
  runtimeCellRuntimeContainerName,
  runtimeCellScopedVolumeRef,
  runtimeCellVolumeRef,
  GatewayRunDispatchSchema,
  INBOUND_MAILBOX_SCHEMA_SQL,
  inferRuntimeArtifactKind,
  inferRuntimeMimeType,
  inboundMailboxRowFromSql,
  isMainspringRuntimeProfile,
  isHostOwnedMailboxStore,
  isRunnerOwnedMailboxStore,
  MAILBOX_FILENAMES,
  MAILBOX_STORE_OWNERS,
  mailboxStoreOwner,
  MailboxStatusSchema,
  mailboxSessionIdFromSessionKey,
  normalizeMainspringRuntimeProfile,
  normalizeMainspringComputerDesiredState,
  normalizeMainspringComputerStatus,
  normalizeMainspringComputerResourceId,
  normalizeRuntimeBaseUrl,
  normalizeRuntimeWebSocketUrl,
  mainspringComputerDesiredStateForGatewayLifecycleAction,
  normalizeMailboxSessionId,
  OUTBOUND_MAILBOX_SCHEMA_SQL,
  SHARED_RUNTIME_CELL_CONTAINER_NAME,
  outboundMailboxRowFromSql,
  parseJsonRecord,
  parseJsonRecordOrNull,
  parseJsonValue,
  resolveMainspringComputerImageRef,
  resolveComputerSessionsRoot,
  resolveDefaultComputerSessionMailboxPaths,
  resolveRuntimeCellImageRef,
  resolveComputerSessionMailboxPaths,
  resolveSessionMailboxPaths,
  RunIntentSchema,
  RunCancelInboundContentSchema,
  RunStreamFrameSchema,
  MemoryEventSchema,
  ProviderEventSchema,
  RuntimeSecretRefSchema,
  runStreamFrameFromMailboxSqlRow,
  gatewayComputerStatusForLifecycleAction,
  jsonRecord,
  redactRuntimeSecrets,
  redactRuntimeSensitiveText,
  runtimeArtifactTypeLabel,
  sanitizeMailboxPathSegment,
  sanitizeRuntimeFilename,
  sanitizeRuntimeResponse,
  sanitizeRuntimeUrl,
  SkillManifestSchema,
  UserSkillInstallSchema,
  UserToolInstallSchema,
} from './index.js'
import {
  assertPathContained,
  resolveContainedComputerSessionMailboxPaths,
  resolveContainedSessionMailboxPaths,
} from './node.js'

const ts = '2026-05-16T12:00:00.000Z'
const ts1 = '2026-05-16T12:00:01.000Z'
const ts2 = '2026-05-16T12:00:02.000Z'
const inSql = (patch: Record<string, unknown> = {}) => ({
  id: 'in_1',
  run_id: 'run_1',
  session_id: 'run_run_1',
  kind: 'chat',
  timestamp: ts,
  status: 'pending',
  status_changed: null,
  process_after: null,
  recurrence: null,
  tries: 0,
  trigger: 1,
  content: '{"message":"hello"}',
  ...patch,
})
const outSql = (patch: Record<string, unknown> = {}) => ({
  id: 'out_1',
  run_id: 'run_1',
  session_id: 'run_run_1',
  in_reply_to: 'in_1',
  timestamp: ts2,
  delivered: 0,
  deliver_after: null,
  kind: 'assistant_message' as const,
  content: '{"text":"done"}',
  ...patch,
})
const outMsg = (patch: Record<string, unknown> = {}) => ({
  id: 'out_1',
  runId: 'run_1',
  sessionId: 'run_run_1',
  timestamp: ts2,
  delivered: false,
  kind: 'assistant_message' as const,
  content: '{"text":"done"}',
  ...patch,
})
const evSql = (patch: Record<string, unknown> = {}) => ({
  seq: 7,
  run_id: 'run_1',
  session_id: 'run_run_1',
  type: 'assistant.text.delta',
  timestamp: ts1,
  payload: JSON.stringify({ type: 'assistant.text.delta', runId: 'run_1', text: 'hi' }),
  ...patch,
})

describe('mainspring contracts', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('creates canonical ISO timestamps for Gateway and mailbox metadata', () => {
    expect(currentIsoTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('creates canonical mailbox message ids for host and runner writers', () => {
    expect(createMailboxMessageId('in')).toMatch(
      /^in_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(createMailboxMessageId('out')).toMatch(/^out_/)
    expect(createMainspringRuntimeId('tool_call')).toMatch(/^tool_call_/)
  })

  it('redacts runtime secrets through one canonical security helper', () => {
    expect(
      sanitizeRuntimeResponse({
        gatewayToken: 'gateway-secret',
        note: 'Bearer raw-token CLAW_GATEWAY_TOKEN=secret',
        nested: { apiKey: 'sk-secret-secret', safe: 'visible' },
        refs: {
          secretRef: 'env:ANTHROPIC_API_KEY',
          tokenRef: 'managed:browser-token',
          keyRef: 'provider-profile:profile_123',
        },
      }),
    ).toEqual({
      gatewayToken: '[redacted]',
      note: 'Bearer [redacted] CLAW_GATEWAY_TOKEN=[redacted]',
      nested: { apiKey: '[redacted]', safe: 'visible' },
      refs: {
        secretRef: '[redacted]',
        tokenRef: '[redacted]',
        keyRef: '[redacted]',
      },
    })
    expect(redactRuntimeSecrets({ token: 'secret' })).toEqual({ token: '[REDACTED]' })
    expect(redactRuntimeSensitiveText('apiKey=sk-secret-secret')).toBe('apiKey=[redacted]')
    expect(redactRuntimeSensitiveText('bad token wrong-secret-token')).toBe('bad token [redacted]')
    expect(sanitizeRuntimeUrl('http://user:pass@localhost:18790/?token=secret&ok=1')).toBe(
      'http://localhost:18790/?token=%5Bredacted%5D&ok=1',
    )
    expect(normalizeRuntimeBaseUrl(' http://localhost:18790/// ')).toBe('http://localhost:18790')
    expect(normalizeRuntimeWebSocketUrl(' https://gateway.local/events ')).toBe(
      'wss://gateway.local/events',
    )
    expect(normalizeRuntimeWebSocketUrl('http://gateway.local/events')).toBe(
      'ws://gateway.local/events',
    )
    expect(normalizeRuntimeWebSocketUrl('not a url')).toBe('not a url')
  })

  it('accepts only opaque runtime secret references in contracts', () => {
    for (const [raw, kind, key] of [
      ['env:ANTHROPIC_API_KEY', 'env', 'ANTHROPIC_API_KEY'],
      ['provider-profile:profile_123', 'provider-profile', 'profile_123'],
      ['managed:openrouter-default', 'managed', 'openrouter-default'],
    ] as const)
      expect(RuntimeSecretRefSchema.parse(raw)).toEqual({ kind, key })
    for (const raw of [
      'ANTHROPIC_API_KEY',
      'sk-ant-raw-secret',
      'secretref://mainspring/provider-profiles/1',
    ])
      expect(() => RuntimeSecretRefSchema.parse(raw)).toThrow()
  })

  it('parses runtime provider events without raw credentials', () => {
    expect(MAINSPRING_ALLOWED_PROVIDER_IDS).toEqual([MAINSPRING_APP_PROVIDER_ID])
    expect(MAINSPRING_ALLOWED_MODEL_IDS).toEqual([MAINSPRING_APP_MODEL_ID])

    expect(
      ProviderEventSchema.parse({
        type: 'init',
        provider: MAINSPRING_APP_PROVIDER_ID,
        providerSessionId: 'sess_123',
        modelId: MAINSPRING_APP_MODEL_ID,
      }),
    ).toMatchObject({ type: 'init', providerSessionId: 'sess_123' })

    expect(
      ProviderEventSchema.parse({
        type: 'init',
        provider: 'openai',
        providerSessionId: 'sess_123',
        modelId: 'gpt-5.5',
        modelFamily: 'gpt-5',
        providerTransport: 'openai-responses',
      }),
    ).toMatchObject({
      type: 'init',
      provider: 'openai',
      modelId: 'gpt-5.5',
      modelFamily: 'gpt-5',
      providerTransport: 'openai-responses',
    })

    const deltaEvent = ProviderEventSchema.parse({ type: 'delta', text: 'hello' })
    expect(deltaEvent).toMatchObject({ type: 'delta', text: 'hello' })

    const usageEvent = ProviderEventSchema.parse({
      type: 'usage',
      providerSessionId: 'resp_123',
      usage: {
        provider: 'openai',
        modelId: 'gpt-5.5',
        modelFamily: 'gpt-5',
        providerTransport: 'openai-responses',
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
        reasoningTokens: 2,
        rateLimit: {
          provider: 'openrouter',
          requestsMinute: { limit: 60, remaining: 58, resetSeconds: 12 },
        },
      },
    })
    expect(usageEvent).toMatchObject({
      type: 'usage',
      providerSessionId: 'resp_123',
      usage: {
        provider: 'openai',
        modelId: 'gpt-5.5',
        modelFamily: 'gpt-5',
        providerTransport: 'openai-responses',
        totalTokens: 14,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
        reasoningTokens: 2,
        rateLimit: {
          provider: 'openrouter',
          requestsMinute: { limit: 60, remaining: 58, resetSeconds: 12 },
        },
      },
    })

    expect(
      ProviderEventSchema.parse({
        type: 'tool_call',
        toolCallId: 'call_123',
        name: 'workspace.read',
        input: { path: 'README.md' },
      }),
    ).toMatchObject({ type: 'tool_call', name: 'workspace.read' })
    expect(
      ProviderEventSchema.parse({
        type: 'tool_result',
        toolCallId: 'call_123',
        name: 'workspace.read',
        output: { text: 'ok' },
      }),
    ).toMatchObject({ type: 'tool_result', name: 'workspace.read' })
    expect(ProviderEventSchema.parse({ type: 'progress', message: 'Thinking' })).toMatchObject({
      type: 'progress',
      message: 'Thinking',
    })

    expect(() =>
      ProviderEventSchema.parse({
        type: 'result',
        text: 'done',
        apiKey: 'sk-ant-raw-secret',
      }),
    ).toThrow()
    expect(() =>
      ProviderEventSchema.parse({
        type: 'error',
        message: 'bad token sk-ant-raw-secret',
        retryable: false,
      }),
    ).toThrow()
  })

  it('parses artifact, memory, and browser event records for mailbox persistence', () => {
    expect(
      ArtifactRecordSchema.parse({
        id: 'art_123',
        runId: 'run_123',
        kind: 'image',
        filename: '../screenshots/result.png',
        contentType: 'image/png',
        sizeBytes: 4096,
        createdAt: '2026-05-29T12:00:00.000Z',
        metadata: { source: 'browser.screenshot' },
      }),
    ).toMatchObject({ filename: 'result.png', kind: 'image' })

    expect(
      MemoryEventSchema.parse({
        type: 'memory.event',
        runId: 'run_123',
        action: 'write',
        memoryId: 'mem_123',
        metadata: { collection: 'user' },
      }).memoryId,
    ).toBe('mem_123')

    expect(
      BrowserEventSchema.parse({
        type: 'browser.event',
        runId: 'run_123',
        event: 'navigation',
        url: 'https://example.com/?token=secret&ok=1',
        payload: { authorization: 'Bearer raw-token', title: 'Example' },
      }),
    ).toMatchObject({
      url: 'https://example.com/?token=%5Bredacted%5D&ok=1',
      payload: { authorization: '[redacted]', title: 'Example' },
    })

    expect(() =>
      BrowserEventSchema.parse({
        type: 'browser.screenshot',
        runId: 'run_123',
        artifactId: 'art_123',
        cdpSessionId: 'raw-session',
      }),
    ).toThrow()
  })

  it('parses JSON records through one canonical helper', () => {
    expect(asRecord({ ok: true })).toEqual({ ok: true })
    expect(asRecord(['nope'])).toBeNull()
    expect(parseJsonRecord('{"source":"mailbox","seq":2}')).toEqual({
      source: 'mailbox',
      seq: 2,
    })
    expect(parseJsonRecord('[1,2,3]')).toEqual({})
    expect(parseJsonRecordOrNull('"text"')).toBeNull()
    expect(parseJsonValue('[1,2,3]', [])).toEqual([1, 2, 3])
    expect(parseJsonValue('not-json', { status: 'unknown' })).toEqual({ status: 'unknown' })
    expect(jsonRecord({ source: 'runtime' })).toEqual({ source: 'runtime' })
    expect(jsonRecord('[DONE]')).toBeNull()
  })

  it('normalizes runtime profiles from one canonical helper', () => {
    expect(DEFAULT_MAINSPRING_RUNTIME_PROFILE).toBe('core-browser-memory')
    expect(isMainspringRuntimeProfile('core-browser')).toBe(true)
    expect(isMainspringRuntimeProfile('browser')).toBe(false)
    expect(normalizeMainspringRuntimeProfile('core')).toBe('core')
    expect(normalizeMainspringRuntimeProfile('unknown')).toBe('core-browser-memory')
    expect(mainspringRuntimeProfileIncludesBrowser('core')).toBe(false)
    expect(mainspringRuntimeProfileIncludesBrowser('core-browser')).toBe(true)
    expect(mainspringRuntimeProfileIncludesMemory('core-browser')).toBe(false)
    expect(mainspringRuntimeProfileIncludesMemory('core-browser-memory')).toBe(true)
    expect(mainspringRuntimeProfileFromOptions({ allowBrowser: true })).toBe('core-browser')
    expect(mainspringRuntimeProfileFromOptions({ allowMemory: true })).toBe(
      'core-browser-memory',
    )
    expect(
      mainspringRuntimeProfileFromOptions({
        allowBrowser: false,
        allowMemory: true,
        runtimeProfile: 'core',
      }),
    ).toBe('core')
    expect(MAINSPRING_RUNTIME_PROFILES['core-browser-memory'].includes).toContain('memory')
    expect(MAINSPRING_RUNTIME_PROFILES.core.excludes).toContain('browser')
    const retiredUiLabel = ['retired-runtime', 'ui'].join('-')
    for (const profile of Object.values(MAINSPRING_RUNTIME_PROFILES)) {
      expect(profile.excludes).not.toContain(retiredUiLabel)
    }
  })

  it('normalizes Mainspring Computer status and desired state from one canonical helper', () => {
    expect(DEFAULT_MAINSPRING_COMPUTER_DISPLAY_NAME).toBe('My Mainspring Computer')
    expect(DEFAULT_MAINSPRING_COMPUTER_STATUS).toBe('stopped')
    expect(DEFAULT_MAINSPRING_COMPUTER_DESIRED_STATE).toBe('stopped')
    expect(DEFAULT_MAINSPRING_COMPUTER_IMAGE_REF).toBe('mainspring-computer:local')
    expect(resolveMainspringComputerImageRef({})).toBe('mainspring-computer:local')
    expect(resolveMainspringComputerImageRef({ MAINSPRING_COMPUTER_IMAGE: 'registry/computer:local' })).toBe(
      'registry/computer:local',
    )
    expect(resolveMainspringComputerImageRef({ MAINSPRING_COMPUTER_IMAGE: ' registry/computer:local ' })).toBe(
      'registry/computer:local',
    )
    expect(resolveMainspringComputerImageRef({ MAINSPRING_COMPUTER_IMAGE: '' })).toBe(
      'mainspring-computer:local',
    )
    expect(normalizeMainspringComputerResourceId('../cmp test')).toBe('_cmp_test')
    expect(mainspringComputerContainerName('cmp_123')).toBe('mainspring-computer-cmp_123')
    expect(mainspringComputerContainerName('../cmp test')).toBe('mainspring-computer-_cmp_test')
    expect(mainspringComputerIdFromRuntimeMetadata({ mainspringComputerId: ' cmp_123 ' })).toBe('cmp_123')
    expect(mainspringComputerIdFromRuntimeMetadata({ mainspringComputerId: '' })).toBeNull()
    expect(mainspringComputerIdFromRuntimeMetadata({ mainspringComputerId: 123 })).toBeNull()
    expect(mainspringComputerIdFromRuntimeMetadata(null)).toBeNull()
    expect(
      buildMainspringComputer({
        id: 'cmp_1',
        ownerId: 'usr_1',
        displayName: '  ',
        status: 'unknown',
        desiredState: 'unknown',
        runtimeProfile: 'unknown',
        imageRef: ' ',
        createdAt: '2026-05-16T12:00:00.000Z',
        updatedAt: '2026-05-16T12:01:00.000Z',
      }),
    ).toMatchObject({
      id: 'cmp_1',
      ownerId: 'usr_1',
      displayName: DEFAULT_MAINSPRING_COMPUTER_DISPLAY_NAME,
      status: DEFAULT_MAINSPRING_COMPUTER_STATUS,
      desiredState: DEFAULT_MAINSPRING_COMPUTER_DESIRED_STATE,
      runtimeProfile: DEFAULT_MAINSPRING_RUNTIME_PROFILE,
      imageRef: DEFAULT_MAINSPRING_COMPUTER_IMAGE_REF,
      metadata: {},
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:01:00.000Z',
    })
    expect(mainspringComputerVolumeRef('state', 'cmp_123')).toBe('mainspring-computer-state-cmp_123')
    expect(mainspringComputerVolumeRef('state', '../cmp test')).toBe(
      'mainspring-computer-state-_cmp_test',
    )
    expect(mainspringComputerVolumeRef('workspaces', 'cmp_123')).toBe(
      'mainspring-computer-workspaces-cmp_123',
    )
    expect(mainspringComputerBrowserProfileRef('cmp_123')).toBe('mainspring-computer-browser-cmp_123')
    expect(mainspringComputerStorageRefs('cmp_123')).toEqual({
      stateVolumeRef: 'mainspring-computer-state-cmp_123',
      workspaceVolumeRef: 'mainspring-computer-workspaces-cmp_123',
      sessionsVolumeRef: 'mainspring-computer-sessions-cmp_123',
      artifactVolumeRef: 'mainspring-computer-artifacts-cmp_123',
      browserProfileRef: 'mainspring-computer-browser-cmp_123',
    })
    expect(mainspringComputerRuntimeCellMetadata('rtc_123')).toEqual({
      runtimeCellId: 'rtc_123',
      runtimeBackingAdapter: 'runtime-cell',
    })
    expect(DEFAULT_RUNTIME_CELL_IMAGE_REF).toBe('mainspring-computer:local')
    expect(resolveRuntimeCellImageRef({})).toBe('mainspring-computer:local')
    expect(resolveRuntimeCellImageRef({ MAINSPRING_COMPUTER_IMAGE: ' registry/computer:local ' })).toBe(
      'registry/computer:local',
    )
    expect(
      resolveRuntimeCellImageRef({
        MAINSPRING_RUNTIME_IMAGE: ' registry/runtime:local ',
      }),
    ).toBe('mainspring-computer:local')
    expect(DEFAULT_MAINSPRING_RUNTIME_GATEWAY_PORT).toBe(8642)
    expect(SHARED_RUNTIME_CELL_CONTAINER_NAME).toBe('mainspring-runtime')
    expect(runtimeCellContainerName('rtc_123')).toBe('mainspring-runtime-rtc_123')
    expect(runtimeCellRuntimeContainerName('rtc_123')).toBe('mainspring-runtime-rtc_123')
    expect(runtimeCellRuntimeContainerName('rtc_123', { shared: true })).toBe('mainspring-runtime')
    expect(
      runtimeCellRuntimeContainerName('rtc_123', {
        shared: true,
        sharedContainerName: 'custom-runtime',
      }),
    ).toBe('custom-runtime')
    expect(runtimeCellInternalGatewayUrl('rtc_123')).toBe('http://mainspring-runtime-rtc_123:8642')
    expect(runtimeCellInternalGatewayUrl('rtc_123', { shared: true, port: 18790 })).toBe(
      'http://mainspring-runtime:18790',
    )
    expect(runtimeCellVolumeRef('state', 'rtc_123')).toBe('mainspring-runtime-state-rtc_123')
    expect(runtimeCellVolumeRef('workspace')).toBe('mainspring-runtime-workspace')
    expect(runtimeCellScopedVolumeRef('state', 'rtc_123')).toBe('mainspring-runtime-state-rtc_123')
    expect(runtimeCellScopedVolumeRef('state', 'rtc_123', { shared: true })).toBe(
      'mainspring-runtime-state',
    )
    expect(normalizeMainspringComputerStatus('running')).toBe('running')
    expect(normalizeMainspringComputerStatus('booting')).toBe('stopped')
    expect(normalizeMainspringComputerStatus(null, 'error')).toBe('error')
    expect(normalizeMainspringComputerDesiredState('suspended')).toBe('suspended')
    expect(normalizeMainspringComputerDesiredState('paused')).toBe('stopped')
    expect(normalizeMainspringComputerDesiredState(undefined, 'running')).toBe('running')
  })

  it('tracks product session keys and mailbox session ids separately', () => {
    const now = new Date(0).toISOString()
    expect(
      MainspringComputerSessionSchema.parse({
        id: 'cms_123',
        computerId: 'cmp_123',
        runId: 'run_123',
        workspaceId: 'wrk_123',
        agentId: 'agt_123',
        sessionKey: 'run:run_123',
        mailboxSessionId: 'run_run_123',
        mailboxPath: '/computer/sessions/run_run_123',
        status: 'active',
        providerSessionId: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({
      sessionKey: 'run:run_123',
      mailboxSessionId: 'run_run_123',
      mailboxPath: '/computer/sessions/run_run_123',
    })
  })

  it('parses the canonical run intent', () => {
    const parsed = RunIntentSchema.parse({
      workspaceId: 'wrk_123',
      agentId: 'agt_123',
      message: 'hello',
      systemPrompt: 'You are the published product agent.',
      mode: 'chat',
      approvalPolicy: 'balanced',
      clientContext: {
        route: '/home',
        lane: 'home',
        contextPack: {
          version: 1,
          strategy: 'latest-message-inline-session-memory',
          contentHash: 'abc123',
          latestMessageHash: 'def456',
          messageCount: 1,
          recentMessageCount: 1,
          latestMessageBytes: 5,
          historyBytes: 0,
          systemPromptBytes: 36,
          toolCount: 0,
          estimatedTokens: 10,
          packBytes: 300,
          summaryBytes: 0,
          summaryStrategy: 'metadata-only',
          delivery: {
            latestMessage: 'inline',
            history: 'none',
            systemPrompt: 'inline',
            files: 'manifest-refs',
          },
        },
      },
    })
    expect(parsed.systemPrompt).toBe('You are the published product agent.')
    expect(parsed.clientContext?.contextPack?.summaryStrategy).toBe('metadata-only')
    expect(parsed.runtimeOptions).toBeUndefined()

    expect(
      RunIntentSchema.parse({
        workspaceId: 'wrk_123',
        agentId: 'agt_123',
        message: 'hello',
        mode: 'chat',
        approvalPolicy: 'balanced',
        runtimeOptions: {
          providerId: 'openrouter',
          modelId: MAINSPRING_APP_MODEL_ID,
        },
      }).runtimeOptions?.modelId,
    ).toBe(MAINSPRING_APP_MODEL_ID)

    const routed = RunIntentSchema.parse({
      workspaceId: 'wrk_123',
      agentId: 'agt_123',
      message: 'hello',
      mode: 'chat',
      approvalPolicy: 'balanced',
      runtimeOptions: { providerId: 'openai', modelId: 'gpt-5.5' },
    })
    expect(routed.runtimeOptions).toMatchObject({
      providerId: 'openai',
      modelId: 'gpt-5.5',
    })
  })

  it('coerces approval decision aliases through one canonical helper', () => {
    for (const [raw, decision] of [
      ['approved', 'approved'],
      ['approve', 'approved'],
      ['allow', 'approved'],
      [true, 'approved'],
      ['denied', 'denied'],
      ['deny', 'denied'],
      ['rejected', 'denied'],
      ['reject', 'denied'],
      [false, 'denied'],
      ['maybe', null],
      [null, null],
    ] as const)
      expect(coerceApprovalDecision(raw)).toBe(decision)
    expect(MainspringApprovalKindSchema.options).toEqual(['exec', 'plugin'])
  })

  it('builds canonical inbound control message payloads for mailbox transport', () => {
    expect(buildRunCancelInboundContent({ runId: 'run_123' })).toEqual({
      type: 'run_cancel',
      runId: 'run_123',
      reason: 'cancelled by control plane',
    })
    expect(
      RunCancelInboundContentSchema.parse({
        type: 'run_cancel',
        runId: 'run_123',
        reason: 'user stopped it',
      }),
    ).toMatchObject({ reason: 'user stopped it' })

    const approval = buildApprovalResponseInboundContent({
      runId: 'run_123',
      computerId: 'cmp_123',
      sessionKey: 'default',
      approvalId: 'apr_123',
      decision: 'approved',
      response: { ok: true },
    })
    expect(approval).toMatchObject({
      type: 'approval_response',
      runId: 'run_123',
      approvalId: 'apr_123',
      decision: 'approved',
      response: { ok: true },
    })
    expect(
      ApprovalResponseInboundContentSchema.safeParse({ type: 'approval_response' }).success,
    ).toBe(false)
  })

  it('parses a gateway dispatch envelope', () => {
    const parsed = GatewayRunDispatchSchema.parse({
      runId: 'run_123',
      ownerId: 'usr_123',
      computerId: 'cmp_123',
      workspaceId: 'wrk_123',
      agentId: 'agt_123',
      sessionKey: 'default',
      idempotencyKey: 'dispatch-run-1',
      intent: {
        workspaceId: 'wrk_123',
        agentId: 'agt_123',
        message: 'run it',
        mode: 'task',
        approvalPolicy: 'ask-first',
      },
      policy: {
        approvalPolicy: 'ask-first',
        allowBrowser: true,
        allowMemory: true,
        allowedTools: ['browser_open'],
        redaction: 'strict',
      },
      trace: { requestId: 'req_123', source: 'console' },
    })

    expect(parsed.policy.allowedTools).toEqual(['browser_open'])
    expect(parsed.runtimeProfile).toBe('core-browser-memory')
    expect(parsed.idempotencyKey).toBe('dispatch-run-1')
    expect(
      GatewayRunDispatchSchema.parse({
        ...parsed,
        runtimeProfile: 'core',
      }).runtimeProfile,
    ).toBe('core')
  })

  it('parses Gateway accepted responses with explicit mailbox session ids', () => {
    expect(
      buildGatewayAcceptedMailboxResponse({
        runId: 'run_123',
        computerId: 'cmp_123',
        sessionKey: 'run:run_123',
        mailboxSessionId: 'run_run_123',
        messageId: 'in_123',
      }).mailboxSessionId,
    ).toBe('run_run_123')

    expect(
      GatewayAcceptedRunSchema.parse(
        buildGatewayAcceptedMailboxResponse({
          runId: 'run_123',
          computerId: 'cmp_123',
          sessionKey: 'run:run_123',
          mailboxSessionId: 'run_run_123',
          messageId: 'in_123',
        }),
      ).sessionId,
    ).toBe('run_run_123')

    expect(
      GatewayAcceptedCancelSchema.safeParse({
        status: 'accepted',
        runId: 'run_123',
        computerId: 'cmp_123',
        sessionKey: 'run:run_123',
        mailboxSessionId: 'run_run_123',
        sessionId: 'run:run_123',
        messageId: 'in_123',
      }).success,
    ).toBe(false)
  })

  it('parses Gateway approval resolution envelopes', () => {
    expect(
      GatewayApprovalResolutionSchema.parse({
        runId: 'run_1',
        computerId: 'cmp_1',
        sessionKey: 'run:run_1',
        approvalId: 'apr_1',
        decision: 'approved',
        response: { allow: true },
        idempotencyKey: 'approval-response-1',
      }).decision,
    ).toBe('approved')

    expect(
      GatewayApprovalResolutionSchema.safeParse({
        runId: 'run_1',
        computerId: 'cmp_1',
        sessionKey: 'run:run_1',
        approvalId: 'apr_1',
        decision: 'maybe',
      }).success,
    ).toBe(false)
  })

  it('parses Gateway run routing records', () => {
    expect(
      GatewayRunRouteSchema.parse({
        computerId: 'cmp_123',
        sessionKey: 'run:run_123',
        mailboxSessionId: 'run_run_123',
      }),
    ).toEqual({
      computerId: 'cmp_123',
      sessionKey: 'run:run_123',
      mailboxSessionId: 'run_run_123',
    })

    expect(
      GatewayRunRouteSchema.safeParse({
        computerId: 'cmp_123',
        sessionKey: '',
      }).success,
    ).toBe(false)
  })

  it('parses typed stream frames', () => {
    expect(MainspringNativeEventTypeSchema.parse('assistant.text.delta')).toBe(
      'assistant.text.delta',
    )
    expect(MainspringNativeEventTypeSchema.parse('browser.screenshot')).toBe('browser.screenshot')
    expect(MainspringNativeEventTypeSchema.parse('mainspring.ui.flow')).toBe('mainspring.ui.flow')
    expect(MainspringNativeEventTypeSchema.safeParse('mainspring_ui_flow').success).toBe(false)
    expect(MailboxStatusSchema.options).toEqual(['pending', 'processing', 'completed', 'failed'])

    expect(
      RunStreamFrameSchema.parse({
        seq: 1,
        cursor: 'events:1',
        runId: 'run_123',
        event: { type: 'assistant.text.delta', runId: 'run_123', text: 'hi' },
        createdAt: new Date(0).toISOString(),
      }).event.type,
    ).toBe('assistant.text.delta')

    expect(
      GatewayRunFramesResponseSchema.parse({
        runId: 'run_123',
        frames: [
          {
            seq: 1,
            cursor: 'events:1',
            runId: 'run_123',
            event: { type: 'assistant.text.done', runId: 'run_123', text: 'done' },
            createdAt: new Date(0).toISOString(),
          },
        ],
      }).frames,
    ).toHaveLength(1)
  })

  it('maps durable mailbox SQL rows through canonical contract helpers', () => {
    expect(inboundMailboxRowFromSql(inSql())).toMatchObject({
      id: 'in_1',
      runId: 'run_1',
      sessionId: 'run_run_1',
      kind: 'chat',
      status: 'pending',
      trigger: 1,
    })

    expect(outboundMailboxRowFromSql(outSql())).toEqual({
      id: 'out_1',
      runId: 'run_1',
      sessionId: 'run_run_1',
      inReplyTo: 'in_1',
      timestamp: '2026-05-16T12:00:02.000Z',
      delivered: false,
      deliverAfter: null,
      kind: 'assistant_message',
      content: '{"text":"done"}',
    })

    expect(
      GatewayRunOutboundResponseSchema.parse({
        runId: 'run_1',
        messages: [outMsg()],
      }).messages,
    ).toHaveLength(1)

    expect(
      mainspringEventFromOutboundMailboxRow({
        runId: 'run_1',
        message: outMsg(),
      }),
    ).toEqual({
      type: 'assistant.text.done',
      runId: 'run_1',
      text: 'done',
    })

    expect(
      mainspringEventFromOutboundMailboxRow({
        runId: 'run_1',
        message: outMsg({
          id: 'out_2',
          kind: 'file_result',
          content: '{"artifactId":"art_1","kind":"screenshot"}',
        }),
      }),
    ).toEqual({
      type: 'artifact.created',
      runId: 'run_1',
      artifactId: 'art_1',
      kind: 'screenshot',
    })

    const eventRow = evSql()

    expect(eventMailboxRowFromSql(eventRow)).toMatchObject({
      seq: 7,
      runId: 'run_1',
      sessionId: 'run_run_1',
      type: 'assistant.text.delta',
    })
    expect(runStreamFrameFromMailboxSqlRow(eventRow)).toEqual({
      seq: 7,
      cursor: 'events:7',
      runId: 'run_1',
      event: { type: 'assistant.text.delta', runId: 'run_1', text: 'hi' },
      createdAt: ts1,
    })
  })

  it('parses Gateway computer command and health responses without raw paths', () => {
    for (const method of [
      'sessions.stream',
      'agents.upsert',
      'cron.runNow',
      'browser.screenshot',
      'tools.effective',
    ])
      expect(MainspringControlMethodSchema.parse(method)).toBe(method)
    for (const method of ['config.patch', 'models.authStatus', 'browserless.publicCdp'])
      expect(() => MainspringControlMethodSchema.parse(method)).toThrow()

    expect(GatewayComputerStatusSchema.options).toEqual(['stopped', 'running', 'suspended'])
    expect(GatewayComputerLifecycleActionSchema.parse('wake')).toBe('wake')
    for (const [action, status, desiredState] of [
      ['wake', 'running', 'running'],
      ['suspend', 'suspended', 'suspended'],
    ] as const) {
      expect(gatewayComputerStatusForLifecycleAction(action)).toBe(status)
      expect(mainspringComputerDesiredStateForGatewayLifecycleAction(action)).toBe(desiredState)
    }
    expect(GatewayComputerHealthSessionStateSchema.options).toEqual(['healthy', 'stale', 'missing'])
    expect(GatewayComputerRuntimeStateSchema.options).toEqual([
      'missing',
      'idle',
      'healthy',
      'stale',
      'pending-heartbeat',
      'stuck-processing',
    ])

    expect(
      GatewayComputerCommandResultSchema.parse({
        id: 'cmp_1',
        root: '/should/not/leak',
        status: 'running',
        updatedAt: '2026-05-16T12:00:00.000Z',
      }),
    ).toEqual({
      id: 'cmp_1',
      status: 'running',
      updatedAt: '2026-05-16T12:00:00.000Z',
    })

    expect(
      buildGatewayComputerCommandResult({
        id: 'cmp_1',
        status: 'suspended',
        createdAt: '2026-05-16T12:00:00.000Z',
        updatedAt: '2026-05-16T12:01:00.000Z',
      }),
    ).toEqual({
      id: 'cmp_1',
      status: 'suspended',
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:01:00.000Z',
    })

    expect(
      GatewayComputerHealthSchema.parse({
        ok: false,
        computerId: 'cmp_1',
        status: 'running',
        runtimeState: 'stale',
        checkedAt: '2026-05-16T12:00:00.000Z',
        sessionCount: 1,
        staleSessions: 1,
        missingHeartbeats: 0,
        processingAcks: 1,
        staleProcessingAcks: 1,
        oldestProcessingAckAgeMs: 120000,
        root: '/should/not/leak',
        sessions: [
          {
            sessionId: 'default',
            state: 'stale',
            lastHeartbeatAt: '2026-05-16T11:58:00.000Z',
            ageMs: 120000,
            processingAcks: 1,
            staleProcessingAcks: 1,
            oldestProcessingAckAgeMs: 120000,
            heartbeatPath: '/should/not/leak',
          },
        ],
      }),
    ).toEqual({
      ok: false,
      computerId: 'cmp_1',
      status: 'running',
      runtimeState: 'stale',
      checkedAt: '2026-05-16T12:00:00.000Z',
      sessionCount: 1,
      staleSessions: 1,
      missingHeartbeats: 0,
      processingAcks: 1,
      staleProcessingAcks: 1,
      oldestProcessingAckAgeMs: 120000,
      sessions: [
        {
          sessionId: 'default',
          state: 'stale',
          lastHeartbeatAt: '2026-05-16T11:58:00.000Z',
          ageMs: 120000,
          processingAcks: 1,
          staleProcessingAcks: 1,
          oldestProcessingAckAgeMs: 120000,
        },
      ],
    })
  })

  it('owns Mainspring diagnostics, audit decisions, and config patch safety', () => {
    expect(MainspringCapabilityDecisionSchema.parse('wrap')).toBe('wrap')
    expect(MainspringCapabilityDecisionSchema.parse('forbid')).toBe('forbid')
    expect(() => MainspringCapabilityDecisionSchema.parse('maybe')).toThrow()

    expect(
      MainspringRuntimeDiagnosticsSchema.parse({
        status: 'degraded',
        profile: 'core-browser-memory',
        checkedAt: '2026-05-16T12:00:00.000Z',
        health: {
          status: 'stuck-processing',
          healthy: false,
          sessionCount: 1,
          processingAcks: 1,
          staleProcessingAcks: 1,
          oldestProcessingAckAgeMs: 120000,
        },
        issues: [{ severity: 'warning', message: 'Runner heartbeat is stale' }],
      }).issues,
    ).toHaveLength(1)
    expect(MainspringRuntimeDiagnosticStatusSchema.options).toEqual([
      'healthy',
      'degraded',
      'unavailable',
    ])

    expect(
      MainspringRuntimeSnapshotSchema.parse({
        health: { status: 'running', healthy: true },
        ready: { status: 'ready', healthy: true },
        browser: { enabled: true },
        models: { default: 'claude' },
        plugins: [{ key: 'filesystem' }],
        skills: [{ key: 'browser-helper' }],
        profile: 'core-browser-memory',
      }).profile,
    ).toBe('core-browser-memory')

    expect(DangerousConfigPatchKeys).toContain('gateway.controlUi.allowInsecureAuth')
    expect(assertSafeMainspringRuntimeProfile('core-browser-memory')).toBe('core-browser-memory')
    expect(
      assertSafeMainspringConfigPatch({
        patch: {
          'display.details_mode': 'collapsed',
          browser: { command_timeout: 45 },
        },
      }),
    ).toMatchObject({ patch: { 'display.details_mode': 'collapsed' } })

    expect(
      getUnsafeMainspringConfigKeys({
        'gateway.remote.url': 'http://evil.invalid',
        providers: { openai: { apiKey: 'sk-test' } },
        safe: { constructor: { prototype: { polluted: true } } },
      }),
    ).toEqual([
      'gateway.remote.url',
      'providers.openai.apiKey',
      'safe.constructor',
      'safe.constructor.prototype',
      'safe.constructor.prototype.polluted',
    ])

    expect(() =>
      assertSafeMainspringConfigPatch({
        patch: {
          'tools.fs.workspaceOnly': false,
        },
      }),
    ).toThrow(/Unsafe Mainspring config patch keys/)
  })

  it('requires manifest-backed skills', () => {
    expect(
      SkillManifestSchema.parse({
        key: 'browser-helper',
        name: 'Browser Helper',
        description: 'Browser actions through the Mainspring Computer.',
        version: '1.0.0',
        source: 'built-in',
        permissions: { browser: true, network: 'limited', filesystem: 'workspace-write' },
        approval: { required: true, dangerousPatterns: ['http://169.254.169.254'] },
      }).approval.required,
    ).toBe(true)
  })

  it('parses product skill and tool install records with manifests', () => {
    const now = new Date(0).toISOString()

    expect(
      UserSkillInstallSchema.parse({
        id: 'ski_123',
        userId: 'usr_123',
        computerId: 'cmp_123',
        skillKey: 'browser-helper',
        source: 'built-in',
        version: '1.0.0',
        enabled: true,
        manifest: {
          key: 'browser-helper',
          name: 'Browser Helper',
          description: 'Browser actions through the Mainspring Computer.',
          version: '1.0.0',
          source: 'built-in',
          permissions: { browser: true },
          approval: { required: true },
        },
        installedAt: now,
        updatedAt: now,
      }).manifest.key,
    ).toBe('browser-helper')

    expect(
      UserToolInstallSchema.parse({
        id: 'toi_123',
        userId: 'usr_123',
        computerId: 'cmp_123',
        toolKey: 'workspace-file',
        source: 'registry',
        version: null,
        manifest: {
          key: 'workspace-file',
          name: 'Workspace File',
          description: 'Read and write workspace files.',
          version: '1.0.0',
          source: 'registry',
          permissions: { filesystem: 'workspace-write' },
          approval: {},
          toolType: 'file',
        },
        installedAt: now,
        updatedAt: now,
      }).manifest.toolType,
    ).toBe('file')
  })

  it('exports mailbox SQL and canonical filenames', () => {
    expect(INBOUND_MAILBOX_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS messages_in')
    expect(OUTBOUND_MAILBOX_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS processing_ack')
    expect(DEFAULT_MAINSPRING_COMPUTER_ROOT).toBe('/computer')
    expect(DEFAULT_MAINSPRING_SESSIONS_ROOT).toBe('/sessions')
    expect(DEFAULT_MAINSPRING_WORKSPACE_ROOT).toBe('/workspaces/default')
    expect(MAILBOX_FILENAMES.events).toBe('events.db')
    expect(MAILBOX_STORE_OWNERS).toEqual({
      inbound: 'host',
      inbox: 'host',
      outbound: 'runner',
      events: 'runner',
      heartbeat: 'runner',
      outbox: 'runner',
    })
    for (const [store, owner] of [
      ['inbound', 'host'],
      ['events', 'runner'],
    ] as const)
      expect(mailboxStoreOwner(store)).toBe(owner)
    for (const [fn, store, ok] of [
      [isHostOwnedMailboxStore, 'inbox', true],
      [isHostOwnedMailboxStore, 'outbound', false],
      [isRunnerOwnedMailboxStore, 'outbox', true],
      [isRunnerOwnedMailboxStore, 'inbound', false],
    ] as const)
      expect(fn(store)).toBe(ok)
    expect(assertMailboxStoreOwner('inbound', 'host')).toBe('inbound')
    expect(() => assertMailboxStoreOwner('outbound', 'host')).toThrow(
      'Mailbox store "outbound" is runner-owned, not host-owned.',
    )
  })

  it('resolves canonical mailbox paths from one shared layout helper', () => {
    expect(sanitizeMailboxPathSegment('../session test', 'sessionKey')).toBe('_session_test')
    expect(mailboxSessionIdFromSessionKey('run:run_1')).toBe('run_run_1')
    expect(normalizeMailboxSessionId(' run_run_1 ')).toBe('run_run_1')
    expect(() => sanitizeMailboxPathSegment('...', 'sessionKey')).toThrow(
      'sessionKey does not contain a safe path segment.',
    )

    expect(resolveSessionMailboxPaths('/computer/sessions/default')).toMatchObject({
      sessionPath: '/computer/sessions/default',
      inboundDbPath: '/computer/sessions/default/inbound.db',
      outboundDbPath: '/computer/sessions/default/outbound.db',
      eventsDbPath: '/computer/sessions/default/events.db',
      heartbeatPath: '/computer/sessions/default/.heartbeat',
      inboxPath: '/computer/sessions/default/inbox',
      outboxPath: '/computer/sessions/default/outbox',
    })

    expect(resolveComputerSessionsRoot('/computer')).toBe('/computer/sessions')
    expect(resolveComputerSessionMailboxPaths('/computer', 'default')).toMatchObject({
      computerRoot: '/computer',
      sessionsRoot: '/computer/sessions',
      sessionPath: '/computer/sessions/default',
    })

    expect(resolveDefaultComputerSessionMailboxPaths('default')).toMatchObject({
      computerRoot: '/computer',
      sessionPath: '/computer/sessions/default',
      heartbeatPath: '/computer/sessions/default/.heartbeat',
    })

    expect(resolveDefaultComputerSessionMailboxPaths('run:run_1')).toMatchObject({
      computerRoot: '/computer',
      sessionPath: '/computer/sessions/run_run_1',
      heartbeatPath: '/computer/sessions/run_run_1/.heartbeat',
    })

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-contained-mailbox-'))
    tempRoots.push(root)
    const realRoot = fs.realpathSync.native(root)
    expect(resolveContainedComputerSessionMailboxPaths(root, '../session test')).toMatchObject({
      computerRoot: root,
      sessionsRoot: path.join(realRoot, 'sessions'),
      sessionPath: path.join(realRoot, 'sessions', '_session_test'),
      inboundDbPath: path.join(realRoot, 'sessions', '_session_test', 'inbound.db'),
      heartbeatPath: path.join(realRoot, 'sessions', '_session_test', '.heartbeat'),
    })

    const sessionsRoot = path.join(realRoot, 'sessions')
    expect(resolveContainedSessionMailboxPaths(sessionsRoot, 'default')).toMatchObject({
      sessionPath: path.join(sessionsRoot, 'default'),
      outboxPath: path.join(sessionsRoot, 'default', 'outbox'),
    })
  })

  it('sanitizes runtime artifact and attachment filenames from one helper', () => {
    for (const [input, output] of [
      ['../screenshots/My Shot!.png', 'My-Shot.png'],
      ['..\\uploads\\report final.md', 'report-final.md'],
      ['...', 'artifact'],
    ])
      expect(sanitizeRuntimeFilename(input)).toBe(output)
    expect(sanitizeRuntimeFilename('', 'upload')).toBe('upload')
  })

  it('infers runtime artifact MIME types from sanitized filenames', () => {
    for (const [file, mime] of [
      ['../screenshots/My Shot!.png', 'image/png'],
      ['report.final.MD', 'text/markdown'],
      ['data.json', 'application/json'],
      ['archive.bin', 'application/octet-stream'],
    ])
      expect(inferRuntimeMimeType(file)).toBe(mime)
    for (const [file, kind] of [
      ['photo.webp', 'image'],
      ['notes.md', 'file'],
    ])
      expect(inferRuntimeArtifactKind(file)).toBe(kind)
    for (const [file, label] of [
      ['report.final.MD', 'MD'],
      ['README', 'File'],
    ])
      expect(runtimeArtifactTypeLabel(file)).toBe(label)
  })

  it('checks path containment through one realpath-aware helper', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-contract-path-test-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-contract-path-outside-'))
    tempRoots.push(root, outside)

    expect(assertPathContained(root, path.join(root, 'computers', 'cmp_1'))).toBe(
      path.join(fs.realpathSync.native(root), 'computers', 'cmp_1'),
    )

    const link = path.join(root, 'link-out')
    fs.symlinkSync(outside, link, 'dir')

    expect(() => assertPathContained(root, path.join(link, 'sessions', 'default'))).toThrow(
      'Path escapes root',
    )
  })
})
