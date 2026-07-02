import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadOrCreateManagedSecretKey,
  loadOrCreateManagedSecretKeyResult,
} from './ManagedSecretCrypto.js'

function makeTempRoot(prefix: string): string {
  const parent = path.join(process.cwd(), '.tmp-managed-secret-crypto')
  fs.mkdirSync(parent, { recursive: true })
  return fs.mkdtempSync(path.join(parent, prefix))
}

function mockDpapi() {
  return {
    protect(secret: string): string {
      return `wrapped:${Buffer.from(secret, 'utf8').toString('hex')}`
    },
    unprotect(protectedSecret: string): string {
      if (!protectedSecret.startsWith('wrapped:')) {
        throw new Error('Unexpected DPAPI payload')
      }
      return Buffer.from(protectedSecret.slice('wrapped:'.length), 'hex').toString('utf8')
    },
  }
}

function mockCredentialStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    adapter: {
      read(targetName: string): string | null {
        return values.get(targetName) ?? null
      },
      write(targetName: string, secret: string): void {
        values.set(targetName, secret)
      },
      delete(targetName: string): void {
        values.delete(targetName)
      },
    },
  }
}

describe('ManagedSecretCrypto', () => {
  it('stores new managed-secret keys behind DPAPI on Windows when a protector is available', () => {
    const root = makeTempRoot('managed-secret-crypto-win32-')
    const keyPath = path.join(root, 'gateway.managed-key')
    const dpapi = mockDpapi()

    const key = loadOrCreateManagedSecretKey({
      keyPath,
      platform: 'win32',
      dpapi,
    })

    expect(key.byteLength).toBe(32)
    const stored = fs.readFileSync(keyPath, 'utf8').trim()
    expect(stored.startsWith('dpapi:')).toBe(true)
    expect(stored).not.toContain(key.toString('base64'))

    const reloaded = loadOrCreateManagedSecretKey({
      keyPath,
      platform: 'win32',
      dpapi,
    })
    expect(reloaded.equals(key)).toBe(true)
  })

  it('migrates legacy base64 key files into DPAPI-wrapped storage on Windows', () => {
    const root = makeTempRoot('managed-secret-crypto-migrate-')
    const keyPath = path.join(root, 'gateway.managed-key')
    const dpapi = mockDpapi()
    const rawKey = Buffer.alloc(32, 7).toString('base64')
    fs.writeFileSync(keyPath, rawKey, 'utf8')

    const loaded = loadOrCreateManagedSecretKey({
      keyPath,
      platform: 'win32',
      dpapi,
    })

    expect(loaded.equals(Buffer.alloc(32, 7))).toBe(true)
    expect(fs.readFileSync(keyPath, 'utf8').trim().startsWith('dpapi:')).toBe(true)
  })

  it('falls back to explicit local base64 key files on non-Windows hosts', () => {
    const root = makeTempRoot('managed-secret-crypto-linux-')
    const keyPath = path.join(root, 'gateway.managed-key')

    const key = loadOrCreateManagedSecretKey({
      keyPath,
      platform: 'linux',
    })

    expect(key.byteLength).toBe(32)
    const stored = fs.readFileSync(keyPath, 'utf8').trim()
    expect(stored.startsWith('base64:')).toBe(true)

    const reloaded = loadOrCreateManagedSecretKey({
      keyPath,
      platform: 'linux',
    })
    expect(reloaded.equals(key)).toBe(true)
  })

  it('stores new managed-secret keys in Windows Credential Manager when requested', () => {
    const root = makeTempRoot('managed-secret-crypto-credman-')
    const keyPath = path.join(root, 'gateway.managed-key')
    const credentialStore = mockCredentialStore()

    const result = loadOrCreateManagedSecretKeyResult({
      keyPath,
      platform: 'win32',
      storageMode: 'credential-manager',
      credentialName: 'Mainspring/TestCredential',
      credentialStore: credentialStore.adapter,
    })

    expect(result.key.byteLength).toBe(32)
    expect(result.storage).toMatchObject({
      kind: 'windows-credential-manager',
      credentialName: 'Mainspring/TestCredential',
    })
    expect(credentialStore.values.get('Mainspring/TestCredential')).toBe(result.key.toString('base64'))
    const pointer = fs.readFileSync(keyPath, 'utf8').trim()
    expect(pointer).toBe('credential-manager:Mainspring/TestCredential')
    expect(pointer).not.toContain(result.key.toString('base64'))

    const reloaded = loadOrCreateManagedSecretKeyResult({
      keyPath,
      platform: 'win32',
      storageMode: 'credential-manager',
      credentialName: 'Mainspring/TestCredential',
      credentialStore: credentialStore.adapter,
    })
    expect(reloaded.key.equals(result.key)).toBe(true)
    expect(reloaded.storage.kind).toBe('windows-credential-manager')
  })

  it('migrates existing file-backed keys into Windows Credential Manager when requested', () => {
    const root = makeTempRoot('managed-secret-crypto-credman-migrate-')
    const keyPath = path.join(root, 'gateway.managed-key')
    const credentialStore = mockCredentialStore()
    const rawKey = Buffer.alloc(32, 9)
    fs.writeFileSync(keyPath, `base64:${rawKey.toString('base64')}`, 'utf8')

    const result = loadOrCreateManagedSecretKeyResult({
      keyPath,
      platform: 'win32',
      storageMode: 'credential-manager',
      credentialName: 'Mainspring/MigratedCredential',
      credentialStore: credentialStore.adapter,
    })

    expect(result.key.equals(rawKey)).toBe(true)
    expect(credentialStore.values.get('Mainspring/MigratedCredential')).toBe(rawKey.toString('base64'))
    const pointer = fs.readFileSync(keyPath, 'utf8').trim()
    expect(pointer).toBe('credential-manager:Mainspring/MigratedCredential')
    expect(pointer).not.toContain(rawKey.toString('base64'))
  })

  it('fails closed when a credential-manager pointer cannot be resolved', () => {
    const root = makeTempRoot('managed-secret-crypto-credman-missing-')
    const keyPath = path.join(root, 'gateway.managed-key')
    fs.writeFileSync(keyPath, 'credential-manager:Mainspring/MissingCredential', 'utf8')

    expect(() =>
      loadOrCreateManagedSecretKeyResult({
        keyPath,
        platform: 'win32',
        storageMode: 'credential-manager',
        credentialName: 'Mainspring/MissingCredential',
        credentialStore: mockCredentialStore().adapter,
      }),
    ).toThrow(/Windows Credential Manager entry is missing/)
  })
})
