import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installLocalMarketplaceTemplate } from './TemplateMarketplace.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
  roots.length = 0
})

describe('local marketplace filesystem safety', () => {
  it('rejects a destination symlink that escapes the workspace', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-local-marketplace-link-'))
    roots.push(root)
    const repoRoot = path.join(root, 'repo')
    const exampleRoot = path.join(repoRoot, 'examples', 'fixture')
    fs.mkdirSync(exampleRoot, { recursive: true })
    fs.writeFileSync(path.join(repoRoot, 'examples', 'templates.json'), JSON.stringify([{
      templateId: 'fixture',
      label: 'Fixture',
      description: 'Fixture template',
      exampleDir: 'fixture',
      seedFiles: [{ source: 'guide.md', destination: 'docs/guide.md' }],
      defaults: {
        clientName: 'Client',
        workspaceName: 'Workspace',
        agentName: 'Agent',
        outcome: 'Outcome',
        voice: 'Voice',
        instructions: 'Instructions',
      },
    }]))
    fs.writeFileSync(path.join(exampleRoot, 'agent.config.json'), JSON.stringify({ allowedTools: [] }))
    fs.writeFileSync(path.join(exampleRoot, 'guide.md'), '# guide\n')
    const workspaceBase = path.join(root, 'workspaces')
    const workspace = path.join(workspaceBase, 'fixture')
    const outside = path.join(root, 'outside')
    fs.mkdirSync(workspace, { recursive: true })
    fs.mkdirSync(outside, { recursive: true })
    fs.symlinkSync(outside, path.join(workspace, 'docs'), 'junction')

    expect(() => installLocalMarketplaceTemplate({
      repoRoot,
      templateId: 'fixture',
      workspaceRoot: workspace,
      workspaceBaseRoot: workspaceBase,
    })).toThrow('symbolic link')
    expect(fs.existsSync(path.join(outside, 'guide.md'))).toBe(false)
  })

  it('rejects an example directory symlink that escapes the repository catalog', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-local-marketplace-source-link-'))
    roots.push(root)
    const repoRoot = path.join(root, 'repo')
    const examplesRoot = path.join(repoRoot, 'examples')
    const outside = path.join(root, 'outside-example')
    fs.mkdirSync(examplesRoot, { recursive: true })
    fs.mkdirSync(outside, { recursive: true })
    fs.writeFileSync(path.join(outside, 'agent.config.json'), JSON.stringify({ allowedTools: [] }))
    fs.writeFileSync(path.join(outside, 'guide.md'), '# outside\n')
    fs.symlinkSync(outside, path.join(examplesRoot, 'fixture'), 'junction')
    fs.writeFileSync(path.join(examplesRoot, 'templates.json'), JSON.stringify([{
      templateId: 'fixture',
      label: 'Fixture',
      description: 'Fixture template',
      exampleDir: 'fixture',
      seedFiles: [{ source: 'guide.md', destination: 'guide.md' }],
      defaults: {
        clientName: 'Client',
        workspaceName: 'Workspace',
        agentName: 'Agent',
        outcome: 'Outcome',
        voice: 'Voice',
        instructions: 'Instructions',
      },
    }]))

    expect(() => installLocalMarketplaceTemplate({
      repoRoot,
      templateId: 'fixture',
      workspaceRoot: path.join(root, 'workspace'),
    })).toThrow('resolves outside examples')
  })
})
