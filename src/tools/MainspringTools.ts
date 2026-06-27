import path from 'node:path'
import { sanitizeRuntimeResponse } from '#protocol'
import { builtinManifest, inputRecord, positiveInt, type RuntimeTool } from './ToolRegistry.js'

type RuntimeDiagnosticsToolOptions = {
  key?: string
  name?: string
  description?: string
  runtimeLabel?: string
}

type RuntimeEventTailToolOptions = {
  key?: string
  name?: string
  description?: string
}

export function createMainspringDiagnosticsTool(
  options: RuntimeDiagnosticsToolOptions = {},
): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: options.key ?? 'mainspring.diagnostics.overview',
      name: options.name ?? 'Mainspring Diagnostics Overview',
      description:
        options.description ??
        'Reads native Mainspring run, workspace, and registered tool diagnostics.',
      permissions: { filesystem: 'read' },
      approval: {},
      toolType: 'builtin',
    }),
    execute: ({ runId, workspaceRoot, registeredTools }) =>
      sanitizeRuntimeResponse({
        runId,
        runtime: options.runtimeLabel ?? 'mainspring',
        workspace: {
          name: path.basename(workspaceRoot),
        },
        tools: registeredTools.map((manifest) => ({
          key: manifest.key,
          name: manifest.name,
          toolType: manifest.toolType,
          permissions: manifest.permissions,
          approvalRequired: Boolean(manifest.approval.required),
        })),
      }),
  }
}

export function createMainspringEventTailTool(
  options: RuntimeEventTailToolOptions = {},
): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: options.key ?? 'mainspring.agent.events.tail',
      name: options.name ?? 'Mainspring Agent Event Tail',
      description:
        options.description ??
        'Reads recent sanitized Mainspring runtime events for the current run.',
      permissions: { filesystem: 'read' },
      approval: {},
      toolType: 'builtin',
    }),
    execute: async ({ input, readRecentEvents }) => {
      if (!readRecentEvents) {
        return sanitizeRuntimeResponse({
          events: [],
          available: false,
          reason: 'Runtime event tail is unavailable outside a mailbox-backed run.',
        })
      }
      const record = inputRecord(input)
      const events = await readRecentEvents({ limit: positiveInt(record.limit, 25, 100) })
      return sanitizeRuntimeResponse({
        available: true,
        count: events.length,
        events,
      })
    },
  }
}

export function createMainspringTools(): RuntimeTool[] {
  return [createMainspringDiagnosticsTool(), createMainspringEventTailTool()]
}
