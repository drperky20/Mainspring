import {
  RuntimePolicySchema,
  SkillManifestSchema,
  ToolManifestSchema,
  type RuntimePolicy,
  type SkillManifest,
  type ToolManifest,
} from '#protocol'

export type PolicyOperation =
  | 'tool.execute'
  | 'skill.install'
  | 'cron.enqueue'
  | 'subagent.create'
  | 'provider_config.write'
  | 'artifact.publish'
  | 'channel.send'
  | 'memory.replace'
  | 'memory.delete'
  | 'provenance.review.decide'
  | 'provenance.review.apply'
  | 'cron.schedule.write'
  | 'cron.grant.create'
  | 'budget.write'
  | 'budget.warning.acknowledge'
  | 'budget.run.block'
  | 'deployment.target.write'
  | 'deployment.execute'
  | 'topology.write'

export interface RuntimePolicyDefaults {
  approvalPolicy?: RuntimePolicy['approvalPolicy']
  allowBrowser?: boolean
  allowMemory?: boolean
  allowedTools?: string[]
  budget?: RuntimePolicy['budget']
  redaction?: RuntimePolicy['redaction']
}

export interface PolicyDecisionInput {
  operation: PolicyOperation
  manifest: ToolManifest | SkillManifest
  input?: unknown
  approved?: boolean
}

export interface PolicyDecision {
  blocked: boolean
  approvalRequired: boolean
  reasons: string[]
  permissionCategories: string[]
  hardBlocked?: boolean
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

function isWriteFilesystem(value: ToolManifest['permissions']['filesystem']): boolean {
  return Boolean(value && value !== 'read')
}

function isCostSensitiveTool(manifest: ToolManifest | SkillManifest, input?: unknown): boolean {
  const permissions = manifest.permissions
  return (
    permissions.shell === true ||
    permissions.browser === true ||
    permissions.network === 'open' ||
    isWriteFilesystem(permissions.filesystem) ||
    inputRecord(input).sourceMutation === true
  )
}

function shellCommand(input?: unknown): string {
  const record = inputRecord(input)
  const value = record.command ?? record.cmd ?? record.script ?? record.args
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((part) => String(part)).join(' ')
  return ''
}

function hardlinePolicyReasons(manifest: ToolManifest | SkillManifest, input?: unknown): string[] {
  const reasons: string[] = []
  const command = shellCommand(input).toLowerCase()
  const shellLike = manifest.permissions.shell === true || command.length > 0
  if (!shellLike) return reasons

  const hardlinePatterns: Array<[RegExp, string]> = [
    [/\brm\s+-[^\n\r]*r[^\n\r]*f[^\n\r]*(?:\/|\*)/, 'catastrophic filesystem wipe cannot be approved'],
    [/\bremove-item\b[^\n\r]*(?:-recurse|-r)[^\n\r]*(?:-force|-fo)[^\n\r]*(?:[a-z]:\\|\/|\*)/i, 'catastrophic filesystem wipe cannot be approved'],
    [/\b(?:format|mkfs|diskpart|cipher\s+\/w|dd\s+if=)/i, 'raw disk or destructive volume operation cannot be approved'],
    [/:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, 'fork bomb cannot be approved'],
    [/\b(?:curl|wget|irm|iwr|invoke-webrequest|invoke-restmethod)\b[^\n\r|;&]*(?:\||;|&&)[^\n\r]*(?:sh|bash|zsh|pwsh|powershell|iex|invoke-expression)\b/i, 'network-to-shell execution cannot be approved'],
    [/\b(?:cat|type|get-content)\b[^\n\r]*(?:\.ssh|id_rsa|\.env|credentials|token|secret|api[_-]?key)/i, 'credential material disclosure cannot be approved'],
    [/^\s*(?:printenv|env|gci\s+env:|get-childitem\s+env:)\b[^\n\r]*(?:token|secret|key|password|credential)/i, 'secret environment dumping cannot be approved'],
    [/\b(?:git\s+remote\s+(?:add|set-url|remove|rename)|git\s+config\s+.*hooksPath)\b/i, 'git remote or hook mutation requires a dedicated approved workflow'],
    [/\b(?:--no-approval|disable-approval|approval[_-]?policy\s*=\s*(?:off|none|disabled))\b/i, 'approval or policy disabling cannot be approved'],
  ]
  for (const [pattern, reason] of hardlinePatterns) {
    if (pattern.test(command)) reasons.push(reason)
  }
  return Array.from(new Set(reasons))
}

export class RuntimePolicyGuard {
  constructor(readonly policy: RuntimePolicy) {}

  static defaultPolicy(defaults: RuntimePolicyDefaults = {}): RuntimePolicy {
    return RuntimePolicySchema.parse({
      approvalPolicy: defaults.approvalPolicy ?? 'balanced',
      allowBrowser: defaults.allowBrowser ?? false,
      allowMemory: defaults.allowMemory ?? false,
      allowedTools: defaults.allowedTools ?? [],
      ...(defaults.budget ? { budget: defaults.budget } : {}),
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
    const reasons: string[] = []
    const hardlineReasons = hardlinePolicyReasons(manifest, input.input)
    if (hardlineReasons.length > 0) {
      categories.push('hardline')
      return {
        blocked: true,
        approvalRequired: false,
        reasons: hardlineReasons,
        permissionCategories: Array.from(new Set(categories)),
        hardBlocked: true,
      }
    }
    if (this.policy.budget?.status === 'blocked') {
      reasons.push(
        this.policy.budget.reason
        ?? `budget is blocked${this.policy.budget.label ? `: ${this.policy.budget.label}` : ''}`,
      )
      categories.push('budget')
      return {
        blocked: true,
        approvalRequired: false,
        reasons,
        permissionCategories: categories,
      }
    }
    const costSensitiveToolPolicy = this.policy.budget?.costSensitiveTools
    if (
      input.operation === 'tool.execute' &&
      costSensitiveToolPolicy?.mode === 'block' &&
      isCostSensitiveTool(manifest, input.input)
    ) {
      reasons.push(
        costSensitiveToolPolicy.reason
        ?? this.policy.budget?.reason
        ?? `cost-sensitive tool execution is blocked by budget policy${this.policy.budget?.label ? `: ${this.policy.budget.label}` : ''}`,
      )
      categories.push('budget', 'cost-sensitive-tool')
      return {
        blocked: true,
        approvalRequired: false,
        reasons,
        permissionCategories: categories,
      }
    }
    if (input.approved) {
      return { blocked: false, approvalRequired: false, reasons: [], permissionCategories: categories }
    }
    if (this.policy.budget?.status === 'warn' && this.policy.budget.requireApproval) {
      reasons.push(
        this.policy.budget.reason
        ?? `budget warning requires approval${this.policy.budget.label ? `: ${this.policy.budget.label}` : ''}`,
      )
      categories.push('budget')
    }
    if (
      input.operation === 'tool.execute' &&
      costSensitiveToolPolicy?.mode === 'approval' &&
      isCostSensitiveTool(manifest, input.input)
    ) {
      reasons.push(
        costSensitiveToolPolicy.reason
        ?? this.policy.budget?.reason
        ?? `cost-sensitive tool execution requires budget review${this.policy.budget?.label ? `: ${this.policy.budget.label}` : ''}`,
      )
      categories.push('budget', 'cost-sensitive-tool')
    }
    if (this.policy.approvalPolicy === 'ask-first') {
      reasons.push('approval policy requires review')
    }
    if (manifest.approval.required) {
      reasons.push('manifest requires approval')
    }
    if (manifest.permissions.shell && manifest.approval.required) {
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
      blocked: false,
      approvalRequired: reasons.length > 0,
      reasons,
      permissionCategories: categories,
    }
  }
}
