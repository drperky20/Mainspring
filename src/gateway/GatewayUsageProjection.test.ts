import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunEvent, UsageUpdatedRunEventPayload } from '../contracts/runtime.js'
import type { RunLogEvent, RunRecord } from '../core/types.js'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import { GatewayUsageProjection } from './GatewayUsageProjection.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-usage-projection-'))
  tempRoots.push(root)
  return root
}

describe('GatewayUsageProjection', () => {
  it('projects native usage idempotently, prices it, and ignores malformed negative counters', () => {
    const root = tempRoot()
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const transitions: string[] = []
    const projection = new GatewayUsageProjection({
      appState,
      pricingCatalog: [{
        providerId: 'provider-test',
        modelId: 'model-test',
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
      }],
      evaluateBudgets: () => [{ budgetId: 'budget_test', status: 'ok' }],
      recordBudgetTransitions: (input) => transitions.push(input.entryId),
    })
    const event: RunEvent<UsageUpdatedRunEventPayload> = {
      eventId: 'native_usage_1',
      seq: 7,
      runId: 'run_native_usage',
      sessionId: 'session_native_usage',
      timestamp: '2026-07-11T00:00:00.000Z',
      type: 'usage.updated',
      payload: {
        inputTokens: 1_000,
        outputTokens: -50,
        totalTokens: 1_000,
      },
      visibility: 'public',
      traceId: 'trace_native_usage',
      spanId: 'span_native_usage',
    }

    try {
      projection.projectNativeEvent({
        event,
        providerInitDetail: {
          provider: 'provider-test',
          modelId: 'model-test',
          providerSessionId: 'provider_session_native',
        },
      })
      projection.projectNativeEvent({ event })

      expect(appState.usageLedger.list()).toEqual([
        expect.objectContaining({
          entryId: 'usage_native_usage_1',
          inputTokens: 1_000,
          totalTokens: 1_000,
          estimatedCostUsd: 0.001,
          providerId: 'provider-test',
          modelId: 'model-test',
        }),
      ])
      expect(appState.usageLedger.list()[0]?.outputTokens).toBeUndefined()
      expect(transitions).toEqual(['usage_native_usage_1'])
    } finally {
      appState.close()
    }
  })

  it('normalizes canonical RunLog usage and preserves source attribution', () => {
    const root = tempRoot()
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const projection = new GatewayUsageProjection({
      appState,
      pricingCatalog: [],
      evaluateBudgets: () => [],
      recordBudgetTransitions: () => undefined,
    })
    const run: RunRecord = {
      runId: 'run_runlog_usage',
      agentId: 'agent_runlog_usage',
      sessionId: 'session_runlog_usage',
      status: 'completed',
      input: 'Measure usage.',
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:01.000Z',
      workspaceId: 'workspace_runlog_usage',
      providerId: 'provider-fallback',
      modelId: 'model-fallback',
    }
    const event: RunLogEvent = {
      eventId: 'runlog_usage_1',
      seq: 11,
      runId: run.runId,
      agentId: run.agentId,
      sessionId: run.sessionId,
      type: 'usage.reported',
      timestamp: '2026-07-11T00:00:01.000Z',
      payload: {
        usage: {
          inputTokens: 80,
          outputTokens: 20,
          totalTokens: 100,
          cacheReadTokens: -1,
        },
        providerSessionId: 'provider_session_runlog',
      },
      visibility: 'public',
    }

    try {
      projection.projectRunLogEvent({
        event,
        run,
        providerInitPayload: {
          provider: 'provider-init',
          modelId: 'model-init',
        },
      })

      expect(appState.usageLedger.get('usage_runlog_runlog_usage_1')).toMatchObject({
        runId: run.runId,
        sessionId: run.sessionId,
        workspaceId: run.workspaceId,
        providerId: 'provider-init',
        modelId: 'model-init',
        inputTokens: 80,
        outputTokens: 20,
        totalTokens: 100,
        metadata: expect.objectContaining({
          runtime: 'runlog',
          sourceEventId: event.eventId,
          sourceSeq: event.seq,
          providerSessionId: 'provider_session_runlog',
        }),
      })
      expect(appState.usageLedger.get('usage_runlog_runlog_usage_1')?.metadata)
        .not.toHaveProperty('cacheReadTokens')
    } finally {
      appState.close()
    }
  })
})
