import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { MainspringRuntimeProfileIdSchema } from '#protocol'
import type { VerifiedRemoteMarketplaceTemplate } from './RemoteMarketplace.js'

const TemplateSeedFileSchema = z.object({
  source: z.string().trim().min(1),
  destination: z.string().trim().min(1),
})

const TemplateDefaultsSchema = z.object({
  clientName: z.string().trim().min(1),
  workspaceName: z.string().trim().min(1),
  agentName: z.string().trim().min(1),
  outcome: z.string().trim().min(1),
  voice: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
})

const TemplateManifestSchema = z.object({
  templateId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  exampleDir: z.string().trim().min(1),
  seedFiles: z.array(TemplateSeedFileSchema).min(1),
  defaults: TemplateDefaultsSchema,
})

const TemplateCatalogSchema = z.array(TemplateManifestSchema)

const ExampleAgentConfigSchema = z.object({
  providerId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  runtimeProfile: z.string().trim().min(1).optional(),
  allowedTools: z.array(z.string().trim().min(1)).default([]),
  approvalMode: z.string().trim().min(1).optional(),
})

export interface LocalMarketplaceTemplateRecord {
  templateId: string
  label: string
  description: string
  trusted: true
  provenance: 'repo-examples'
  exampleDir: string
  providerId?: string
  modelId?: string
  runtimeProfile?: string
  allowedTools: string[]
  approvalMode?: string
  defaults: z.infer<typeof TemplateDefaultsSchema>
  seedFiles: Array<{ source: string; destination: string }>
}

export type MarketplaceTemplateRecord = LocalMarketplaceTemplateRecord | VerifiedRemoteMarketplaceTemplate

export interface InstallLocalMarketplaceTemplateResult {
  template: LocalMarketplaceTemplateRecord
  installedFiles: string[]
}

export function listLocalMarketplaceTemplates(repoRoot: string): LocalMarketplaceTemplateRecord[] {
  const catalogPath = path.resolve(repoRoot, 'examples', 'templates.json')
  const catalog = TemplateCatalogSchema.parse(
    JSON.parse(fs.readFileSync(catalogPath, 'utf8')),
  )
  return catalog.map((entry) => {
    const exampleRoot = safeExampleRoot(repoRoot, entry.exampleDir)
    const agentConfigPath = path.join(exampleRoot, 'agent.config.json')
    const agentConfig = ExampleAgentConfigSchema.parse(
      JSON.parse(fs.readFileSync(agentConfigPath, 'utf8')),
    )
    const seedFiles = entry.seedFiles.map((seedFile) => ({
      source: safeRelativeTemplatePath(seedFile.source),
      destination: safeRelativeTemplatePath(seedFile.destination),
    }))
    return {
      templateId: entry.templateId,
      label: entry.label,
      description: entry.description,
      trusted: true,
      provenance: 'repo-examples',
      exampleDir: entry.exampleDir,
      ...(agentConfig.providerId ? { providerId: agentConfig.providerId } : {}),
      ...(agentConfig.modelId ? { modelId: agentConfig.modelId } : {}),
      ...(normalizeRuntimeProfile(agentConfig.runtimeProfile)
        ? { runtimeProfile: normalizeRuntimeProfile(agentConfig.runtimeProfile) }
        : {}),
      allowedTools: [...agentConfig.allowedTools],
      ...(agentConfig.approvalMode ? { approvalMode: agentConfig.approvalMode } : {}),
      defaults: entry.defaults,
      seedFiles,
    }
  })
}

export function installLocalMarketplaceTemplate(input: {
  repoRoot: string
  templateId: string
  workspaceRoot: string
  workspaceBaseRoot?: string
}): InstallLocalMarketplaceTemplateResult {
  const template = listLocalMarketplaceTemplates(input.repoRoot).find(
    (candidate) => candidate.templateId === input.templateId,
  )
  if (!template) throw new Error(`Unknown marketplace template: ${input.templateId}`)
  const exampleRoot = safeExampleRoot(input.repoRoot, template.exampleDir)
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const workspaceBaseRoot = input.workspaceBaseRoot
    ? path.resolve(input.workspaceBaseRoot)
    : undefined
  if (workspaceBaseRoot) {
    const existing = nearestExistingPath(workspaceRoot)
    const canonicalBaseRoot = fs.realpathSync.native(workspaceBaseRoot)
    const canonicalWorkspaceRoot = existing
      ? path.join(fs.realpathSync.native(existing), path.relative(existing, workspaceRoot))
      : workspaceRoot
    assertContained(
      canonicalBaseRoot,
      canonicalWorkspaceRoot,
      'Marketplace workspace root escapes the gateway workspace base.',
    )
    if (existing) {
      assertContained(
        canonicalBaseRoot,
        fs.realpathSync.native(existing),
        'Marketplace workspace root escapes the gateway workspace base.',
      )
    }
  }
  fs.mkdirSync(workspaceRoot, { recursive: true })
  if (workspaceBaseRoot) {
    assertContained(
      fs.realpathSync.native(workspaceBaseRoot),
      fs.realpathSync.native(workspaceRoot),
      'Marketplace workspace root escapes the gateway workspace base.',
    )
  }
  const installedFiles: string[] = []
  for (const seedFile of template.seedFiles) {
    const sourcePath = path.resolve(exampleRoot, seedFile.source)
    const destinationPath = path.resolve(workspaceRoot, seedFile.destination)
    assertContained(exampleRoot, sourcePath, 'Template source path escapes the example root.')
    assertContained(workspaceRoot, destinationPath, 'Template destination escapes the workspace root.')
    assertNoSymlinkSegments(exampleRoot, sourcePath, 'Template source traverses a symbolic link.')
    assertContained(
      fs.realpathSync.native(exampleRoot),
      fs.realpathSync.native(sourcePath),
      'Template source resolves outside the example root.',
    )
    assertNoSymlinkSegments(workspaceRoot, destinationPath, 'Template destination traverses a symbolic link.')
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
    assertNoSymlinkSegments(workspaceRoot, destinationPath, 'Template destination traverses a symbolic link.')
    fs.copyFileSync(sourcePath, destinationPath)
    installedFiles.push(seedFile.destination.replace(/\\/g, '/'))
  }
  return { template, installedFiles }
}

export function skillFlagsFromAllowedTools(allowedTools: string[]): Record<string, boolean> {
  const tools = new Set(allowedTools)
  return {
    'File tools': tools.has('file.read') || tools.has('file.write'),
    Memory: tools.has('memory.read') || tools.has('memory.write'),
    'Web fetch': tools.has('web.fetch') || tools.has('web.search'),
    Shell: tools.has('shell.exec') || tools.has('terminal.start'),
    Browser: [...tools].some((tool) => tool.startsWith('browser.')),
  }
}

export function consoleApprovalMode(input: string | undefined): string | undefined {
  if (!input) return undefined
  const normalized = input.trim().toLowerCase()
  if (normalized === 'balanced') return 'Balanced'
  if (normalized === 'ask-first' || normalized === 'ask first') return 'Ask first'
  if (normalized === 'autonomous') return 'Autonomous'
  return input
}

function safeExampleRoot(repoRoot: string, exampleDir: string): string {
  const examplesRoot = path.resolve(repoRoot, 'examples')
  const root = path.resolve(examplesRoot, safeRelativeTemplatePath(exampleDir))
  assertContained(examplesRoot, root, 'Template example dir escapes examples/.')
  if (!fs.existsSync(root)) throw new Error(`Template example dir not found: ${exampleDir}`)
  assertContained(
    fs.realpathSync.native(examplesRoot),
    fs.realpathSync.native(root),
    'Template example dir resolves outside examples/.',
  )
  return root
}

function safeRelativeTemplatePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').trim()
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`Unsafe template path: ${value}`)
  }
  const extension = path.extname(normalized).toLowerCase()
  if (extension && extension !== '.md' && extension !== '.json') {
    throw new Error(`Unsafe template file extension: ${value}`)
  }
  return normalized
}

function assertContained(root: string, target: string, message: string): void {
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(message)
  }
}

function nearestExistingPath(target: string): string | null {
  let current = path.resolve(target)
  for (;;) {
    if (fs.existsSync(current)) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function assertNoSymlinkSegments(root: string, target: string, message: string): void {
  const relative = path.relative(root, target)
  let current = root
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(message)
  }
}

function normalizeRuntimeProfile(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'core-memory') return 'core'
  return MainspringRuntimeProfileIdSchema.safeParse(normalized).success
    ? normalized
    : undefined
}
