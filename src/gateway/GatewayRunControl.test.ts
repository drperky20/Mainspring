import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import { GatewayRunControl } from './GatewayRunControl.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

describe('GatewayRunControl', () => {
  it('writes hash-only run authority before enqueue and preserves the decision link on outcome', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-run-control-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })

    try {
      const control = new GatewayRunControl(appState)
      const secretPrompt = 'Run this with secretRef=env:RUN_CONTROL_SECRET'
      const authorization = control.authorizeEnqueue({
        sessionId: 'session_run_control',
        workspaceId: 'workspace_run_control',
        actor: 'hosted:run-control:admin',
        binding: {
          sessionId: 'session_run_control',
          input: secretPrompt,
          credentialRef: 'env:RUN_CONTROL_SECRET',
          allowedTools: ['file.write'],
        },
      })

      const authorizationEvents = appState.auditEvents.list({ category: 'gateway' })
      expect(authorizationEvents).toEqual([
        expect.objectContaining({
          action: 'run.enqueued.authorized',
          actor: 'hosted:run-control:admin',
          targetType: 'run-request',
          targetId: 'session_run_control',
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({
              operation: 'run.enqueue',
              surface: 'run',
              state: 'allow',
            }),
          }),
        }),
      ])
      expect(JSON.stringify(authorizationEvents)).not.toContain(secretPrompt)
      expect(JSON.stringify(authorizationEvents)).not.toContain('RUN_CONTROL_SECRET')

      const mutationSawAuthorization = appState.auditEvents.list({ category: 'gateway' }).some((event) => (
        event.action === 'run.enqueued.authorized'
      ))
      expect(mutationSawAuthorization).toBe(true)

      control.recordEnqueueOutcome({
        authorization,
        runId: 'run_run_control',
        runtime: 'runlog',
      })
      const events = appState.auditEvents.list({ category: 'gateway' })
      expect(events.map((event) => event.action)).toEqual([
        'run.enqueued.authorized',
        'runlog.run.enqueued',
      ])
      expect(events[1]).toMatchObject({
        actor: 'hosted:run-control:admin',
        targetId: 'run_run_control',
        metadata: expect.objectContaining({
          decisionId: authorization.decision.decisionId,
          runBindingHash: authorization.runBindingHash,
          runtime: 'runlog',
        }),
      })
    } finally {
      appState.close()
    }
  })

  it('records approval authority before resolution and never persists response contents', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-approval-control-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })

    try {
      const control = new GatewayRunControl(appState)
      const secretResponse = 'approval-response-secret'
      const authorization = control.authorizeApproval({
        approvalId: 'approval_run_control',
        runId: 'run_run_control',
        sessionId: 'session_run_control',
        decision: 'approved',
        actor: 'hosted:approval-control:operator',
        binding: { reason: 'Approved after review.', response: { secretResponse } },
      })
      const beforeResolution = appState.auditEvents.list({ category: 'gateway' })
      expect(beforeResolution[0]).toMatchObject({
        action: 'approval.approved.authorized',
        actor: 'hosted:approval-control:operator',
        targetId: 'approval_run_control',
        runId: 'run_run_control',
        metadata: expect.objectContaining({
          decisionRecord: expect.objectContaining({
            operation: 'approval.resolve',
            surface: 'approval',
            targetKey: 'approval_run_control',
          }),
        }),
      })
      expect(JSON.stringify(beforeResolution)).not.toContain(secretResponse)

      control.recordApprovalOutcome({
        authorization,
        receiptId: 'receipt_run_control',
      })
      const events = appState.auditEvents.list({ category: 'gateway' })
      expect(events.map((event) => event.action)).toEqual([
        'approval.approved.authorized',
        'approval.approved',
      ])
      expect(events[1]).toMatchObject({
        actor: 'hosted:approval-control:operator',
        metadata: expect.objectContaining({
          decisionId: authorization.decisionRecord.decisionId,
          resolutionBindingHash: authorization.resolutionBindingHash,
          receiptId: 'receipt_run_control',
        }),
      })
    } finally {
      appState.close()
    }
  })

  it('rejects missing authority identifiers before creating audit evidence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-run-control-invalid-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })

    try {
      const control = new GatewayRunControl(appState)
      expect(() => control.authorizeEnqueue({
        sessionId: '  ',
        binding: {},
      })).toThrow('run session id is required.')
      expect(() => control.authorizeApproval({
        approvalId: 'approval_run_control',
        runId: 'run_run_control',
        sessionId: '  ',
        decision: 'denied',
        binding: {},
      })).toThrow('approval session id is required.')
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual([])
    } finally {
      appState.close()
    }
  })
})
