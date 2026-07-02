import { buildSubdirectoryHints, type SubdirectoryHint } from './SubdirectoryHints.js'
import {
  buildWorkspaceContext,
  type WorkspaceContextOptions,
  type WorkspaceContextSummary,
} from './WorkspaceContext.js'

export interface CodingContextOptions extends WorkspaceContextOptions {
  query?: string
  subdirectoryLimit?: number
  subdirectoryDepth?: number
}

export interface CodingContextSummary {
  workspace: WorkspaceContextSummary
  suggestedDirectories: SubdirectoryHint[]
  fileSafety: {
    workspaceOnly: true
    pathTraversalBlocked: true
    absoluteEscapeBlocked: true
    shellCwdContained: true
  }
}

export function buildCodingContext(
  workspaceRoot: string,
  options: CodingContextOptions = {},
): CodingContextSummary {
  return {
    workspace: buildWorkspaceContext(workspaceRoot, options),
    suggestedDirectories: buildSubdirectoryHints(workspaceRoot, {
      query: options.query,
      limit: options.subdirectoryLimit,
      maxDepth: options.subdirectoryDepth,
    }),
    fileSafety: {
      workspaceOnly: true,
      pathTraversalBlocked: true,
      absoluteEscapeBlocked: true,
      shellCwdContained: true,
    },
  }
}
