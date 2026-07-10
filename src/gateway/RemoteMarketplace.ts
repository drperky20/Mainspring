import { createHash, createPublicKey, verify } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { assertPublicNetworkTarget, parsePublicHttpUrl } from '../containment/UrlPolicy.js'
import { scanTemplateCatalogEntry, type ProvenanceScanResult } from '../provenance/ProvenanceReview.js'

const MAX_CATALOG_BYTES = 1024 * 1024
const MAX_CATALOG_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30
const MAX_CLOCK_SKEW_MS = 1000 * 60 * 5
const MAX_REDIRECTS = 3

const RemoteTemplateDefaultsSchema = z.object({
  clientName: z.string().trim().min(1).max(200),
  workspaceName: z.string().trim().min(1).max(200),
  agentName: z.string().trim().min(1).max(200),
  outcome: z.string().trim().min(1).max(4_000),
  voice: z.string().trim().min(1).max(2_000),
  instructions: z.string().trim().min(1).max(20_000),
})

const RemoteTemplateFileSchema = z.object({
  destination: z.string().trim().min(1).max(500),
  content: z.string().max(256 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

const RemoteTemplateSchema = z.object({
  templateId: z.string().trim().min(1).max(200).regex(/^[a-z0-9][a-z0-9._-]*$/),
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2_000),
  providerId: z.string().trim().min(1).max(200).optional(),
  modelId: z.string().trim().min(1).max(300).optional(),
  runtimeProfile: z.string().trim().min(1).max(100).optional(),
  allowedTools: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  approvalMode: z.string().trim().min(1).max(100).optional(),
  defaults: RemoteTemplateDefaultsSchema,
  files: z.array(RemoteTemplateFileSchema).min(1).max(20),
})

const RemoteMarketplacePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  publisherId: z.string().trim().min(1).max(200),
  keyId: z.string().trim().min(1).max(200),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  templates: z.array(RemoteTemplateSchema).min(1).max(50),
})

const SignedRemoteMarketplaceCatalogSchema = z.object({
  payload: RemoteMarketplacePayloadSchema,
  signature: z.string().min(1).max(1_000),
})

export type RemoteMarketplacePayload = z.input<typeof RemoteMarketplacePayloadSchema>

export interface RemoteMarketplaceSource {
  catalogUrl: string
  publisherId: string
  keyId: string
  publicKeyPem: string
}

export interface VerifiedRemoteMarketplaceTemplate {
  templateId: string
  label: string
  description: string
  trusted: true
  provenance: 'signed-remote'
  publisherId: string
  keyId: string
  catalogUrl: string
  catalogHash: string
  providerId?: string
  modelId?: string
  runtimeProfile?: string
  allowedTools: string[]
  approvalMode?: string
  defaults: z.infer<typeof RemoteTemplateDefaultsSchema>
  files: Array<{ destination: string; content: string; sha256: string }>
  scan: ProvenanceScanResult
}

export interface RemoteMarketplaceFetchOptions {
  fetchImpl?: typeof fetch
  assertNetworkTarget?: (url: URL) => Promise<void>
  now?: () => Date
}

export class RemoteMarketplaceRegistry {
  private readonly templates = new Map<string, VerifiedRemoteMarketplaceTemplate>()

  constructor(
    private readonly sources: readonly RemoteMarketplaceSource[],
    private readonly options: RemoteMarketplaceFetchOptions = {},
  ) {}

  async sync(reservedTemplateIds: ReadonlySet<string> = new Set()): Promise<VerifiedRemoteMarketplaceTemplate[]> {
    const catalogs = await Promise.all(
      this.sources.map((source) => fetchVerifiedRemoteMarketplaceCatalog(source, this.options)),
    )
    const next = new Map<string, VerifiedRemoteMarketplaceTemplate>()
    for (const template of catalogs.flat()) {
      if (reservedTemplateIds.has(template.templateId) || next.has(template.templateId)) {
        throw new Error(`Remote marketplace template id collides with another trusted template: ${template.templateId}`)
      }
      next.set(template.templateId, deepFreezeTemplate(template))
    }
    this.templates.clear()
    for (const [templateId, template] of next) this.templates.set(templateId, template)
    return this.list()
  }

  list(): VerifiedRemoteMarketplaceTemplate[] {
    return [...this.templates.values()]
  }

  get(templateId: string): VerifiedRemoteMarketplaceTemplate | undefined {
    return this.templates.get(templateId)
  }
}

export async function fetchVerifiedRemoteMarketplaceCatalog(
  source: RemoteMarketplaceSource,
  options: RemoteMarketplaceFetchOptions = {},
): Promise<VerifiedRemoteMarketplaceTemplate[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const assertNetwork = options.assertNetworkTarget ?? assertPublicNetworkTarget
  let current = parseMarketplaceCatalogUrl(source.catalogUrl)
  let response: Response | undefined
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertNetwork(current)
    response = await fetchImpl(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    if (!location) throw new Error('Remote marketplace redirect omitted Location.')
    if (redirects === MAX_REDIRECTS) throw new Error('Remote marketplace redirect limit exceeded.')
    await response.body?.cancel()
    current = parseMarketplaceCatalogUrl(new URL(location, current).toString())
  }
  if (!response?.ok) throw new Error(`Remote marketplace catalog request failed with ${response?.status ?? 0}.`)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error('Remote marketplace catalog must use application/json.')
  }
  const bytes = await readBoundedResponseBody(response, MAX_CATALOG_BYTES)
  return verifyRemoteMarketplaceCatalog({
    source: { ...source, catalogUrl: current.toString() },
    catalogJson: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    now: options.now?.() ?? new Date(),
  })
}

export function verifyRemoteMarketplaceCatalog(input: {
  source: RemoteMarketplaceSource
  catalogJson: string
  now?: Date
}): VerifiedRemoteMarketplaceTemplate[] {
  if (Buffer.byteLength(input.catalogJson, 'utf8') > MAX_CATALOG_BYTES) {
    throw new Error('Remote marketplace catalog exceeds 1 MiB.')
  }
  const envelope = SignedRemoteMarketplaceCatalogSchema.parse(JSON.parse(input.catalogJson))
  const payload = RemoteMarketplacePayloadSchema.parse(envelope.payload)
  if (payload.publisherId !== input.source.publisherId || payload.keyId !== input.source.keyId) {
    throw new Error('Remote marketplace publisher or signing key does not match the pinned source.')
  }
  const issuedAtMs = Date.parse(payload.issuedAt)
  const expiresAtMs = Date.parse(payload.expiresAt)
  const nowMs = (input.now ?? new Date()).getTime()
  if (issuedAtMs > nowMs + MAX_CLOCK_SKEW_MS) throw new Error('Remote marketplace catalog is not valid yet.')
  if (expiresAtMs <= nowMs) throw new Error('Remote marketplace catalog has expired.')
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > MAX_CATALOG_LIFETIME_MS) {
    throw new Error('Remote marketplace catalog validity window is invalid.')
  }
  const canonicalPayload = canonicalJson(payload)
  const signature = Buffer.from(envelope.signature, 'base64')
  const publicKey = createPublicKey(input.source.publicKeyPem)
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Remote marketplace publisher key must be Ed25519.')
  }
  if (!signature.length || !verify(null, Buffer.from(canonicalPayload), publicKey, signature)) {
    throw new Error('Remote marketplace catalog signature is invalid.')
  }
  const catalogHash = sha256(canonicalPayload)
  const seen = new Set<string>()
  return payload.templates.map((template) => {
    if (seen.has(template.templateId)) throw new Error(`Duplicate remote template id: ${template.templateId}`)
    seen.add(template.templateId)
    const destinations = new Set<string>()
    const files = template.files.map((file) => {
      const destination = safeRemoteTemplatePath(file.destination)
      if (destinations.has(destination.toLowerCase())) {
        throw new Error(`Duplicate remote template destination: ${destination}`)
      }
      destinations.add(destination.toLowerCase())
      if (file.content.includes('\0')) throw new Error(`Remote template file contains NUL bytes: ${destination}`)
      if (Buffer.byteLength(file.content, 'utf8') > 256 * 1024) {
        throw new Error(`Remote template file exceeds 256 KiB: ${destination}`)
      }
      if (sha256(file.content) !== file.sha256) {
        throw new Error(`Remote template file hash mismatch: ${destination}`)
      }
      return { destination, content: file.content, sha256: file.sha256 }
    })
    const scan = scanTemplateCatalogEntry({
      templateId: template.templateId,
      label: template.label,
      description: template.description,
      allowedTools: template.allowedTools,
      seedFiles: files.map((file) => ({ source: file.destination, destination: file.destination })),
      content: [
        ...Object.values(template.defaults),
        ...files.map((file) => file.content),
      ],
    })
    if (scan.status !== 'pass') {
      throw new Error(`Remote marketplace template requires local review and was not cached: ${template.templateId}`)
    }
    return deepFreezeTemplate({
      templateId: template.templateId,
      label: template.label,
      description: template.description,
      trusted: true,
      provenance: 'signed-remote',
      publisherId: payload.publisherId,
      keyId: payload.keyId,
      catalogUrl: parseMarketplaceCatalogUrl(input.source.catalogUrl).toString(),
      catalogHash,
      ...(template.providerId ? { providerId: template.providerId } : {}),
      ...(template.modelId ? { modelId: template.modelId } : {}),
      ...(template.runtimeProfile ? { runtimeProfile: template.runtimeProfile } : {}),
      allowedTools: [...template.allowedTools],
      ...(template.approvalMode ? { approvalMode: template.approvalMode } : {}),
      defaults: template.defaults,
      files,
      scan,
    })
  })
}

export function canonicalRemoteMarketplacePayload(payload: RemoteMarketplacePayload): string {
  return canonicalJson(RemoteMarketplacePayloadSchema.parse(payload))
}

export function installVerifiedRemoteMarketplaceTemplate(input: {
  template: VerifiedRemoteMarketplaceTemplate
  workspaceRoot: string
  workspaceBaseRoot?: string
}): string[] {
  const workspaceRoot = prepareRemoteWorkspace(input.workspaceRoot, input.workspaceBaseRoot)
  const installedFiles: string[] = []
  for (const file of input.template.files) {
    const destinationPath = path.resolve(workspaceRoot, safeRemoteTemplatePath(file.destination))
    assertContained(workspaceRoot, destinationPath, 'Remote template destination escapes the workspace root.')
    assertNoSymlinkSegments(workspaceRoot, destinationPath)
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
    assertNoSymlinkSegments(workspaceRoot, destinationPath)
    fs.writeFileSync(destinationPath, file.content, { encoding: 'utf8', flag: 'w' })
    installedFiles.push(file.destination.replace(/\\/g, '/'))
  }
  return installedFiles
}

function parseMarketplaceCatalogUrl(value: string): URL {
  const raw = new URL(value.trim())
  if (raw.username || raw.password) throw new Error('Remote marketplace catalog URL cannot contain credentials.')
  for (const key of raw.searchParams.keys()) {
    if (/^(?:access[-_.]?token|api[-_.]?key|auth|authorization|credential|key|password|secret|session[-_.]?token|token)$/i.test(key)) {
      throw new Error('Remote marketplace catalog URL cannot contain auth-like query parameters.')
    }
  }
  const url = parsePublicHttpUrl(value, 'remote marketplace catalog URL')
  if (url.protocol !== 'https:') throw new Error('Remote marketplace catalogs require HTTPS.')
  return url
}

function safeRemoteTemplatePath(value: string): string {
  const candidate = value.replace(/\\/g, '/').trim()
  const normalized = path.posix.normalize(candidate)
  if (
    !normalized
    || normalized !== candidate
    || path.posix.isAbsolute(normalized)
    || path.win32.isAbsolute(normalized)
    || normalized.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error(`Unsafe remote template path: ${value}`)
  }
  const extension = path.extname(normalized).toLowerCase()
  if (extension !== '.md' && extension !== '.json') {
    throw new Error(`Unsafe remote template file extension: ${value}`)
  }
  return normalized
}

function prepareRemoteWorkspace(workspace: string, base?: string): string {
  const workspaceRoot = path.resolve(workspace)
  const baseRoot = base ? path.resolve(base) : undefined
  if (baseRoot) assertContained(baseRoot, workspaceRoot, 'Remote marketplace workspace escapes the gateway base.')
  fs.mkdirSync(workspaceRoot, { recursive: true })
  if (baseRoot) {
    assertContained(fs.realpathSync.native(baseRoot), fs.realpathSync.native(workspaceRoot), 'Remote marketplace workspace escapes the gateway base.')
  }
  return workspaceRoot
}

function assertNoSymlinkSegments(root: string, target: string): void {
  const relative = path.relative(root, target)
  let current = root
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Remote template destination traverses a symbolic link.')
    }
  }
}

function assertContained(root: string, target: string, message: string): void {
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(message)
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function deepFreezeTemplate(template: VerifiedRemoteMarketplaceTemplate): VerifiedRemoteMarketplaceTemplate {
  Object.freeze(template.allowedTools)
  Object.freeze(template.defaults)
  for (const file of template.files) Object.freeze(file)
  Object.freeze(template.files)
  for (const finding of template.scan.findings) Object.freeze(finding)
  Object.freeze(template.scan.findings)
  Object.freeze(template.scan)
  return Object.freeze(template)
}

async function readBoundedResponseBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('Remote marketplace catalog exceeds 1 MiB.')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new Error('Remote marketplace catalog exceeds 1 MiB.')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel()
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
