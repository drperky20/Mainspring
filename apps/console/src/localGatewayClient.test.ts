import { describe, expect, it, vi } from 'vitest'
import { createLocalGatewayClient } from './localGatewayClient'

describe('createLocalGatewayClient', () => {
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
})
