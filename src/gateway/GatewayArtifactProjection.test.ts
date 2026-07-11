import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunLogEvent, RunRecord as RunLogRunRecord } from '../core/types.js'
import type { RuntimeEventRow } from '../mailbox/SqliteMailbox.js'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import { GatewayArtifactProjection } from './GatewayArtifactProjection.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-artifact-projection-'))
  tempRoots.push(root)
  return root
}

function row(seq: number, event: RuntimeEventRow['event']): RuntimeEventRow {
  const runId = 'runId' in event && typeof event.runId === 'string'
    ? event.runId
    : 'run_artifact_projection'
  return {
    seq,
    runId,
    sessionId: 'session_artifact_projection',
    type: event.type,
    timestamp: '2026-07-11T00:00:00.000Z',
    event,
  }
}

function runLogEvent(input: {
  eventId: string
  seq: number
  runId: string
  type: RunLogEvent['type']
  payload: unknown
}): RunLogEvent {
  return {
    eventId: input.eventId,
    seq: input.seq,
    runId: input.runId,
    agentId: 'agent_artifact_projection',
    sessionId: 'session_artifact_projection',
    type: input.type,
    timestamp: '2026-07-11T00:00:00.000Z',
    payload: input.payload,
    visibility: 'artifact-only',
  }
}

function runLogRun(runId: string): RunLogRunRecord {
  return {
    runId,
    agentId: 'agent_artifact_projection',
    sessionId: 'session_artifact_projection',
    status: 'completed',
    input: 'Project artifacts.',
    workspaceId: 'workspace_artifact_projection',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:01.000Z',
  }
}

describe('GatewayArtifactProjection', () => {
  it('derives inventory paths from bounded runtime artifact IDs and remains idempotent', () => {
    const root = tempRoot()
    const artifactRoot = path.join(root, 'artifacts')
    fs.mkdirSync(artifactRoot, { recursive: true })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const projection = new GatewayArtifactProjection({ appState, rootPath: artifactRoot })
    const eventRow = row(4, {
      type: 'artifact.created',
      runId: 'run_artifact_projection',
      artifactId: 'report_1',
      kind: 'report',
    })

    try {
      projection.project({
        row: eventRow,
        runMetadata: {
          runId: eventRow.runId,
          sessionId: eventRow.sessionId,
          workspaceId: 'workspace_artifact_projection',
          createdAt: eventRow.timestamp,
          updatedAt: eventRow.timestamp,
        },
      })
      projection.project({ row: eventRow })
      projection.project({
        row: row(5, {
          type: 'artifact.created',
          runId: eventRow.runId,
          artifactId: '../outside',
          kind: 'report',
        }),
      })

      expect(appState.artifacts.list()).toEqual([
        expect.objectContaining({
          artifactId: 'report_1',
          path: path.resolve(artifactRoot, 'report_1'),
          workspaceId: 'workspace_artifact_projection',
          metadata: expect.objectContaining({
            sourceEventId: 'native:4',
            sourceType: 'artifact.created',
          }),
        }),
      ])
    } finally {
      appState.close()
    }
  })

  it('projects completed tool artifacts without accepting arbitrary host paths', () => {
    const root = tempRoot()
    const artifactRoot = path.join(root, 'artifacts')
    fs.mkdirSync(artifactRoot, { recursive: true })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const projection = new GatewayArtifactProjection({ appState, rootPath: artifactRoot })

    try {
      projection.project({
        row: row(9, {
          type: 'tool.result',
          runId: 'run_artifact_projection',
          toolCallId: 'tool_call_artifact_projection',
          name: 'browser.screenshot',
          status: 'completed',
          output: {
            artifactId: 'screenshot_1',
            artifactLabel: 'Run overview',
            mediaType: 'text/html',
            path: path.join(root, 'outside', 'secret.png'),
            url: 'artifact://screenshot-1',
          },
        }),
      })

      expect(appState.artifacts.get('screenshot_1')).toMatchObject({
        kind: 'image',
        label: 'Run overview',
        path: path.resolve(artifactRoot, 'screenshot_1'),
        mediaType: 'image/png',
        metadata: expect.objectContaining({
          sourceType: 'tool.result',
          toolName: 'browser.screenshot',
        }),
      })
      expect(JSON.stringify(appState.artifacts.get('screenshot_1'))).not.toContain('secret.png')
    } finally {
      appState.close()
    }
  })

  it('projects canonical RunLog artifacts idempotently without persisting provider paths', () => {
    const root = tempRoot()
    const artifactRoot = path.join(root, 'artifacts')
    fs.mkdirSync(artifactRoot, { recursive: true })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const projection = new GatewayArtifactProjection({ appState, rootPath: artifactRoot })
    const run = runLogRun('run_runlog_artifact_projection')
    const toolEvent = runLogEvent({
      eventId: 'evt_runlog_tool_artifact',
      seq: 7,
      runId: run.runId,
      type: 'tool.call.completed',
      payload: {
        toolCallId: 'tool_call_runlog_artifact',
        name: 'browser.screenshot',
        output: {
          artifactId: 'runlog_screenshot_1',
          artifactLabel: 'Canonical screenshot',
          mediaType: 'text/html',
          path: path.join(root, 'outside', 'provider-secret.html'),
          url: 'artifact://runlog-screenshot-1',
        },
      },
    })

    try {
      projection.projectRunLogEvent({ event: toolEvent, run })
      projection.projectRunLogEvent({ event: toolEvent, run })
      projection.projectRunLogEvent({
        event: runLogEvent({
          eventId: 'evt_runlog_escape',
          seq: 8,
          runId: run.runId,
          type: 'artifact.created',
          payload: {
            artifactId: '../outside-report',
            kind: 'file',
            path: path.join(root, 'outside', 'report.txt'),
          },
        }),
        run,
      })

      expect(appState.artifacts.list()).toEqual([
        expect.objectContaining({
          artifactId: 'runlog_screenshot_1',
          runId: run.runId,
          workspaceId: run.workspaceId,
          kind: 'image',
          path: path.resolve(artifactRoot, 'runlog_screenshot_1'),
          mediaType: 'image/png',
          metadata: expect.objectContaining({
            runtime: 'runlog',
            sourceEventId: toolEvent.eventId,
            sourceType: 'tool.call.completed',
            toolName: 'browser.screenshot',
          }),
        }),
      ])
      expect(JSON.stringify(appState.artifacts.get('runlog_screenshot_1'))).not.toContain('provider-secret')
      expect(appState.artifacts.get('../outside-report')).toBeNull()
    } finally {
      appState.close()
    }
  })
})
