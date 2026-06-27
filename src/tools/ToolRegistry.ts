import {
  ToolManifestSchema,
  type MainspringEvent,
  type RuntimePolicy,
  type ToolManifest,
} from '#protocol'
import {
  approvalRequestedEvent,
  buildApprovalRequest,
  type RuntimeApprovalRequest,
} from '../policy/ApprovalPolicy.js'
import {
  assertApprovalReceipt,
  type ApprovalReceipt,
} from '../policy/ApprovalReceipt.js'
import { RuntimePolicyGuard } from '../policy/PolicyGuard.js'

export interface ToolExecutionInput {
  key: string
  input?: unknown
  approvalReceipt?: ApprovalReceipt
}

export type ToolExecutionResult =
  | { status: 'completed'; output: unknown }
  | { status: 'approval_required'; approval: RuntimeApprovalRequest }

export interface RuntimeToolContext {
  input: unknown
  runId: string
  workspaceRoot: string
  registeredTools: ToolManifest[]
  readRecentEvents?: (input: { limit?: number }) => unknown[] | Promise<unknown[]>
  emitEvent: (event: MainspringEvent) => void
}

export interface RuntimeTool {
  manifest: ToolManifest
  execute: (context: RuntimeToolContext) => unknown | Promise<unknown>
}

export function inputRecord(value: unknown, message?: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (message) throw new Error(message)
  return {}
}

export function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback
}

export const builtinManifest = (manifest: Omit<ToolManifest, 'source' | 'version'>): ToolManifest =>
  ({ version: '1.0.0', source: 'built-in', ...manifest }) as ToolManifest

export interface ToolRegistryOptions {
  runId: string
  workspaceRoot: string
  policy: RuntimePolicyGuard | RuntimePolicy
  readRecentEvents?: (input: { runId: string; limit?: number }) => unknown[] | Promise<unknown[]>
  emitEvent?: (event: MainspringEvent) => void
}

export class ToolRegistry {
  private readonly tools = new Map<string, RuntimeTool>()
  private manifests: ToolManifest[] | null = null
  private readonly emitEvent: (event: MainspringEvent) => void
  private readonly policy: RuntimePolicyGuard
  private readonly usedApprovalReceiptNonces = new Set<string>()

  constructor(private readonly options: ToolRegistryOptions) {
    this.emitEvent = options.emitEvent ?? (() => {})
    this.policy =
      options.policy instanceof RuntimePolicyGuard
        ? options.policy
        : new RuntimePolicyGuard(options.policy)
  }

  register(tool: RuntimeTool): void {
    const manifest = ToolManifestSchema.parse(tool.manifest)
    RuntimePolicyGuard.assertPermissionDeclaration(manifest)
    this.tools.set(manifest.key, { ...tool, manifest })
    this.manifests = null
  }

  registerMany(tools: RuntimeTool[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  get(key: string): RuntimeTool | undefined {
    return this.tools.get(key)
  }

  async execute(input: ToolExecutionInput): Promise<ToolExecutionResult> {
    const tool = this.tools.get(input.key)
    if (!tool) throw new Error(`Unknown tool: ${input.key}`)

    if (input.approvalReceipt) {
      assertApprovalReceipt({
        receipt: input.approvalReceipt,
        runId: this.options.runId,
        targetKey: tool.manifest.key,
        toolInput: input.input,
        usedNonces: this.usedApprovalReceiptNonces,
      })
    }

    const decision = this.policy.decide({
      operation: 'tool.execute',
      manifest: tool.manifest,
      input: input.input,
      approved: Boolean(input.approvalReceipt),
    })

    if (decision.approvalRequired) {
      const approval = buildApprovalRequest({
        runId: this.options.runId,
        kind: 'exec',
        targetKey: tool.manifest.key,
        reasons: decision.reasons,
        permissionCategories: decision.permissionCategories,
        metadata: { capability: 'tool', toolType: tool.manifest.toolType },
      })
      this.emitEvent(approvalRequestedEvent({ runId: this.options.runId, approval }))
      return { status: 'approval_required', approval }
    }

    const readRecentEvents = this.options.readRecentEvents
    const output = await tool.execute({
      input: input.input,
      runId: this.options.runId,
      workspaceRoot: this.options.workspaceRoot,
      registeredTools: this.registeredManifests(),
      readRecentEvents: readRecentEvents
        ? (eventInput) => readRecentEvents({ runId: this.options.runId, limit: eventInput.limit })
        : undefined,
      emitEvent: this.emitEvent,
    })
    return { status: 'completed', output }
  }

  private registeredManifests(): ToolManifest[] {
    return (this.manifests ??= Array.from(this.tools.values()).map((tool) => tool.manifest))
  }
}
