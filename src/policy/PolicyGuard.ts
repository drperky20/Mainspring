import {
  RuntimePolicySchema,
  SkillManifestSchema,
  ToolManifestSchema,
  type RuntimePolicy,
  type SkillManifest,
  type ToolManifest,
} from '#protocol'

export type PolicyOperation = 'tool.execute' | 'skill.install'

export interface RuntimePolicyDefaults {
  approvalPolicy?: RuntimePolicy['approvalPolicy']
  allowBrowser?: boolean
  allowMemory?: boolean
  allowedTools?: string[]
  redaction?: RuntimePolicy['redaction']
}

export interface PolicyDecisionInput {
  operation: PolicyOperation
  manifest: ToolManifest | SkillManifest
  input?: unknown
  approved?: boolean
}

export interface PolicyDecision {
  approvalRequired: boolean
  reasons: string[]
  permissionCategories: string[]
}

function inputRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function hasDeclaredPermission(manifest: ToolManifest | SkillManifest): boolean {
  const permissions = manifest.permissions
  return (
    permissions.shell === true ||
    permissions.browser === true ||
    Boolean(permissions.network) ||
    Boolean(permissions.filesystem) ||
    Boolean(permissions.secrets?.length)
  )
}

function permissionCategories(manifest: ToolManifest | SkillManifest, input?: unknown): string[] {
  const categories: string[] = []
  const permissions = manifest.permissions
  if (permissions.shell) categories.push('shell')
  if (permissions.browser) categories.push('browser')
  if (permissions.network) categories.push(`network:${permissions.network}`)
  if (permissions.filesystem) categories.push(`filesystem:${permissions.filesystem}`)
  if (permissions.secrets?.length) categories.push('secrets')
  if (inputRecord(input).sourceMutation === true) categories.push('source-mutation')
  return categories
}

export class RuntimePolicyGuard {
  constructor(readonly policy: RuntimePolicy) {}

  static defaultPolicy(defaults: RuntimePolicyDefaults = {}): RuntimePolicy {
    return RuntimePolicySchema.parse({
      approvalPolicy: defaults.approvalPolicy ?? 'balanced',
      allowBrowser: defaults.allowBrowser ?? false,
      allowMemory: defaults.allowMemory ?? false,
      allowedTools: defaults.allowedTools ?? [],
      redaction: defaults.redaction ?? 'strict',
    })
  }

  static assertPermissionDeclaration(manifest: ToolManifest | SkillManifest): void {
    if (!hasDeclaredPermission(manifest)) {
      throw new Error(
        `Capability manifest ${manifest.key} must declare at least one permission category.`,
      )
    }
  }

  decide(input: PolicyDecisionInput): PolicyDecision {
    const manifest =
      'toolType' in input.manifest
        ? ToolManifestSchema.parse(input.manifest)
        : SkillManifestSchema.parse(input.manifest)
    RuntimePolicyGuard.assertPermissionDeclaration(manifest)

    const categories = permissionCategories(manifest, input.input)
    if (input.approved) {
      return { approvalRequired: false, reasons: [], permissionCategories: categories }
    }

    const reasons: string[] = []
    if (this.policy.approvalPolicy === 'ask-first') {
      reasons.push('approval policy requires review')
    }
    if (manifest.approval.required) {
      reasons.push('manifest requires approval')
    }
    if (manifest.permissions.shell) {
      reasons.push('shell execution requires approval')
    }
    if (manifest.permissions.browser && !this.policy.allowBrowser) {
      reasons.push('browser access requires approval')
    }
    if (manifest.permissions.network === 'open') {
      reasons.push('open network access requires approval')
    }
    if (inputRecord(input.input).sourceMutation === true) {
      reasons.push('source mutation requires approval')
    }
    if (input.operation === 'tool.execute' && !this.policy.allowedTools.includes(manifest.key)) {
      reasons.push('tool is not in the allowed tools list')
    }
    if (input.operation === 'skill.install') {
      if (manifest.source !== 'built-in') {
        reasons.push('non built-in skill install requires approval')
      }
      if (manifest.permissions.filesystem && manifest.permissions.filesystem !== 'read') {
        reasons.push('write-capable skill install requires approval')
      }
      if (manifest.permissions.secrets?.length) {
        reasons.push('secret-capable skill install requires approval')
      }
    }

    return {
      approvalRequired: reasons.length > 0,
      reasons,
      permissionCategories: categories,
    }
  }
}
