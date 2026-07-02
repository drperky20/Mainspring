import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { listLocalMarketplaceTemplates } from '../dist/gateway/TemplateMarketplace.js'
import { scanTemplateCatalogEntry } from '../dist/provenance/ProvenanceReview.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templates = listLocalMarketplaceTemplates(repoRoot)
const failures = []
const scans = []

for (const template of templates) {
  const first = scanTemplateCatalogEntry({
    templateId: template.templateId,
    label: template.label,
    description: template.description,
    allowedTools: template.allowedTools,
    seedFiles: template.seedFiles,
  })
  const second = scanTemplateCatalogEntry({
    templateId: template.templateId,
    label: template.label,
    description: template.description,
    allowedTools: template.allowedTools,
    seedFiles: template.seedFiles,
  })

  if (first.contentHash !== second.contentHash) {
    failures.push(`${template.templateId}: non-deterministic provenance content hash`)
  }
  for (const finding of first.findings) {
    if (finding.severity === 'block') {
      failures.push(`${template.templateId}: ${finding.ruleId}: ${finding.message}`)
    }
  }
  scans.push({
    templateId: template.templateId,
    status: first.status,
    contentHash: first.contentHash,
    findings: first.findings.map((finding) => ({
      ruleId: finding.ruleId,
      severity: finding.severity,
    })),
  })
}

if (templates.length === 0) {
  failures.push('No local example templates were scanned.')
}

if (failures.length > 0) {
  console.error('Mainspring skill/template provenance check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(JSON.stringify({ scannedTemplates: scans }, null, 2))
console.log('MAINSPRING_SKILL_PROVENANCE_CHECK_OK')
