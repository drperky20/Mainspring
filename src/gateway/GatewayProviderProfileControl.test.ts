import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSqliteLocalGatewayAppStateStore,
  type CreateLocalGatewayProviderProfileInput,
  type LocalGatewayAppStateStore,
  type UpdateLocalGatewayProviderProfileInput,
} from './AppStateStore.js'
import { GatewayProviderProfileControl } from './GatewayProviderProfileControl.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    removeTempRoot(root)
  }
  tempRoots.length = 0
})

function removeTempRoot(root: string): void {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (
        !(error instanceof Error)
        || !('code' in error)
        || (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      if (attempt === 4) return
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

describe('GatewayProviderProfileControl', () => {
  it('rejects malformed direct control input before it can create durable authority evidence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-provider-control-invalid-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const control = new GatewayProviderProfileControl({ appState })

    try {
      expect(() => control.create({
        providerId: ' ',
        label: 'Invalid provider profile',
        secretRef: 'env:PROVIDER_CONTROL_TEST_KEY',
      })).toThrow('provider id is required.')
      expect(() => control.update({ profileId: ' ' })).toThrow('provider profileId is required.')
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual([])
    } finally {
      appState.close()
    }
  })

  it('records hash-only authority before provider-profile mutation and preserves managed-secret containment', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-provider-control-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const persistedCreate = appState.providerProfiles.create
    const persistedUpdate = appState.providerProfiles.update
    let createSawAuthorization = false
    let updateSawAuthorization = false
    const controlState = {
      ...appState,
      providerProfiles: {
        ...appState.providerProfiles,
        create: (input: CreateLocalGatewayProviderProfileInput) => {
          createSawAuthorization = appState.auditEvents.list({ category: 'gateway' }).some((event) => (
            event.action === 'provider-profile.created.authorized'
          ))
          return persistedCreate(input)
        },
        update: (input: UpdateLocalGatewayProviderProfileInput) => {
          updateSawAuthorization = appState.auditEvents.list({ category: 'gateway' }).some((event) => (
            event.action === 'provider-profile.updated.authorized'
          ))
          return persistedUpdate(input)
        },
      },
    } as unknown as LocalGatewayAppStateStore
    const control = new GatewayProviderProfileControl({ appState: controlState })
    const firstSecret = 'provider-control-first-secret'
    const secondSecret = 'provider-control-second-secret'
    const secretLabel = 'Provider secretRef=env:PROVIDER_CONTROL_TEST_KEY'

    try {
      const created = control.create({
        providerId: 'openrouter',
        label: secretLabel,
        secretValue: firstSecret,
        defaultModelId: 'openrouter/test-model',
        actor: 'hosted:provider_control:admin',
      })
      expect(createSawAuthorization).toBe(true)
      expect(created).toMatchObject({
        secretRef: `managed:${created.profileId}`,
        managedSecretStored: true,
      })

      const updated = control.update({
        profileId: created.profileId,
        label: 'Approved provider profile',
        secretValue: secondSecret,
        status: 'archived',
        actor: 'hosted:provider_control:admin',
      })
      expect(updateSawAuthorization).toBe(true)
      expect(updated).toMatchObject({
        profileId: created.profileId,
        label: 'Approved provider profile',
        status: 'archived',
        secretRef: `managed:${created.profileId}`,
        managedSecretStored: true,
      })
      expect(appState.resolveSecretRef(`managed:${created.profileId}`)).toBe(secondSecret)

      const events = appState.auditEvents.list({ category: 'gateway' })
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'provider-profile.created.authorized',
          actor: 'hosted:provider_control:admin',
          targetId: created.profileId,
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({
              surface: 'provider_config',
              operation: 'provider_config.write',
              targetKey: created.profileId,
              state: 'allow',
              metadata: expect.objectContaining({
                mutation: 'create',
                credentialMode: 'managed',
                providerProfileHash: expect.any(String),
              }),
            }),
          }),
        }),
        expect.objectContaining({
          action: 'provider-profile.updated.authorized',
          actor: 'hosted:provider_control:admin',
          targetId: created.profileId,
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({
              surface: 'provider_config',
              operation: 'provider_config.write',
              targetKey: created.profileId,
              state: 'allow',
              metadata: expect.objectContaining({
                mutation: 'update',
                credentialMode: 'managed',
                providerProfileHash: expect.any(String),
                previousProviderProfileHash: expect.any(String),
              }),
            }),
          }),
        }),
        expect.objectContaining({
          action: 'provider-profile.updated',
          actor: 'hosted:provider_control:admin',
          targetId: created.profileId,
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({ operation: 'provider_config.write' }),
            credentialMode: 'managed',
            providerProfileHash: expect.any(String),
          }),
        }),
      ]))
      expect(JSON.stringify(events)).not.toContain(firstSecret)
      expect(JSON.stringify(events)).not.toContain(secondSecret)
      expect(JSON.stringify(events)).not.toContain(secretLabel)
      expect(JSON.stringify(events)).not.toContain('PROVIDER_CONTROL_TEST_KEY')
      expect(JSON.stringify(appState.providerProfiles.list())).not.toContain(firstSecret)
      expect(JSON.stringify(appState.providerProfiles.list())).not.toContain(secondSecret)
    } finally {
      appState.close()
    }
  })
})
