import {
  SkillManifestSchema,
  type MainspringEvent,
  type RuntimePolicy,
  type SkillManifest,
} from '#protocol'
import {
  approvalRequestedEvent,
  buildApprovalRequest,
  type RuntimeApprovalRequest,
} from '../policy/ApprovalPolicy.js'
import { RuntimePolicyGuard } from '../policy/PolicyGuard.js'

export type SkillInstallResult =
  | { status: 'installed'; skillKey: string }
  | { status: 'approval_required'; approval: RuntimeApprovalRequest }

export interface SkillRegistryOptions {
  runId: string
  policy: RuntimePolicyGuard | RuntimePolicy
  emitEvent?: (event: MainspringEvent) => void
}

export class SkillRegistry {
  private readonly skills = new Map<string, SkillManifest>()
  private readonly emitEvent: (event: MainspringEvent) => void
  private readonly policy: RuntimePolicyGuard

  constructor(private readonly options: SkillRegistryOptions) {
    this.emitEvent = options.emitEvent ?? (() => {})
    this.policy =
      options.policy instanceof RuntimePolicyGuard
        ? options.policy
        : new RuntimePolicyGuard(options.policy)
  }

  register(manifest: SkillManifest): SkillManifest {
    const parsed = SkillManifestSchema.parse(manifest)
    RuntimePolicyGuard.assertPermissionDeclaration(parsed)
    this.skills.set(parsed.key, parsed)
    return parsed
  }

  install(manifest: SkillManifest, options: { approved?: boolean } = {}): SkillInstallResult {
    const parsed = SkillManifestSchema.parse(manifest)
    RuntimePolicyGuard.assertPermissionDeclaration(parsed)
    const decision = this.policy.decide({
      operation: 'skill.install',
      manifest: parsed,
      approved: options.approved,
    })

    if (decision.approvalRequired) {
      const approval = buildApprovalRequest({
        runId: this.options.runId,
        kind: 'plugin',
        targetKey: parsed.key,
        reasons: decision.reasons,
        permissionCategories: decision.permissionCategories,
        metadata: { capability: 'skill', source: parsed.source, version: parsed.version },
      })
      this.emitEvent(approvalRequestedEvent({ runId: this.options.runId, approval }))
      return { status: 'approval_required', approval }
    }

    this.skills.set(parsed.key, parsed)
    this.emitEvent({
      type: 'skill.event',
      runId: this.options.runId,
      skillKey: parsed.key,
      action: 'installed',
      metadata: {
        source: parsed.source,
        version: parsed.version,
      },
    })
    return { status: 'installed', skillKey: parsed.key }
  }

  get(key: string): SkillManifest | undefined {
    return this.skills.get(key)
  }
}
