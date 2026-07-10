import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MockProvider } from '../../providers/MockProvider.js'
import { createMainspring } from '../../sdk/Mainspring.js'
import { createLocalMainspringGateway, createSqliteLocalGatewayAppStateStore } from '../index.js'
import { canonicalRemoteMarketplacePayload, type RemoteMarketplacePayload } from '../RemoteMarketplace.js'
import { createLocalGatewayServer } from './createLocalGatewayServer.js'

describe('remote marketplace gateway routes', () => {
  it('syncs a pinned catalog and installs its signed text payload', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-remote-marketplace-server-'))
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceBase = path.join(root, 'workspaces')
    const appState = createSqliteLocalGatewayAppStateStore({ dbPath: path.join(root, 'gateway.sqlite') })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot: workspaceBase,
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'ok' } }]),
    })
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const content = '# Remote guide\n'
    const payload: RemoteMarketplacePayload = {
      schemaVersion: 1,
      publisherId: 'publisher.example',
      keyId: 'release-2026',
      issuedAt: '2026-07-10T00:00:00.000Z',
      expiresAt: '2026-07-20T00:00:00.000Z',
      templates: [{
        templateId: 'remote-support',
        label: 'Remote support',
        description: 'Signed support template',
        allowedTools: ['file.read'],
        defaults: {
          clientName: 'Remote Client',
          workspaceName: 'Remote Workspace',
          agentName: 'Remote Agent',
          outcome: 'Use signed guidance.',
          voice: 'Concise',
          instructions: 'Read the signed guide.',
        },
        files: [{
          destination: 'guides/support.md',
          content,
          sha256: createHash('sha256').update(content).digest('hex'),
        }],
      }],
    }
    const catalogJson = JSON.stringify({
      payload,
      signature: sign(null, Buffer.from(canonicalRemoteMarketplacePayload(payload)), privateKey).toString('base64'),
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      marketplace: {
        repoRoot: process.cwd(),
        remote: {
          sources: [{
            catalogUrl: 'https://market.example/catalog.json',
            publisherId: payload.publisherId,
            keyId: payload.keyId,
            publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
          }],
          fetchImpl: async () => new Response(catalogJson, { headers: { 'content-type': 'application/json' } }),
          assertNetworkTarget: async () => {},
          now: () => new Date('2026-07-11T00:00:00.000Z'),
        },
      },
    })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })
    await mainspring.start()
    try {
      const started = await server.start()
      const syncResponse = await fetch(`${started.url}/marketplace/remotes/sync`, { method: 'POST' })
      const syncBody = await syncResponse.json()
      expect(syncResponse.status).toBe(200)
      expect(syncBody.templates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          templateId: 'remote-support',
          provenance: 'signed-remote',
          publisherId: 'publisher.example',
        }),
      ]))
      expect(JSON.stringify(syncBody)).not.toContain(content)

      const installRoot = path.join(workspaceBase, 'remote-installed')
      const installResponse = await fetch(`${started.url}/marketplace/templates/remote-support/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceRoot: installRoot }),
      })
      const installBody = await installResponse.json()
      expect(installResponse.status).toBe(201)
      expect(installBody.template).toMatchObject({
        templateId: 'remote-support',
        provenance: 'signed-remote',
        publisherId: 'publisher.example',
      })
      expect(fs.readFileSync(path.join(installRoot, 'guides', 'support.md'), 'utf8')).toBe(content)
      expect(appState.auditEvents.list({ category: 'marketplace' })).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'remote-catalogs.synced' }),
        expect.objectContaining({ action: 'template.installed', targetId: 'remote-support' }),
      ]))
    } finally {
      await server.stop()
      await mainspring.stop()
      appState.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 30_000)
})
