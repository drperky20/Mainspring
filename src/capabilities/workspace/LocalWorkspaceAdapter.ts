import fs from 'node:fs'
import path from 'node:path'
import type { AgentSpec, RunRecord, WorkspaceAdapter, WorkspaceLease } from '../../core/types.js'

function safeWorkspaceSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

export class LocalWorkspaceAdapter implements WorkspaceAdapter {
  constructor(private readonly rootPath: string) {
    fs.mkdirSync(rootPath, { recursive: true })
  }

  lease(input: { run: RunRecord; agent: AgentSpec }): WorkspaceLease {
    const workspaceId = input.run.workspaceId ?? input.run.runId
    const root = path.resolve(
      input.run.workspaceRoot ?? path.join(this.rootPath, safeWorkspaceSegment(workspaceId)),
    )
    fs.mkdirSync(root, { recursive: true })
    return {
      runId: input.run.runId,
      workspaceId,
      root,
      materialized: true,
      release: () => {},
    }
  }
}
