import fs from 'node:fs'
import path from 'node:path'
import { createMainspringRuntimeId, sanitizeRuntimeResponse } from '#protocol'
import { assertPathContained } from '#protocol/node'
import { classifyToolResult } from './ToolResultClassifier.js'

export const DEFAULT_INLINE_TOOL_RESULT_MAX_BYTES = 8 * 1024

export interface ToolResultStoragePrepared {
  output: unknown
  spilled: boolean
  bytes: number
  resultId?: string
  relativePath?: string
}

export class ToolResultStorage {
  constructor(
    private readonly options: {
      inlineMaxBytes?: number
      resultsDirectory?: string
    } = {},
  ) {}

  prepare(input: {
    runId: string
    workspaceRoot: string
    toolName: string
    output: unknown
  }): ToolResultStoragePrepared {
    const inlineMaxBytes = this.options.inlineMaxBytes ?? DEFAULT_INLINE_TOOL_RESULT_MAX_BYTES
    const classification = classifyToolResult(input.toolName, input.output, inlineMaxBytes)
    const sanitized = sanitizeRuntimeResponse(input.output)
    if (classification.kind !== 'large') {
      return {
        output: sanitized,
        spilled: false,
        bytes: classification.bytes,
      }
    }

    const resultId = createMainspringRuntimeId('tool_result')
    const workspaceRoot = fs.realpathSync.native(input.workspaceRoot)
    const absolutePath = assertPathContained(
      workspaceRoot,
      path.join(
        workspaceRoot,
        this.options.resultsDirectory ?? '.mainspring',
        'tool-results',
        input.runId,
        `${resultId}.json`,
      ),
    )
    const relativePath = path
      .relative(workspaceRoot, absolutePath)
      .replace(/\\/g, '/')
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, JSON.stringify(sanitized, null, 2))

    return {
      output: {
        storage: 'workspace-file',
        resultId,
        path: relativePath,
        bytes: classification.bytes,
        summary: classification.summary,
      },
      spilled: true,
      bytes: classification.bytes,
      resultId,
      relativePath,
    }
  }
}
