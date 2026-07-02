import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  SkillManifestSchema,
  createMainspringRuntimeId,
  sanitizeRuntimeResponse,
  type ProvenanceTaintLabel,
  type ProvenanceTrustMetadata,
  type SkillManifest,
} from '#protocol'
import { assertPathContained } from '#protocol/node'
import { MemoryProvider } from '../memory/MemoryProvider.js'
import type { MemoryScope } from '../memory/MemoryStore.js'

export type ProvenanceMutationKind = 'memory' | 'skill' | 'template'
export type ProvenanceFindingSeverity = 'info' | 'warning' | 'block'
export type ProvenanceScanStatus = 'pass' | 'review' | 'block'
export type ProvenanceReviewStatus = 'pending' | 'approved' | 'rejected' | 'applied'

export interface ProvenanceFinding {
  ruleId: string
  severity: ProvenanceFindingSeverity
  message: string
  evidence?: string
}

export interface ProvenanceScanResult {
  scannerVersion: 1
  scannedAt: string
  contentHash: string
  status: ProvenanceScanStatus
  findings: ProvenanceFinding[]
}

export interface ProvenanceTrustInput {
  source: string
  scan: ProvenanceScanResult
  reviewed?: boolean
  reviewId?: string
  mutationKind?: ProvenanceMutationKind
  manifest?: SkillManifest
}

export interface StagedMemoryMutation {
  kind: 'memory'
  text: string
  scope: MemoryScope
  tags: string[]
  metadata?: Record<string, unknown>
  sessionId?: string
}

export interface StagedSkillMutation {
  kind: 'skill'
  action: 'installed' | 'updated'
  manifest: SkillManifest
}

export type StagedProvenanceMutation = StagedMemoryMutation | StagedSkillMutation

export interface ProvenanceReviewItem {
  reviewId: string
  kind: ProvenanceMutationKind
  status: ProvenanceReviewStatus
  createdAt: string
  updatedAt: string
  runId?: string
  agentId?: string
  actor?: string
  source: string
  mutation: StagedProvenanceMutation
  scan: ProvenanceScanResult
  decision?: {
    decidedAt: string
    reviewer: string
    reason?: string
  }
}

export interface StageProvenanceInput {
  workspaceRoot: string
  mutation: StagedProvenanceMutation
  scan: ProvenanceScanResult
  source?: string
  runId?: string
  agentId?: string
  actor?: string
}

const REVIEW_FILE = 'provenance-review.jsonl'
const SKILLS_DIR = '.mainspring/skills'
const PROMPT_INJECTION_PATTERNS = [
  /\bignore (all )?(previous|prior|above) instructions\b/i,
  /\boverride (the )?(policy|approval|guard|system)\b/i,
  /\bdisable (the )?(approval|policy|guard|security)\b/i,
  /\balways approve\b/i,
  /\bdo not (tell|inform|notify) (the )?(operator|user)\b/i,
]

const REMOTE_EXEC_PATTERNS = [
  /\bcurl\b[\s\S]{0,80}\|\s*(sh|bash|zsh|powershell|pwsh|python|node)\b/i,
  /\b(wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[\s\S]{0,80}\|\s*(sh|bash|powershell|pwsh|python|node)\b/i,
]

const SECRET_PATTERNS = [
  /\b[A-Z0-9_]*(API|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*\b/i,
  /\bprocess\.env\b/i,
  /\benv:\b/i,
]

const POLICY_MUTATION_PATTERNS = [
  /\bapprovalPolicy\b/i,
  /\ballowedTools\b/i,
  /\bRuntimePolicyGuard\b/i,
  /\bpolicy mutation\b/i,
]

function nowIso(): string {
  return new Date().toISOString()
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  )
}

export function hashProvenanceContent(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex')
}

function scanText(input: {
  text: string
  findings: ProvenanceFinding[]
  label: string
}): void {
  const sanitized = sanitizeRuntimeResponse(input.text)
  if (JSON.stringify(sanitized) !== JSON.stringify(input.text)) {
    input.findings.push({
      ruleId: 'raw-secret-material',
      severity: 'block',
      message: `${input.label} contains raw secret-like material.`,
    })
  }
  for (const pattern of REMOTE_EXEC_PATTERNS) {
    const match = input.text.match(pattern)
    if (match) {
      input.findings.push({
        ruleId: 'remote-exec-pipe',
        severity: 'block',
        message: `${input.label} appears to pipe remote content into an interpreter.`,
        evidence: match[0].slice(0, 120),
      })
    }
  }
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    const match = input.text.match(pattern)
    if (match) {
      input.findings.push({
        ruleId: 'prompt-injection-directive',
        severity: 'warning',
        message: `${input.label} contains behavior-changing prompt-injection language.`,
        evidence: match[0].slice(0, 120),
      })
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    const match = input.text.match(pattern)
    if (match) {
      input.findings.push({
        ruleId: 'secret-or-env-access',
        severity: 'warning',
        message: `${input.label} references secret or environment material.`,
        evidence: match[0].slice(0, 120),
      })
    }
  }
  for (const pattern of POLICY_MUTATION_PATTERNS) {
    const match = input.text.match(pattern)
    if (match) {
      input.findings.push({
        ruleId: 'policy-mutation-language',
        severity: 'warning',
        message: `${input.label} references policy or approval mutation.`,
        evidence: match[0].slice(0, 120),
      })
    }
  }
}

function scanResult(content: unknown, findings: ProvenanceFinding[]): ProvenanceScanResult {
  const hasBlock = findings.some((finding) => finding.severity === 'block')
  const hasReview = findings.some((finding) => finding.severity === 'warning')
  return {
    scannerVersion: 1,
    scannedAt: nowIso(),
    contentHash: hashProvenanceContent(content),
    status: hasBlock ? 'block' : hasReview ? 'review' : 'pass',
    findings,
  }
}

export function scanMemoryMutation(input: {
  text: string
  scope?: MemoryScope
  tags?: readonly string[]
  metadata?: Record<string, unknown>
}): ProvenanceScanResult {
  const content = {
    kind: 'memory',
    text: input.text,
    scope: input.scope ?? 'workspace',
    tags: [...(input.tags ?? [])],
    metadata: input.metadata ?? {},
  }
  const findings: ProvenanceFinding[] = []
  scanText({ text: input.text, findings, label: 'memory text' })
  for (const tag of input.tags ?? []) scanText({ text: tag, findings, label: 'memory tag' })
  if (input.metadata) {
    scanText({ text: stableJson(input.metadata), findings, label: 'memory metadata' })
  }
  return scanResult(content, findings)
}

export function scanSkillManifest(manifestInput: SkillManifest): ProvenanceScanResult {
  const manifest = SkillManifestSchema.parse(manifestInput)
  const findings: ProvenanceFinding[] = []
  if (manifest.source !== 'built-in') {
    findings.push({
      ruleId: 'third-party-skill-source',
      severity: 'warning',
      message: `Skill source ${manifest.source} requires staged review before activation.`,
    })
  }
  scanText({ text: manifest.name, findings, label: 'skill name' })
  scanText({ text: manifest.description, findings, label: 'skill description' })
  if (manifest.entrypoint) scanText({ text: manifest.entrypoint, findings, label: 'skill entrypoint' })
  if (manifest.instructionsPath) {
    scanText({ text: manifest.instructionsPath, findings, label: 'skill instructions path' })
    if (manifest.instructionsPath.includes('..') || path.isAbsolute(manifest.instructionsPath)) {
      findings.push({
        ruleId: 'unsafe-instructions-path',
        severity: 'block',
        message: 'Skill instructionsPath must be workspace-relative and must not traverse upward.',
      })
    }
  }
  if (manifest.permissions.shell) {
    findings.push({
      ruleId: 'skill-shell-permission',
      severity: 'warning',
      message: 'Skill requests shell permission and requires staged review.',
    })
  }
  if (manifest.permissions.filesystem === 'computer-write') {
    findings.push({
      ruleId: 'skill-computer-write',
      severity: 'warning',
      message: 'Skill requests computer-wide file write permission and requires staged review.',
    })
  }
  if (manifest.permissions.network === 'open') {
    findings.push({
      ruleId: 'skill-open-network',
      severity: 'warning',
      message: 'Skill requests open network access and requires staged review.',
    })
  }
  for (const secretRef of manifest.permissions.secrets ?? []) {
    scanText({ text: secretRef, findings, label: 'skill secret ref' })
  }
  return scanResult({ kind: 'skill', manifest }, findings)
}

export function scanTemplateCatalogEntry(input: {
  templateId: string
  label: string
  description: string
  allowedTools: readonly string[]
  seedFiles: readonly { source: string; destination: string }[]
}): ProvenanceScanResult {
  const findings: ProvenanceFinding[] = []
  scanText({ text: input.label, findings, label: 'template label' })
  scanText({ text: input.description, findings, label: 'template description' })
  for (const seedFile of input.seedFiles) {
    for (const value of [seedFile.source, seedFile.destination]) {
      if (value.includes('..') || path.isAbsolute(value) || value.includes('\0')) {
        findings.push({
          ruleId: 'unsafe-template-path',
          severity: 'block',
          message: `Template ${input.templateId} contains an unsafe seed path.`,
          evidence: value,
        })
      }
    }
  }
  for (const tool of input.allowedTools) {
    if (tool === 'shell.exec' || tool === 'terminal.start') {
      findings.push({
        ruleId: 'template-shell-tool',
        severity: 'warning',
        message: `Template ${input.templateId} exposes host execution tools and must stay approval-gated.`,
        evidence: tool,
      })
    }
    if (tool === 'memory.write') {
      findings.push({
        ruleId: 'template-memory-write',
        severity: 'warning',
        message: `Template ${input.templateId} can mutate memory and must stay reviewable.`,
        evidence: tool,
      })
    }
  }
  return scanResult({ kind: 'template', input }, findings)
}

function addTaintLabel(labels: Set<ProvenanceTaintLabel>, label: ProvenanceTaintLabel): void {
  labels.add(label)
}

export function deriveProvenanceTrustMetadata(
  input: ProvenanceTrustInput,
): ProvenanceTrustMetadata {
  const labels = new Set<ProvenanceTaintLabel>()
  const source = input.source.trim() || 'runtime'
  const reviewed = input.reviewed === true

  if (reviewed) addTaintLabel(labels, 'operator-reviewed')
  if (input.scan.status === 'pass' && !reviewed) addTaintLabel(labels, 'runtime-generated')
  if (input.scan.status === 'review') addTaintLabel(labels, 'untrusted-input')
  if (source.includes('template') || source.includes('built-in')) addTaintLabel(labels, 'trusted-local')
  if (input.manifest?.source && input.manifest.source !== 'built-in') {
    addTaintLabel(labels, 'third-party')
  }

  for (const finding of input.scan.findings) {
    if (finding.ruleId === 'third-party-skill-source') addTaintLabel(labels, 'third-party')
    if (
      finding.ruleId === 'skill-shell-permission' ||
      finding.ruleId === 'skill-open-network' ||
      finding.ruleId === 'skill-computer-write' ||
      finding.ruleId === 'template-shell-tool' ||
      finding.ruleId === 'template-memory-write'
    ) {
      addTaintLabel(labels, 'high-capability')
    }
    if (finding.ruleId === 'prompt-injection-directive') {
      addTaintLabel(labels, 'prompt-injection-suspect')
    }
    if (finding.ruleId === 'secret-or-env-access' || finding.ruleId === 'raw-secret-material') {
      addTaintLabel(labels, 'secret-reference')
    }
    if (finding.ruleId === 'policy-mutation-language') {
      addTaintLabel(labels, 'policy-mutation-suspect')
    }
    if (finding.ruleId === 'remote-exec-pipe') {
      addTaintLabel(labels, 'remote-code-suspect')
    }
  }

  if (labels.size === 0) addTaintLabel(labels, 'runtime-generated')

  return {
    source,
    labels: [...labels].sort(),
    scannerVersion: input.scan.scannerVersion,
    contentHash: input.scan.contentHash,
    scanStatus: input.scan.status,
    findings: input.scan.findings.map((finding) => finding.ruleId),
    ...(reviewed ? { reviewed: true } : {}),
    ...(input.reviewId ? { reviewId: input.reviewId } : {}),
  }
}

function reviewFilePath(workspaceRoot: string): string {
  const resolvedWorkspaceRoot = fs.realpathSync.native(workspaceRoot)
  return assertPathContained(
    resolvedWorkspaceRoot,
    path.join(resolvedWorkspaceRoot, '.mainspring', REVIEW_FILE),
  )
}

function parseReviewLine(line: string): ProvenanceReviewItem | null {
  try {
    const parsed = JSON.parse(line) as ProvenanceReviewItem
    if (!parsed.reviewId || !parsed.kind || !parsed.status || !parsed.mutation) return null
    return parsed
  } catch {
    return null
  }
}

export class JsonlProvenanceReviewQueue {
  constructor(private readonly workspaceRoot: string) {}

  stage(input: Omit<StageProvenanceInput, 'workspaceRoot'>): ProvenanceReviewItem {
    const timestamp = nowIso()
    const item: ProvenanceReviewItem = {
      reviewId: createMainspringRuntimeId('review'),
      kind: input.mutation.kind,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      source: input.source ?? 'runtime',
      mutation: input.mutation,
      scan: input.scan,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
    }
    const filePath = reviewFilePath(this.workspaceRoot)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.appendFileSync(filePath, `${JSON.stringify(item)}\n`)
    return item
  }

  list(): ProvenanceReviewItem[] {
    const filePath = reviewFilePath(this.workspaceRoot)
    if (!fs.existsSync(filePath)) return []
    const latestById = new Map<string, ProvenanceReviewItem>()
    for (const item of fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const parsed = parseReviewLine(line)
        return parsed ? [parsed] : []
      })) {
      latestById.set(item.reviewId, item)
    }
    return [...latestById.values()]
  }

  get(reviewId: string): ProvenanceReviewItem | undefined {
    return this.list().find((item) => item.reviewId === reviewId)
  }

  decide(input: {
    reviewId: string
    decision: Extract<ProvenanceReviewStatus, 'approved' | 'rejected' | 'applied'>
    reviewer: string
    reason?: string
  }): ProvenanceReviewItem {
    const current = this.get(input.reviewId)
    if (!current) throw new Error(`Unknown provenance review item: ${input.reviewId}`)
    if (current.status === 'rejected') throw new Error('Rejected provenance review items cannot be changed.')
    if (current.status === 'applied' && input.decision !== 'applied') {
      throw new Error('Applied provenance review items cannot be changed.')
    }
    const timestamp = nowIso()
    const next: ProvenanceReviewItem = {
      ...current,
      status: input.decision,
      updatedAt: timestamp,
      decision: {
        decidedAt: timestamp,
        reviewer: input.reviewer,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    }
    const filePath = reviewFilePath(this.workspaceRoot)
    fs.appendFileSync(filePath, `${JSON.stringify(next)}\n`)
    return next
  }
}

export function createProvenanceReviewQueue(workspaceRoot: string): JsonlProvenanceReviewQueue {
  return new JsonlProvenanceReviewQueue(workspaceRoot)
}

export function stageProvenanceReview(input: StageProvenanceInput): ProvenanceReviewItem {
  return createProvenanceReviewQueue(input.workspaceRoot).stage(input)
}

export function assertScanCanProceed(scan: ProvenanceScanResult): void {
  if (scan.status === 'block') {
    const reasons = scan.findings
      .filter((finding) => finding.severity === 'block')
      .map((finding) => finding.ruleId)
      .join(', ')
    throw new Error(`Provenance scan blocked mutation: ${reasons || 'blocked'}`)
  }
}

function skillManifestPath(workspaceRoot: string, skillKey: string): string {
  const resolvedWorkspaceRoot = fs.realpathSync.native(workspaceRoot)
  return assertPathContained(
    resolvedWorkspaceRoot,
    path.join(resolvedWorkspaceRoot, SKILLS_DIR, skillKey, 'manifest.json'),
  )
}

export function applyApprovedMemoryReview(input: {
  workspaceRoot: string
  reviewId: string
  reviewer?: string
}): { reviewId: string; memoryId: string; applied: true } {
  const queue = createProvenanceReviewQueue(input.workspaceRoot)
  const item = queue.get(input.reviewId)
  if (!item) throw new Error(`Unknown provenance review item: ${input.reviewId}`)
  if (item.status !== 'approved') throw new Error('Provenance review item must be approved before apply.')
  if (item.mutation.kind !== 'memory') throw new Error('Provenance review item is not a memory mutation.')
  assertScanCanProceed(item.scan)
  const provider = new MemoryProvider({
    workspaceRoot: input.workspaceRoot,
    ...(item.mutation.sessionId ? { sessionId: item.mutation.sessionId } : {}),
  })
  const entry = provider.write({
    text: item.mutation.text,
    scope: item.mutation.scope,
    tags: item.mutation.tags,
    metadata: {
      ...(item.mutation.metadata ?? {}),
      provenance: deriveProvenanceTrustMetadata({
        source: item.source,
        scan: item.scan,
        reviewed: true,
        reviewId: item.reviewId,
        mutationKind: 'memory',
      }),
    },
  })
  queue.decide({
    reviewId: input.reviewId,
    decision: 'applied',
    reviewer: input.reviewer ?? 'operator',
    reason: 'Applied approved memory review.',
  })
  return { reviewId: input.reviewId, memoryId: entry.entryId, applied: true }
}

export function applyApprovedSkillReview(input: {
  workspaceRoot: string
  reviewId: string
  reviewer?: string
}): { reviewId: string; skillKey: string; action: 'installed' | 'updated'; applied: true } {
  const queue = createProvenanceReviewQueue(input.workspaceRoot)
  const item = queue.get(input.reviewId)
  if (!item) throw new Error(`Unknown provenance review item: ${input.reviewId}`)
  if (item.status !== 'approved') throw new Error('Provenance review item must be approved before apply.')
  if (item.mutation.kind !== 'skill') throw new Error('Provenance review item is not a skill mutation.')
  assertScanCanProceed(item.scan)
  const filePath = skillManifestPath(input.workspaceRoot, item.mutation.manifest.key)
  const manifest: SkillManifest = {
    ...item.mutation.manifest,
    provenance: deriveProvenanceTrustMetadata({
      source: item.source,
      scan: item.scan,
      reviewed: true,
      reviewId: item.reviewId,
      mutationKind: 'skill',
      manifest: item.mutation.manifest,
    }),
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  queue.decide({
    reviewId: input.reviewId,
    decision: 'applied',
    reviewer: input.reviewer ?? 'operator',
    reason: `Applied approved skill ${item.mutation.action}.`,
  })
  return {
    reviewId: input.reviewId,
    skillKey: item.mutation.manifest.key,
    action: item.mutation.action,
    applied: true,
  }
}
