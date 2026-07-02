import fs from 'node:fs'
import path from 'node:path'
import {
  SkillManifestSchema,
  sanitizeRuntimeResponse,
  type MainspringEvent,
  type SkillManifest,
} from '#protocol'
import { assertPathContained } from '#protocol/node'
import { RuntimePolicyGuard } from '../policy/PolicyGuard.js'
import {
  assertScanCanProceed,
  scanSkillManifest,
  stageProvenanceReview,
} from '../provenance/ProvenanceReview.js'
import { builtinManifest, inputRecord, type RuntimeTool } from './ToolRegistry.js'

const SKILLS_DIR = '.mainspring/skills'

function assertSkillKeyPathSafe(key: string): void {
  if (
    key === '.' ||
    key === '..' ||
    key.includes('/') ||
    key.includes('\\') ||
    key.includes('\0')
  ) {
    throw new Error('Skill manifest key must not contain path separators.')
  }
}

function manifestFromInput(input: unknown): SkillManifest {
  const record = inputRecord(input)
  const candidate = record.manifest ?? input
  const manifest = SkillManifestSchema.parse(candidate)
  RuntimePolicyGuard.assertPermissionDeclaration(manifest)
  assertSkillKeyPathSafe(manifest.key)
  return manifest
}

function skillManifestPath(workspaceRoot: string, skillKey: string): string {
  const resolvedWorkspaceRoot = fs.realpathSync.native(workspaceRoot)
  return assertPathContained(
    resolvedWorkspaceRoot,
    path.join(resolvedWorkspaceRoot, SKILLS_DIR, skillKey, 'manifest.json'),
  )
}

function readExistingManifest(filePath: string): SkillManifest | null {
  if (!fs.existsSync(filePath)) return null
  return SkillManifestSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')))
}

function persistManifest(input: {
  action: 'installed' | 'updated'
  manifest: SkillManifest
  runId: string
  workspaceRoot: string
  emitEvent: (event: MainspringEvent) => void
  reviewMode?: 'stage' | 'apply'
}): unknown {
  const scan = scanSkillManifest(input.manifest)
  assertScanCanProceed(scan)
  if (input.reviewMode === 'stage' || scan.status === 'review') {
    const review = stageProvenanceReview({
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
      source: `skills.${input.action}`,
      mutation: {
        kind: 'skill',
        action: input.action,
        manifest: input.manifest,
      },
      scan,
    })
    input.emitEvent({
      type: 'skill.event',
      runId: input.runId,
      skillKey: input.manifest.key,
      action: 'review.staged',
      metadata: {
        source: input.manifest.source,
        version: input.manifest.version,
        reviewId: review.reviewId,
        scanStatus: scan.status,
      },
    })
    return sanitizeRuntimeResponse({
      skillKey: input.manifest.key,
      action: input.action,
      persisted: false,
      staged: true,
      reviewId: review.reviewId,
      source: input.manifest.source,
      version: input.manifest.version,
      scan: {
        status: scan.status,
        contentHash: scan.contentHash,
        findings: scan.findings,
      },
    })
  }
  const filePath = skillManifestPath(input.workspaceRoot, input.manifest.key)
  const previous = readExistingManifest(filePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(input.manifest, null, 2)}\n`, 'utf8')
  input.emitEvent({
    type: 'skill.event',
    runId: input.runId,
    skillKey: input.manifest.key,
    action: input.action,
    metadata: {
      source: input.manifest.source,
      version: input.manifest.version,
      previousVersion: previous?.version,
      scanStatus: scan.status,
      contentHash: scan.contentHash,
    },
  })
  return sanitizeRuntimeResponse({
    skillKey: input.manifest.key,
    action: input.action,
    persisted: true,
    source: input.manifest.source,
    version: input.manifest.version,
    previousVersion: previous?.version,
    provenance: {
      status: scan.status,
      contentHash: scan.contentHash,
    },
  })
}

export function createSkillInstallTool(): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'skills.install',
      name: 'Install Skill',
      description: 'Installs an approved Mainspring skill manifest into the workspace store.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'builtin',
    }),
    execute: ({ input, runId, workspaceRoot, emitEvent }) => {
      const record = inputRecord(input)
      return persistManifest({
        action: 'installed',
        manifest: manifestFromInput(input),
        runId,
        workspaceRoot,
        emitEvent,
        reviewMode: record.reviewMode === 'stage' ? 'stage' : 'apply',
      })
    },
  }
}

export function createSkillUpdateTool(): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'skills.update',
      name: 'Update Skill',
      description: 'Updates an approved Mainspring skill manifest in the workspace store.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'builtin',
    }),
    execute: ({ input, runId, workspaceRoot, emitEvent }) => {
      const record = inputRecord(input)
      return persistManifest({
        action: 'updated',
        manifest: manifestFromInput(input),
        runId,
        workspaceRoot,
        emitEvent,
        reviewMode: record.reviewMode === 'stage' ? 'stage' : 'apply',
      })
    },
  }
}

export function createSkillTools(): RuntimeTool[] {
  return [createSkillInstallTool(), createSkillUpdateTool()]
}
