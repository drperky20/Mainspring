import { describe, expect, it, vi } from 'vitest'
import { createLocalGatewayClient } from './localGatewayClient'

describe('createLocalGatewayClient', () => {
  it('fetches OpenRouter models through the gateway catalog route', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'http://127.0.0.1:8787/providers/openrouter/models?q=sonnet&limit=10&supportedParameter=tools',
      )
      expect(init?.headers).toEqual({})
      return new Response(
        JSON.stringify({
          providerId: 'openrouter',
          source: 'openrouter-models-api',
          models: [
            {
              id: 'anthropic/claude-sonnet-4',
              name: 'Claude Sonnet 4',
              inputModalities: ['text'],
              outputModalities: ['text'],
              supportedParameters: ['tools'],
            },
          ],
        }),
        { status: 200 },
      )
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    await expect(
      client.openRouterModels({ q: 'sonnet', limit: 10, supportedParameter: 'tools' }),
    ).resolves.toMatchObject({
      providerId: 'openrouter',
      models: [{ id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' }],
    })
  })

  it('revalidates a snapshot with an in-memory ETag and accepts an empty 304 response', async () => {
    let requestCount = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestCount += 1
      expect(String(input)).toBe('http://127.0.0.1:8787/snapshot')
      if (requestCount === 1) {
        expect(init?.headers).toEqual({})
        return new Response(
          JSON.stringify({
            generatedAt: '2026-07-10T00:00:00.000Z',
            health: { ok: true, running: true, activeSessions: 0 },
            counts: {
              clients: 0,
              workspaces: 0,
              agents: 0,
              providerProfiles: 0,
              sessions: 0,
              runs: 0,
              storedApprovals: 0,
              artifacts: 0,
              cronSchedules: 0,
              budgets: 0,
              usageLedgerEntries: 0,
              auditEvents: 0,
              memoryEntries: 0,
              pendingApprovals: 0,
            },
            clients: [],
            workspaces: [],
            agents: [],
            providerProfiles: [],
            sessions: [],
            runs: [],
            approvals: [],
            approvalMetadata: [],
            artifacts: [],
            cronSchedules: [],
            budgets: [],
            budgetEvaluations: [],
            usageLedger: [],
            auditEvents: [],
            memoryEntries: [],
          }),
          { status: 200, headers: { etag: '"snapshot-v1"' } },
        )
      }
      expect(init?.headers).toEqual({ 'if-none-match': '"snapshot-v1"' })
      return new Response(null, { status: 304, headers: { etag: '"snapshot-v1"' } })
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    await expect(client.snapshotIfChanged()).resolves.toMatchObject({
      kind: 'updated',
      etag: '"snapshot-v1"',
      snapshot: { health: { ok: true, running: true } },
    })
    await expect(client.snapshotIfChanged({ etag: '"snapshot-v1"' })).resolves.toEqual({
      kind: 'not-modified',
      etag: '"snapshot-v1"',
    })
  })

  it('requests a bounded RunLog activity page with its opaque cursor', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'http://127.0.0.1:8787/runlog/runs?sessionId=session_activity&cursor=cursor_1&limit=25',
      )
      expect(init?.headers).toEqual({ authorization: 'Bearer hosted_token_1' })
      return new Response(
        JSON.stringify({
          runs: [
            {
              runId: 'run_activity_1',
              sessionId: 'session_activity',
              agentId: 'agent_activity',
              status: 'queued',
              createdAt: '2026-07-10T00:00:00.000Z',
              updatedAt: '2026-07-10T00:00:00.000Z',
              latestSeq: 3,
              eventCount: 3,
              pendingApprovalCount: 0,
              approvalDecisionCount: 0,
              toolCallCount: 0,
              checkpointCount: 0,
              policyDecisionCount: 0,
              errorCount: 0,
              pendingApprovals: [],
              toolCalls: [],
              checkpoints: [],
              policyDecisions: [],
              errors: [],
            },
          ],
          nextCursor: 'cursor_2',
        }),
        { status: 200 },
      )
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)
    client.setSessionToken('hosted_token_1')

    await expect(client.runLogRuns({
      sessionId: 'session_activity',
      cursor: 'cursor_1',
      limit: 25,
    })).resolves.toMatchObject({
      runs: [expect.objectContaining({ runId: 'run_activity_1' })],
      nextCursor: 'cursor_2',
    })
  })

  it('requests canonical RunLog tool-call history with its opaque cursor', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'http://127.0.0.1:8787/runlog/tool-calls?cursor=tool_cursor_1&limit=25',
      )
      expect(init?.headers).toEqual({ authorization: 'Bearer hosted_token_1' })
      return new Response(
        JSON.stringify({
          toolCalls: [{
            source: 'runlog',
            toolCallId: 'toolcall_opaque_1',
            runId: 'run_tool_history_1',
            sessionId: 'session_tool_history_1',
            agentId: 'agent_tool_history',
            toolName: 'file.write',
            status: 'completed',
            createdAt: '2026-07-10T00:00:00.000Z',
            updatedAt: '2026-07-10T00:00:01.000Z',
          }],
          nextCursor: 'tool_cursor_2',
        }),
        { status: 200 },
      )
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)
    client.setSessionToken('hosted_token_1')

    await expect(client.runLogToolCallHistory({
      cursor: 'tool_cursor_1',
      limit: 25,
    })).resolves.toMatchObject({
      toolCalls: [expect.objectContaining({
        source: 'runlog',
        toolCallId: 'toolcall_opaque_1',
        status: 'completed',
      })],
      nextCursor: 'tool_cursor_2',
    })
  })

  it('requests bounded usage history with an opaque cursor', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://127.0.0.1:8787/usage-history?cursor=usage_cursor_1&limit=25')
      expect(init?.headers).toEqual({ authorization: 'Bearer hosted_token_1' })
      return new Response(
        JSON.stringify({
          entries: [{
            entryId: 'usage_1',
            runId: 'run_usage_1',
            sessionId: 'session_usage_1',
            providerId: 'openrouter',
            modelId: 'openrouter/auto',
            totalTokens: 14,
            estimatedCostUsd: 0.001,
            createdAt: '2026-07-10T00:00:00.000Z',
          }],
          nextCursor: 'usage_cursor_2',
        }),
        { status: 200 },
      )
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)
    client.setSessionToken('hosted_token_1')

    await expect(client.usageHistory({ cursor: 'usage_cursor_1', limit: 25 })).resolves.toMatchObject({
      entries: [expect.objectContaining({ entryId: 'usage_1', totalTokens: 14 })],
      nextCursor: 'usage_cursor_2',
    })
  })

  it('requests bounded artifact history with an opaque cursor', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://127.0.0.1:8787/artifact-history?cursor=artifact_cursor_1&limit=25')
      expect(init?.headers).toEqual({ authorization: 'Bearer hosted_token_1' })
      return new Response(
        JSON.stringify({
          artifacts: [{
            artifactId: 'artifact_1',
            runId: 'run_artifact_1',
            sessionId: 'session_artifact_1',
            kind: 'report',
            label: 'Deployment report',
            mediaType: 'text/markdown',
            sizeBytes: 128,
            createdAt: '2026-07-10T00:00:00.000Z',
          }],
          nextCursor: 'artifact_cursor_2',
        }),
        { status: 200 },
      )
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)
    client.setSessionToken('hosted_token_1')

    await expect(client.artifactHistory({ cursor: 'artifact_cursor_1', limit: 25 })).resolves.toMatchObject({
      artifacts: [expect.objectContaining({ artifactId: 'artifact_1', kind: 'report' })],
      nextCursor: 'artifact_cursor_2',
    })
  })

  it('requests bounded audit history with an opaque cursor', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://127.0.0.1:8787/audit-history?cursor=audit_cursor_1&limit=25')
      expect(init?.headers).toEqual({ authorization: 'Bearer hosted_token_1' })
      return new Response(
        JSON.stringify({
          events: [{
            eventId: 'audit_1',
            category: 'gateway',
            action: 'client.updated',
            actor: 'operator',
            targetType: 'client',
            targetId: 'client_1',
            runId: 'run_1',
            sessionId: 'session_1',
            createdAt: '2026-07-10T00:00:00.000Z',
          }],
          nextCursor: 'audit_cursor_2',
        }),
        { status: 200 },
      )
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)
    client.setSessionToken('hosted_token_1')

    await expect(client.auditHistory({ cursor: 'audit_cursor_1', limit: 25 })).resolves.toMatchObject({
      events: [expect.objectContaining({ eventId: 'audit_1', action: 'client.updated' })],
      nextCursor: 'audit_cursor_2',
    })
  })

  it('requests bounded workspace memory history with an opaque cursor', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'http://127.0.0.1:8787/memory-history?workspaceId=workspace_memory_1&cursor=memory_cursor_1&limit=25',
      )
      expect(init?.headers).toEqual({ authorization: 'Bearer hosted_token_1' })
      return new Response(
        JSON.stringify({
          entries: [{
            entryId: 'memory_1',
            workspaceId: 'workspace_memory_1',
            scope: 'workspace',
            textPreview: 'Remember the current client preference.',
            tags: ['preference'],
            createdAt: '2026-07-10T00:00:00.000Z',
          }],
          nextCursor: 'memory_cursor_2',
        }),
        { status: 200 },
      )
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)
    client.setSessionToken('hosted_token_1')

    await expect(client.memoryHistory({
      workspaceId: 'workspace_memory_1',
      cursor: 'memory_cursor_1',
      limit: 25,
    })).resolves.toMatchObject({
      entries: [expect.objectContaining({ entryId: 'memory_1', scope: 'workspace' })],
      nextCursor: 'memory_cursor_2',
    })
  })

  it('corrects and deletes memory through opaque browser-safe entry routes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(init?.headers).toEqual({
        'content-type': 'application/json',
        authorization: 'Bearer hosted_token_1',
      })
      if (url.endsWith('/memory-history/memory_opaque_1/correct')) {
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe(JSON.stringify({
          workspaceId: 'workspace_memory_1',
          text: 'Corrected preference.',
          reason: 'Operator correction.',
        }))
        return new Response(JSON.stringify({
          entry: {
            entryId: 'memory_opaque_1',
            workspaceId: 'workspace_memory_1',
            scope: 'workspace',
            textPreview: 'Corrected preference.',
            tags: ['preference'],
            createdAt: '2026-07-10T00:00:00.000Z',
          },
        }), { status: 200 })
      }
      expect(url).toBe('http://127.0.0.1:8787/memory-history/memory_opaque_1/delete')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(JSON.stringify({
        workspaceId: 'workspace_memory_1',
        reason: 'No longer relevant.',
      }))
      return new Response(JSON.stringify({
        workspaceId: 'workspace_memory_1',
        entryId: 'memory_opaque_1',
        deleted: true,
        deletedAt: '2026-07-10T00:05:00.000Z',
      }), { status: 200 })
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)
    client.setSessionToken('hosted_token_1')

    await expect(client.correctMemoryEntry({
      workspaceId: 'workspace_memory_1',
      entryId: 'memory_opaque_1',
      text: 'Corrected preference.',
      reason: 'Operator correction.',
    })).resolves.toMatchObject({
      entry: expect.objectContaining({ entryId: 'memory_opaque_1' }),
    })
    await expect(client.deleteMemoryEntry({
      workspaceId: 'workspace_memory_1',
      entryId: 'memory_opaque_1',
      reason: 'No longer relevant.',
    })).resolves.toMatchObject({
      entryId: 'memory_opaque_1',
      deleted: true,
    })
  })

  it('fetches snapshot, run events, run start, and approval resolution through the expected routes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/snapshot')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            generatedAt: '2026-06-27T00:00:00.000Z',
            health: { ok: true, running: true, activeSessions: 1 },
            counts: {
              clients: 1,
              workspaces: 1,
              agents: 1,
              providerProfiles: 1,
              sessions: 1,
              runs: 0,
              storedApprovals: 0,
              artifacts: 0,
              cronSchedules: 0,
              budgets: 0,
              usageLedgerEntries: 0,
              auditEvents: 0,
              memoryEntries: 0,
              pendingApprovals: 0,
            },
            clients: [],
            workspaces: [],
            agents: [],
            providerProfiles: [],
            sessions: [],
            runs: [],
            approvals: [],
            approvalMetadata: [],
            artifacts: [],
            cronSchedules: [],
            budgets: [],
            budgetEvaluations: [],
            usageLedger: [],
            auditEvents: [],
            memoryEntries: [],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/auth/bootstrap')) {
        expect(init?.method).toBe('POST')
        return new Response(
          JSON.stringify({
            user: { userId: 'auth_user_1', username: 'admin', role: 'admin' },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/auth/login')) {
        expect(init?.method).toBe('POST')
        return new Response(
          JSON.stringify({
            user: { userId: 'auth_user_1', username: 'admin', role: 'admin' },
            expiresAt: '2026-06-28T12:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'x-mainspring-auth-token': 'hosted_token_1' },
          },
        )
      }
      if (url.endsWith('/auth/session')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            auth: {
              authMode: 'hosted',
              authenticated: true,
              bootstrapRequired: false,
              user: { userId: 'auth_user_1', username: 'admin', role: 'admin' },
              expiresAt: '2026-06-28T12:00:00.000Z',
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/auth/browser-access')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        const body = JSON.parse(String(init?.body)) as { kind: string; artifactId?: string; sessionId?: string; runId?: string }
        if (body.kind === 'event-stream') {
          expect(body).toMatchObject({
            kind: 'event-stream',
            sessionId: 'session_1',
            runId: 'run_1',
          })
          return new Response(
            JSON.stringify({
              kind: 'event-stream',
              url: 'http://127.0.0.1:8787/events/stream?sessionId=session_1&runId=run_1&ticket=ticket_2',
              expiresAt: '2026-06-28T12:05:00.000Z',
            }),
            { status: 201 },
          )
        }
        expect(body).toMatchObject({
          kind: 'artifact',
          artifactId: 'artifact_1',
        })
        return new Response(
          JSON.stringify({
            kind: 'artifact',
            url: 'http://127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1',
            expiresAt: '2026-06-28T12:05:00.000Z',
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/auth/logout')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(JSON.stringify({ loggedOut: true }), { status: 200 })
      }
      if (url.endsWith('/tool-calls?workspaceId=workspace_1')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            toolCalls: [
              {
                toolCallId: 'tool_call_1',
                runId: 'run_1',
                sessionId: 'session_1',
                workspaceId: 'workspace_1',
                toolName: 'browser.screenshot',
                status: 'completed',
                createdAt: '2026-06-27T00:02:00.000Z',
                updatedAt: '2026-06-27T00:03:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/deployment-targets?workspaceId=workspace_1')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            deploymentTargets: [
              {
                targetId: 'deployment_target_1',
                workspaceId: 'workspace_1',
                label: 'Northline staging VPS',
                kind: 'vps',
                status: 'active',
                createdAt: '2026-06-27T00:03:00.000Z',
                updatedAt: '2026-06-27T00:04:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/deployment-runs?targetId=deployment_target_1')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            deploymentRuns: [
              {
                deploymentRunId: 'deployment_run_1',
                targetId: 'deployment_target_1',
                runId: 'run_1',
                sessionId: 'session_1',
                status: 'succeeded',
                createdAt: '2026-06-27T00:04:00.000Z',
                updatedAt: '2026-06-27T00:05:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/deployment-targets') && init?.method === 'POST') {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            deploymentTarget: {
              targetId: 'deployment_target_2',
              workspaceId: 'workspace_1',
              label: 'Northline prod VPS',
              kind: 'vps',
              status: 'active',
              createdAt: '2026-06-27T00:04:30.000Z',
              updatedAt: '2026-06-27T00:04:30.000Z',
            },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/deployment-targets/deployment_target_2') && init?.method === 'PATCH') {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            deploymentTarget: {
              targetId: 'deployment_target_2',
              workspaceId: 'workspace_1',
              label: 'Northline prod VPS v2',
              kind: 'vps',
              status: 'archived',
              createdAt: '2026-06-27T00:04:30.000Z',
              updatedAt: '2026-06-27T00:04:45.000Z',
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/deployment-targets/deployment_target_2/plan')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            deploymentPlan: {
              operation: 'deploy',
              targetId: 'deployment_target_2',
              targetLabel: 'Northline prod VPS',
              targetKind: 'vps',
              summary: 'Deploy Northline runtime.',
              prerequisites: ['ssh available'],
              warnings: ['executes remote commands'],
              steps: [{ phase: 'local', label: 'Pack current package', commandPreview: 'npm pack --json --pack-destination [redacted]' }],
              releaseId: 'release-20260628010101',
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/deployment-targets/deployment_target_2/execute')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            deploymentRun: {
              deploymentRunId: 'deployment_run_2',
              targetId: 'deployment_target_2',
              status: 'succeeded',
              createdAt: '2026-06-27T00:05:00.000Z',
              updatedAt: '2026-06-27T00:06:00.000Z',
            },
            plan: {
              operation: 'deploy',
              targetId: 'deployment_target_2',
              targetLabel: 'Northline prod VPS',
              targetKind: 'vps',
              summary: 'Deploy Northline runtime.',
              prerequisites: ['ssh available'],
              warnings: ['executes remote commands'],
              steps: [],
            },
            execution: {
              ok: true,
              exitCode: 0,
              startedAt: '2026-06-27T00:05:00.000Z',
              completedAt: '2026-06-27T00:06:00.000Z',
              detail: 'Deployment completed for Northline prod VPS.',
            },
          }),
          { status: 202 },
        )
      }
      if (url.endsWith('/marketplace/templates')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            templates: [
              {
                templateId: 'coding-agent',
                label: 'Coding Agent',
                description: 'Workspace-first coding assistant.',
                trusted: true,
                provenance: 'repo-examples',
                providerId: 'openai',
                modelId: 'gpt-4.1-mini',
                runtimeProfile: 'core-browser-memory',
                allowedTools: ['file.read', 'file.write', 'shell.exec'],
                approvalMode: 'balanced',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/marketplace/remotes/sync')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            templates: [{
              templateId: 'remote-support',
              label: 'Remote Support',
              description: 'Signed remote template.',
              trusted: true,
              provenance: 'signed-remote',
              publisherId: 'publisher.example',
              keyId: 'release-2026',
              catalogHash: 'a'.repeat(64),
              allowedTools: ['file.read'],
            }],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/marketplace/templates/coding-agent/install')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            template: {
              templateId: 'coding-agent',
              label: 'Coding Agent',
            },
            client: { clientId: 'client_template', name: 'Coding Client', status: 'active' },
            workspace: {
              workspaceId: 'workspace_template',
              clientId: 'client_template',
              name: 'Coding Workspace',
              status: 'active',
            },
            session: {
              sessionId: 'session_template',
              status: 'open',
              createdAt: '2026-06-27T00:04:30.000Z',
              updatedAt: '2026-06-27T00:04:30.000Z',
            },
            agent: {
              agentId: 'agent_template',
              workspaceId: 'workspace_template',
              name: 'Coding Agent',
              version: '1.0.0',
              status: 'active',
            },
            installedFiles: ['agent.config.json'],
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/cells?workspaceId=workspace_1')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            cells: [
              {
                cellId: 'cell_1',
                workspaceId: 'workspace_1',
                label: 'Northline local cell',
                status: 'active',
                createdAt: '2026-06-27T00:05:00.000Z',
                updatedAt: '2026-06-27T00:06:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/cell-leases?cellId=cell_1')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            cellLeases: [
              {
                leaseId: 'lease_1',
                cellId: 'cell_1',
                runId: 'run_1',
                sessionId: 'session_1',
                status: 'active',
                createdAt: '2026-06-27T00:06:00.000Z',
                updatedAt: '2026-06-27T00:07:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/cells/status')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            cellStatus: {
              enabled: true,
              leaseTtlMs: 21600000,
              capacityEnforced: true,
              maxActiveLeasesPerCell: 1,
              cells: 1,
              leases: { active: 1, released: 0, expired: 0, total: 1 },
              lastCapacityBlock: {
                cellId: 'cell_1',
                workspaceId: 'workspace_1',
                requestedComputerId: 'computer_local',
                backend: 'host',
                activeLeases: 1,
                maxActiveLeases: 1,
                blockedAt: '2026-06-27T00:07:30.000Z',
              },
              cellStatuses: [
                {
                  cellId: 'cell_1',
                  workspaceId: 'workspace_1',
                  label: 'Northline local cell',
                  status: 'active',
                  activeLeases: 1,
                  releasedLeases: 0,
                  expiredLeases: 0,
                  maxActiveLeases: 1,
                  capacityAvailable: 0,
                  lastCapacityBlock: {
                    cellId: 'cell_1',
                    workspaceId: 'workspace_1',
                    requestedComputerId: 'computer_local',
                    backend: 'host',
                    activeLeases: 1,
                    maxActiveLeases: 1,
                    blockedAt: '2026-06-27T00:07:30.000Z',
                  },
                },
              ],
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/execution-backends/status')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            executionBackends: {
              generatedAt: '2026-06-27T00:08:00.000Z',
              defaultBackend: 'host',
              backends: [
                {
                  key: 'host',
                  label: 'Host shell',
                  available: true,
                  unsafe: true,
                  capabilities: {
                    isolationKind: 'host-process',
                    isolationStrength: 'none',
                    networkPolicy: 'host-inherited',
                  },
                  observedCells: 1,
                  activeLeases: 1,
                },
              ],
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/cell-snapshots?leaseId=lease_1')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            cellSnapshots: [
              {
                snapshotId: 'snapshot_1',
                cellId: 'cell_1',
                leaseId: 'lease_1',
                label: 'Post-login snapshot',
                createdAt: '2026-06-27T00:07:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/cron')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              cronSchedule: {
                scheduleId: 'schedule_1',
                sessionId: 'session_1',
                computerId: 'computer_wsl',
                label: 'Daily report',
                promptPreview: 'Build the morning report.',
                cronExpr: '0 9 * * 1',
                timezone: 'local',
                allowedTools: ['file.write'],
                enabled: true,
                nextRunAt: '2026-06-29T14:00:00.000Z',
                createdAt: '2026-06-27T00:07:00.000Z',
                updatedAt: '2026-06-27T00:07:00.000Z',
              },
            }),
            { status: 201 },
          )
        }
        return new Response(
          JSON.stringify({
            cronSchedules: [
              {
                scheduleId: 'schedule_1',
                sessionId: 'session_1',
                computerId: 'computer_wsl',
                label: 'Daily report',
                promptPreview: 'Build the morning report.',
                cronExpr: '0 9 * * 1',
                timezone: 'local',
                allowedTools: ['file.write'],
                enabled: true,
                nextRunAt: '2026-06-29T14:00:00.000Z',
                createdAt: '2026-06-27T00:07:00.000Z',
                updatedAt: '2026-06-27T00:07:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/cron/status')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            cron: {
              enabled: true,
              running: true,
              pollIntervalMs: 30000,
              lastTickAt: '2026-06-27T00:08:00.000Z',
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/budgets')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              budget: {
                budgetId: 'budget_1',
                scopeType: 'workspace',
                scopeId: 'workspace_1',
                label: 'Northline workspace budget',
                maxEstimatedCostUsd: 25,
                warnAtUsd: 20,
                status: 'active',
                createdAt: '2026-06-27T00:08:00.000Z',
                updatedAt: '2026-06-27T00:08:00.000Z',
              },
            }),
            { status: 201 },
          )
        }
        return new Response(
          JSON.stringify({
            budgets: [
              {
                budgetId: 'budget_1',
                scopeType: 'workspace',
                scopeId: 'workspace_1',
                label: 'Northline workspace budget',
                maxEstimatedCostUsd: 25,
                warnAtUsd: 20,
                status: 'active',
                createdAt: '2026-06-27T00:08:00.000Z',
                updatedAt: '2026-06-27T00:08:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/budgets/status')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            budgetStatus: {
              blocked: 0,
              warnings: 1,
              evaluations: [
                {
                  budgetId: 'budget_1',
                  scopeType: 'workspace',
                  scopeId: 'workspace_1',
                  label: 'Northline workspace budget',
                  scopeLabel: 'Northline Workspace',
                  status: 'warn',
                  maxEstimatedCostUsd: 25,
                  warnAtUsd: 20,
                  usedEstimatedCostUsd: 20.5,
                  remainingEstimatedCostUsd: 4.5,
                  usageEntryCount: 2,
                },
              ],
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/budgets/budget_1')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        if (init?.method === 'PATCH') {
          return new Response(
            JSON.stringify({
              budget: {
                budgetId: 'budget_1',
                scopeType: 'workspace',
                scopeId: 'workspace_1',
                label: 'Northline workspace budget v2',
                maxEstimatedCostUsd: 30,
                warnAtUsd: 24,
                status: 'archived',
                createdAt: '2026-06-27T00:08:00.000Z',
                updatedAt: '2026-06-27T00:09:00.000Z',
              },
            }),
            { status: 200 },
          )
        }
        if (init?.method === 'DELETE') {
          return new Response(JSON.stringify({ budgetId: 'budget_1', deleted: true }), { status: 200 })
        }
      }
      if (url.endsWith('/cron/schedule_1')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        if (init?.method === 'PATCH') {
          return new Response(
            JSON.stringify({
              cronSchedule: {
                scheduleId: 'schedule_1',
                sessionId: 'session_1',
                label: 'Daily report updated',
                promptPreview: 'Build the morning report.',
                cronExpr: '30 9 * * 1',
                timezone: 'local',
                allowedTools: ['file.write'],
                enabled: false,
                createdAt: '2026-06-27T00:07:00.000Z',
                updatedAt: '2026-06-27T00:09:00.000Z',
              },
            }),
            { status: 200 },
          )
        }
        if (init?.method === 'DELETE') {
          return new Response(JSON.stringify({ scheduleId: 'schedule_1', deleted: true }), { status: 200 })
        }
      }
      if (url.endsWith('/cron/schedule_1/run-now')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(JSON.stringify({ run: { runId: 'run_2', sessionId: 'session_1' } }), {
          status: 202,
        })
      }
      if (url.endsWith('/cron/schedule_1/grant')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        if (init?.method === 'POST') {
          expect(JSON.parse(String(init.body))).toMatchObject({
            expiresInMs: 60000,
            maxExecutionCount: 1,
            actor: 'console-operator',
          })
        }
        return new Response(
          JSON.stringify({
            cronGrant: {
              scheduleId: 'schedule_1',
              sessionId: 'session_1',
              agentId: 'agent_default',
              cronMode: 'allowlist',
              headless: true,
              grantRequired: true,
              grantPresent: init?.method === 'POST',
              scheduleKey: '0 9 * * 1|local',
              allowedTools: ['file.write'],
              decision: {
                decisionId: 'dr_cron_1',
                state: init?.method === 'POST' ? 'allow' : 'deny',
                reasons: init?.method === 'POST' ? [] : ['headless cron grant is missing'],
                permissionCategories: ['cron', 'headless', 'side-effecting'],
                inputHash: 'prompt_hash',
                manifestHash: 'manifest_hash',
                policyHash: 'policy_hash',
              },
              ...(init?.method === 'POST'
                ? {
                    grant: {
                      grantId: 'cron_grant_1',
                      mode: 'allowlist',
                      promptHash: 'prompt_hash',
                      scheduleHash: 'schedule_hash',
                      allowedTools: ['file.write'],
                      expiresAt: '2026-06-27T00:10:00.000Z',
                      maxExecutionCount: 1,
                      executionCount: 0,
                      createdAt: '2026-06-27T00:09:00.000Z',
                    },
                  }
                : {}),
            },
            ...(init?.method === 'POST'
              ? {
                  cronSchedule: {
                    scheduleId: 'schedule_1',
                    sessionId: 'session_1',
                    label: 'Daily report',
                    promptPreview: 'Build the morning report.',
                    cronExpr: '0 9 * * 1',
                    timezone: 'local',
                    allowedTools: ['file.write'],
                    enabled: true,
                    cronGrant: {
                      mode: 'allowlist',
                      grantId: 'cron_grant_1',
                      expiresAt: '2026-06-27T00:10:00.000Z',
                      executionCount: 0,
                      maxExecutionCount: 1,
                      allowedTools: ['file.write'],
                    },
                    createdAt: '2026-06-27T00:07:00.000Z',
                    updatedAt: '2026-06-27T00:09:00.000Z',
                  },
                }
              : {}),
          }),
          { status: init?.method === 'POST' ? 201 : 200 },
        )
      }
      if (url.endsWith('/clients')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            client: { clientId: 'client_1', name: 'Northline Dental', status: 'active' },
            workspace: {
              workspaceId: 'workspace_1',
              clientId: 'client_1',
              name: 'Northline Workspace',
              status: 'active',
            },
            session: {
              sessionId: 'session_1',
              status: 'open',
              createdAt: '2026-06-27T00:00:00.000Z',
              updatedAt: '2026-06-27T00:00:00.000Z',
              clientId: 'client_1',
              workspaceId: 'workspace_1',
            },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/workspaces')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            workspace: {
              workspaceId: 'workspace_2',
              clientId: 'client_1',
              name: 'Northline Follow-up',
              status: 'active',
            },
            session: {
              sessionId: 'session_2',
              status: 'open',
              createdAt: '2026-06-27T00:05:00.000Z',
              updatedAt: '2026-06-27T00:05:00.000Z',
              clientId: 'client_1',
              workspaceId: 'workspace_2',
            },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/workspaces/workspace_2')) {
        expect(init?.method).toBe('DELETE')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            workspaceId: 'workspace_2',
            deleted: true,
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/clients/client_2')) {
        expect(init?.method).toBe('DELETE')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            clientId: 'client_2',
            deleted: true,
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/clients/client_1')) {
        expect(init?.method).toBe('PATCH')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            client: { clientId: 'client_1', name: 'Northline Dental Group', status: 'archived' },
            workspace: {
              workspaceId: 'workspace_1',
              clientId: 'client_1',
              name: 'Northline Operations',
              status: 'archived',
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/agents')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            agent: {
              agentId: 'agent_1',
              workspaceId: 'workspace_1',
              name: 'Front desk assistant',
              version: '1.0.0',
              status: 'active',
              instructions: 'Stay plain [redacted]',
              skills: { 'File tools': true },
            },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/agents/agent_1')) {
        expect(init?.method).toBe('PATCH')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            agent: {
              agentId: 'agent_1',
              workspaceId: 'workspace_1',
              name: 'Front desk assistant v2',
              version: '1.1.0',
              status: 'active',
              instructions: 'Stay concise [redacted]',
              approvalMode: 'Ask first',
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/provider-profiles')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            providerProfile: {
              profileId: 'provider_profile_1',
              providerId: 'openrouter',
              label: 'OpenRouter Default',
              defaultModelId: 'openrouter/free',
              status: 'active',
              credentialState: 'configured',
            },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/provider-profiles/provider_profile_1')) {
        expect(init?.method).toBe('PATCH')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(
          JSON.stringify({
            providerProfile: {
              profileId: 'provider_profile_1',
              providerId: 'openrouter',
              label: 'OpenRouter Archived',
              defaultModelId: 'openrouter/free',
              status: 'archived',
              credentialState: 'missing',
            },
          }),
          { status: 200 },
        )
      }
      if (url.includes('/runs/run_1/events')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(JSON.stringify({ events: [{ type: 'run.started', runId: 'run_1' }] }), {
          status: 200,
        })
      }
      if (url.endsWith('/runs/start')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        expect(JSON.parse(String(init?.body))).toMatchObject({
          sessionId: 'session_1',
          input: 'Run now',
          mode: 'chat',
          allowedTools: ['file.read'],
          allowBudgetWarning: true,
          computerId: 'computer_wsl',
        })
        return new Response(JSON.stringify({ run: { runId: 'run_1', sessionId: 'session_1' } }), {
          status: 202,
        })
      }
      if (url.includes('/approvals/approval_1/resolve')) {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ authorization: 'Bearer hosted_token_1' })
        return new Response(JSON.stringify({ approvalId: 'approval_1', status: 'approved' }), {
          status: 200,
        })
      }
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            mode: 'local-gateway-hosted',
            health: { ok: true, running: true, activeSessions: 1 },
            auth: {
              authMode: 'hosted',
              authenticated: Boolean(init?.headers),
              bootstrapRequired: false,
              user: { userId: 'auth_user_1', username: 'admin', role: 'admin' },
            },
          }),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    await expect(
      client.bootstrapAuth({ username: 'admin', password: 'password123' }),
    ).resolves.toMatchObject({ user: { userId: 'auth_user_1' } })
    await expect(
      client.login({ username: 'admin', password: 'password123' }),
    ).resolves.toMatchObject({ user: { username: 'admin' } })
    expect(client.getSessionToken()).toBe('hosted_token_1')
    await expect(client.health()).resolves.toMatchObject({ mode: 'local-gateway-hosted' })
    await expect(client.authSession()).resolves.toMatchObject({
      auth: { authMode: 'hosted', authenticated: true, user: { username: 'admin' } },
    })
    await expect(client.snapshot()).resolves.toMatchObject({ counts: { clients: 1 } })
    await expect(client.browserAccessUrl({ kind: 'artifact', artifactId: 'artifact_1' })).resolves.toMatchObject({
      kind: 'artifact',
      url: 'http://127.0.0.1:8787/artifacts/artifact_1?ticket=ticket_1',
    })
    await expect(
      client.browserAccessUrl({ kind: 'event-stream', sessionId: 'session_1', runId: 'run_1' }),
    ).resolves.toMatchObject({
      kind: 'event-stream',
      url: 'http://127.0.0.1:8787/events/stream?sessionId=session_1&runId=run_1&ticket=ticket_2',
    })
    await expect(client.toolCalls({ workspaceId: 'workspace_1' })).resolves.toMatchObject({
      toolCalls: [expect.objectContaining({ toolCallId: 'tool_call_1' })],
    })
    await expect(client.deploymentTargets({ workspaceId: 'workspace_1' })).resolves.toMatchObject({
      deploymentTargets: [expect.objectContaining({ targetId: 'deployment_target_1' })],
    })
    await expect(client.deploymentRuns({ targetId: 'deployment_target_1' })).resolves.toMatchObject({
      deploymentRuns: [expect.objectContaining({ deploymentRunId: 'deployment_run_1' })],
    })
    await expect(
      client.createDeploymentTarget({
        workspaceId: 'workspace_1',
        label: 'Northline prod VPS',
        kind: 'vps',
        config: {
          sshHost: 'deploy.example.com',
          sshUser: 'ubuntu',
          remoteRoot: '/srv/mainspring',
          serviceName: 'mainspring-northline',
        },
      }),
    ).resolves.toMatchObject({
      deploymentTarget: {
        targetId: 'deployment_target_2',
        label: 'Northline prod VPS',
        kind: 'vps',
      },
    })
    await expect(
      client.updateDeploymentTarget({
        targetId: 'deployment_target_2',
        label: 'Northline prod VPS v2',
        status: 'archived',
        config: {
          sshHost: 'deploy.example.com',
          sshUser: 'ubuntu',
          remoteRoot: '/srv/mainspring',
          serviceName: 'mainspring-northline',
          envFilePath: '/etc/mainspring/northline.env',
        },
      }),
    ).resolves.toMatchObject({
      deploymentTarget: {
        targetId: 'deployment_target_2',
        status: 'archived',
      },
    })
    await expect(
      client.planDeployment({
        targetId: 'deployment_target_2',
        operation: 'deploy',
      }),
    ).resolves.toMatchObject({
      deploymentPlan: {
        targetId: 'deployment_target_2',
        operation: 'deploy',
        releaseId: 'release-20260628010101',
      },
    })
    await expect(
      client.executeDeployment({
        targetId: 'deployment_target_2',
        operation: 'deploy',
        confirm: 'deploy',
      }),
    ).resolves.toMatchObject({
      deploymentRun: {
        deploymentRunId: 'deployment_run_2',
        status: 'succeeded',
      },
      execution: {
        ok: true,
        exitCode: 0,
      },
    })
    const templates = await client.marketplaceTemplates()
    expect(templates).toMatchObject({
      templates: [expect.objectContaining({ templateId: 'coding-agent', trusted: true })],
    })
    expect(JSON.stringify(templates)).not.toContain('defaults')
    expect(JSON.stringify(templates)).not.toContain('seedFiles')
    await expect(client.syncRemoteMarketplace()).resolves.toMatchObject({
      templates: [expect.objectContaining({
        templateId: 'remote-support',
        provenance: 'signed-remote',
        publisherId: 'publisher.example',
      })],
    })
    await expect(
      client.installMarketplaceTemplate({
        templateId: 'coding-agent',
        workspaceRoot: 'E:/Mainspring/workspaces/template-coding',
      }),
    ).resolves.toMatchObject({
      template: { templateId: 'coding-agent', label: 'Coding Agent' },
      client: { clientId: 'client_template' },
      workspace: { workspaceId: 'workspace_template' },
      agent: { agentId: 'agent_template' },
      installedFiles: ['agent.config.json'],
    })
    await expect(client.cells({ workspaceId: 'workspace_1' })).resolves.toMatchObject({
      cells: [expect.objectContaining({ cellId: 'cell_1' })],
    })
    await expect(client.cellLeases({ cellId: 'cell_1' })).resolves.toMatchObject({
      cellLeases: [expect.objectContaining({ leaseId: 'lease_1' })],
    })
    await expect(client.cellStatus()).resolves.toMatchObject({
      cellStatus: {
        enabled: true,
        leases: { active: 1, released: 0, expired: 0, total: 1 },
        lastCapacityBlock: expect.objectContaining({ cellId: 'cell_1', activeLeases: 1 }),
        cellStatuses: [expect.objectContaining({ cellId: 'cell_1', activeLeases: 1 })],
      },
    })
    await expect(client.executionBackendStatus()).resolves.toMatchObject({
      executionBackends: {
        defaultBackend: 'host',
        backends: [expect.objectContaining({ key: 'host', observedCells: 1, activeLeases: 1 })],
      },
    })
    await expect(client.cellSnapshots({ leaseId: 'lease_1' })).resolves.toMatchObject({
      cellSnapshots: [expect.objectContaining({ snapshotId: 'snapshot_1' })],
    })
    await expect(client.cronSchedules()).resolves.toMatchObject({
      cronSchedules: [expect.objectContaining({ scheduleId: 'schedule_1' })],
    })
    await expect(client.cronStatus()).resolves.toMatchObject({
      cron: { enabled: true, running: true, pollIntervalMs: 30000 },
    })
    await expect(client.budgets()).resolves.toMatchObject({
      budgets: [expect.objectContaining({ budgetId: 'budget_1' })],
    })
    await expect(client.budgetStatus()).resolves.toMatchObject({
      budgetStatus: {
        blocked: 0,
        warnings: 1,
        evaluations: [expect.objectContaining({ budgetId: 'budget_1', status: 'warn' })],
      },
    })
    await expect(
      client.createClient({
        name: 'Northline Dental',
        workspaceRoot: 'E:/Mainspring/workspaces/northline-dental',
      }),
    ).resolves.toMatchObject({
      client: { clientId: 'client_1' },
      workspace: { workspaceId: 'workspace_1' },
      session: { sessionId: 'session_1', workspaceId: 'workspace_1' },
    })
    await expect(
      client.createWorkspace({
        clientId: 'client_1',
        name: 'Northline Follow-up',
        workspaceRoot: 'E:/Mainspring/workspaces/northline-follow-up',
      }),
    ).resolves.toMatchObject({
      workspace: { workspaceId: 'workspace_2', clientId: 'client_1' },
      session: { sessionId: 'session_2', workspaceId: 'workspace_2' },
    })
    await expect(
      client.deleteWorkspace({
        workspaceId: 'workspace_2',
      }),
    ).resolves.toEqual({
      workspaceId: 'workspace_2',
      deleted: true,
    })
    await expect(
      client.deleteClient({
        clientId: 'client_2',
      }),
    ).resolves.toEqual({
      clientId: 'client_2',
      deleted: true,
    })
    await expect(
      client.updateClient({
        clientId: 'client_1',
        name: 'Northline Dental Group',
        status: 'archived',
        workspaceId: 'workspace_1',
        workspaceName: 'Northline Operations',
        workspaceStatus: 'archived',
      }),
    ).resolves.toMatchObject({
      client: { clientId: 'client_1', name: 'Northline Dental Group', status: 'archived' },
      workspace: { workspaceId: 'workspace_1', name: 'Northline Operations', status: 'archived' },
    })
    await expect(
      client.createAgent({
        workspaceId: 'workspace_1',
        name: 'Front desk assistant',
      }),
    ).resolves.toMatchObject({
      agent: {
        agentId: 'agent_1',
        instructions: 'Stay plain [redacted]',
        skills: { 'File tools': true },
      },
    })
    await expect(
      client.updateAgent({
        agentId: 'agent_1',
        name: 'Front desk assistant v2',
        version: '1.1.0',
        instructions: 'Stay concise.',
      }),
    ).resolves.toMatchObject({
      agent: {
        agentId: 'agent_1',
        name: 'Front desk assistant v2',
        version: '1.1.0',
        instructions: 'Stay concise [redacted]',
        approvalMode: 'Ask first',
      },
    })
    await expect(
      client.createProviderProfile({
        providerId: 'openrouter',
        label: 'OpenRouter Default',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'openrouter/free',
      }),
    ).resolves.toMatchObject({
      providerProfile: {
        profileId: 'provider_profile_1',
        providerId: 'openrouter',
        label: 'OpenRouter Default',
        defaultModelId: 'openrouter/free',
        status: 'active',
        credentialState: 'configured',
      },
    })
    await expect(
      client.updateProviderProfile({
        profileId: 'provider_profile_1',
        label: 'OpenRouter Archived',
        status: 'archived',
      }),
    ).resolves.toMatchObject({
      providerProfile: {
        profileId: 'provider_profile_1',
        providerId: 'openrouter',
        label: 'OpenRouter Archived',
        defaultModelId: 'openrouter/free',
        status: 'archived',
        credentialState: 'missing',
      },
    })
    await expect(
      client.createCronSchedule({
        sessionId: 'session_1',
        label: 'Daily report',
        prompt: 'Build the morning report.',
        cronExpr: '0 9 * * 1',
        allowedTools: ['file.write'],
      }),
    ).resolves.toMatchObject({
      cronSchedule: { scheduleId: 'schedule_1', cronExpr: '0 9 * * 1' },
    })
    await expect(
      client.updateCronSchedule({
        scheduleId: 'schedule_1',
        label: 'Daily report updated',
        cronExpr: '30 9 * * 1',
        enabled: false,
      }),
    ).resolves.toMatchObject({
      cronSchedule: { scheduleId: 'schedule_1', enabled: false, cronExpr: '30 9 * * 1' },
    })
    await expect(client.runCronNow({ scheduleId: 'schedule_1' })).resolves.toMatchObject({
      run: { runId: 'run_2', sessionId: 'session_1' },
    })
    await expect(client.cronGrant({ scheduleId: 'schedule_1' })).resolves.toMatchObject({
      cronGrant: {
        scheduleId: 'schedule_1',
        grantRequired: true,
        grantPresent: false,
        decision: { state: 'deny' },
      },
    })
    await expect(
      client.createCronGrant({
        scheduleId: 'schedule_1',
        expiresInMs: 60_000,
        maxExecutionCount: 1,
        actor: 'console-operator',
      }),
    ).resolves.toMatchObject({
      cronGrant: {
        scheduleId: 'schedule_1',
        grantPresent: true,
        decision: { state: 'allow' },
        grant: { grantId: 'cron_grant_1', maxExecutionCount: 1 },
      },
      cronSchedule: {
        scheduleId: 'schedule_1',
        cronGrant: { grantId: 'cron_grant_1' },
      },
    })
    await expect(client.deleteCronSchedule({ scheduleId: 'schedule_1' })).resolves.toEqual({
      scheduleId: 'schedule_1',
      deleted: true,
    })
    await expect(
      client.createBudget({
        scopeType: 'workspace',
        scopeId: 'workspace_1',
        label: 'Northline workspace budget',
        maxEstimatedCostUsd: 25,
        warnAtUsd: 20,
      }),
    ).resolves.toMatchObject({
      budget: { budgetId: 'budget_1', maxEstimatedCostUsd: 25 },
    })
    await expect(
      client.updateBudget({
        budgetId: 'budget_1',
        label: 'Northline workspace budget v2',
        maxEstimatedCostUsd: 30,
        warnAtUsd: 24,
        status: 'archived',
      }),
    ).resolves.toMatchObject({
      budget: { budgetId: 'budget_1', status: 'archived', maxEstimatedCostUsd: 30 },
    })
    await expect(client.deleteBudget({ budgetId: 'budget_1' })).resolves.toEqual({
      budgetId: 'budget_1',
      deleted: true,
    })
    await expect(
      client.startRun({
        sessionId: 'session_1',
        input: 'Run now',
        mode: 'chat',
        allowedTools: ['file.read'],
        allowBudgetWarning: true,
        computerId: 'computer_wsl',
      }),
    ).resolves.toMatchObject({ run: { runId: 'run_1' } })
    await expect(client.runEvents({ sessionId: 'session_1', runId: 'run_1' })).resolves.toEqual({
      events: [{ type: 'run.started', runId: 'run_1' }],
    })
    await expect(
      client.resolveApproval({
        approvalId: 'approval_1',
        sessionId: 'session_1',
        runId: 'run_1',
        decision: 'approved',
      }),
    ).resolves.toMatchObject({ status: 'approved' })
    await expect(client.logout()).resolves.toEqual({ loggedOut: true })
    expect(client.getSessionToken()).toBeUndefined()
  })

  it('fetches provenance review routes with sanitized browser-facing payloads', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/provenance-reviews?workspaceId=workspace_1')) {
        return new Response(
          JSON.stringify({
            provenanceReviews: [
              {
                reviewId: 'review_1',
                workspaceId: 'workspace_1',
                kind: 'memory',
                status: 'pending',
                source: 'tool:memory.write',
                actor: 'agent_1',
                createdAt: '2026-07-01T00:00:00.000Z',
                updatedAt: '2026-07-01T00:00:00.000Z',
                mutation: {
                  kind: 'memory',
                  scope: 'workspace',
                  tags: ['weekly'],
                  textPreview: 'Remember concise weekly reports.',
                },
                scan: {
                  status: 'pass',
                  contentHash: 'hash_1',
                  findings: [],
                },
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/provenance-reviews/review_1/decision')) {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({
          workspaceId: 'workspace_1',
          decision: 'approved',
          reviewer: 'operator',
        })
        return new Response(
          JSON.stringify({
            provenanceReview: {
              reviewId: 'review_1',
              workspaceId: 'workspace_1',
              kind: 'memory',
              status: 'approved',
              source: 'tool:memory.write',
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-01T00:01:00.000Z',
              mutation: {
                kind: 'memory',
                scope: 'workspace',
                tags: ['weekly'],
                textPreview: 'Remember concise weekly reports.',
              },
              scan: {
                status: 'pass',
                contentHash: 'hash_1',
                findings: [],
              },
              decision: {
                decidedAt: '2026-07-01T00:01:00.000Z',
                reviewer: 'operator',
              },
            },
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/provenance-reviews/review_1/apply')) {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({
          workspaceId: 'workspace_1',
          reviewer: 'operator',
        })
        return new Response(
          JSON.stringify({
            provenanceReviewApply: {
              kind: 'memory',
              reviewId: 'review_1',
              memoryId: 'memory_1',
              applied: true,
            },
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ error: `Unexpected route ${url}` }), { status: 404 })
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    const listed = await client.provenanceReviews({ workspaceId: 'workspace_1' })
    const decided = await client.decideProvenanceReview({
      workspaceId: 'workspace_1',
      reviewId: 'review_1',
      decision: 'approved',
      reviewer: 'operator',
    })
    const applied = await client.applyProvenanceReview({
      workspaceId: 'workspace_1',
      reviewId: 'review_1',
      reviewer: 'operator',
    })

    expect(listed.provenanceReviews[0]?.mutation).toMatchObject({
      kind: 'memory',
      textPreview: 'Remember concise weekly reports.',
    })
    expect(decided.provenanceReview.status).toBe('approved')
    expect(applied.provenanceReviewApply).toMatchObject({
      kind: 'memory',
      memoryId: 'memory_1',
    })
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/provenance-reviews',
      '/provenance-reviews/review_1/decision',
      '/provenance-reviews/review_1/apply',
    ])
  })

  it('rejects successful gateway responses that contain browser-unsafe fields or host paths', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          generatedAt: '2026-06-27T00:00:00.000Z',
          health: { ok: true, running: true, activeSessions: 1 },
          workspaceRoot: 'E:/Mainspring/workspaces/hidden',
          artifact: {
            artifactId: 'artifact_1',
            artifactPath: 'C:\\Users\\drper\\.mainspring\\artifacts\\artifact_1.md',
            filePath: '/tmp/mainspring/artifacts/artifact_1.md',
          },
          dbPath: 'C:\\Users\\drper\\.mainspring\\gateway.sqlite',
        }),
        { status: 200 },
      ),
    )
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    await expect(client.snapshot()).rejects.toThrow(
      'Gateway response for /snapshot contained browser-unsafe data.',
    )
  })

  it('rejects successful gateway responses that contain Unix-style host paths without forbidden field names', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          generatedAt: '2026-07-01T00:00:00.000Z',
          health: { ok: true, running: true, activeSessions: 1 },
          note: 'artifact stored at /var/lib/mainspring/artifacts/report.md',
        }),
        { status: 200 },
      ),
    )
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    await expect(client.snapshot()).rejects.toThrow(
      'Gateway response for /snapshot contained browser-unsafe data.',
    )
  })

  it('rejects successful gateway responses that contain UNC host paths without forbidden field names', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          generatedAt: '2026-07-01T00:00:00.000Z',
          health: { ok: true, running: true, activeSessions: 1 },
          note: 'artifact stored at \\\\mainspring-host\\artifacts\\report.md',
        }),
        { status: 200 },
      ),
    )
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    await expect(client.snapshot()).rejects.toThrow(
      'Gateway response for /snapshot contained browser-unsafe data.',
    )
  })

  it('rejects successful gateway responses that contain provider key env markers', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          generatedAt: '2026-07-01T00:00:00.000Z',
          health: { ok: true, running: true, activeSessions: 1 },
          note: `provider credential ref env:OPENAI_API_${'KEY'}`,
        }),
        { status: 200 },
      ),
    )
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    await expect(client.snapshot()).rejects.toThrow(
      'Gateway response for /snapshot contained browser-unsafe data.',
    )
  })

  it('resolves RunLog approvals through the canonical public route', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'http://127.0.0.1:8787/runlog/approvals/approval_runlog_1/resolve',
      )
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        authorization: 'Bearer hosted_token_1',
      })
      expect(JSON.parse(String(init?.body))).toEqual({
        sessionId: 'session_1',
        runId: 'runlog_1',
        decision: 'approved',
        reason: 'Reviewed workspace write scope.',
      })
      return new Response(
        JSON.stringify({
          run: { runId: 'runlog_1', sessionId: 'session_1', status: 'completed' },
          status: 'completed',
          pendingApprovals: [],
        }),
        { status: 200 },
      )
    })
    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)
    client.setSessionToken('hosted_token_1')

    await expect(client.resolveRunLogApproval({
      approvalId: 'approval_runlog_1',
      sessionId: 'session_1',
      runId: 'runlog_1',
      decision: 'approved',
      reason: 'Reviewed workspace write scope.',
    })).resolves.toMatchObject({
      run: { runId: 'runlog_1', status: 'completed' },
      pendingApprovals: [],
    })
  })
})
