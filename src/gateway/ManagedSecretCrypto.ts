import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const MANAGED_SECRET_KEY_BYTES = 32
const MANAGED_SECRET_IV_BYTES = 12
const BASE64_KEY_PREFIX = 'base64:'
const DPAPI_KEY_PREFIX = 'dpapi:'
const CREDENTIAL_MANAGER_KEY_PREFIX = 'credential-manager:'

export type ManagedSecretCiphertext = {
  ciphertext: string
  iv: string
  authTag: string
}

export interface ManagedSecretDpapiAdapter {
  protect(secret: string): string
  unprotect(protectedSecret: string): string
}

export interface ManagedSecretCredentialStoreAdapter {
  read(targetName: string): string | null
  write(targetName: string, secret: string): void
  delete?(targetName: string): void
}

export type ManagedSecretKeyStorageMode = 'file' | 'credential-manager' | 'auto'

export type ManagedSecretKeyStorageStatus =
  | { kind: 'provided' }
  | { kind: 'windows-credential-manager'; credentialName: string; keyPath: string }
  | { kind: 'dpapi-file'; keyPath: string }
  | { kind: 'base64-file'; keyPath: string }

export function loadOrCreateManagedSecretKey(input: {
  keyPath: string
  providedKey?: string
  platform?: NodeJS.Platform
  dpapi?: ManagedSecretDpapiAdapter
  storageMode?: ManagedSecretKeyStorageMode
  credentialName?: string
  credentialStore?: ManagedSecretCredentialStoreAdapter
}): Buffer {
  return loadOrCreateManagedSecretKeyResult(input).key
}

export function loadOrCreateManagedSecretKeyResult(input: {
  keyPath: string
  providedKey?: string
  platform?: NodeJS.Platform
  dpapi?: ManagedSecretDpapiAdapter
  storageMode?: ManagedSecretKeyStorageMode
  credentialName?: string
  credentialStore?: ManagedSecretCredentialStoreAdapter
}): { key: Buffer; storage: ManagedSecretKeyStorageStatus } {
  const provided = normalizeManagedSecretKey(input.providedKey)
  if (provided) return { key: provided, storage: { kind: 'provided' } }

  const platform = input.platform ?? process.platform
  const dpapi = input.dpapi ?? (platform === 'win32' ? windowsDpapiAdapter() : undefined)
  const keyPath = path.resolve(input.keyPath)
  const storageMode = input.storageMode ?? 'file'
  const credentialName = input.credentialName ?? defaultCredentialName(keyPath)
  if (storageMode !== 'file') {
    const credentialResult = loadOrCreateCredentialManagedKey({
      keyPath,
      platform,
      credentialName,
      credentialStore: input.credentialStore,
      dpapi,
      required: storageMode === 'credential-manager',
    })
    if (credentialResult) return credentialResult
  }

  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  if (fs.existsSync(keyPath)) {
    const loaded = readManagedSecretKey(keyPath, { platform, dpapi })
    if (loaded.storage === 'credential-manager') {
      throw new Error(
        `Managed secret key file points to Windows Credential Manager but credential storage was not selected: ${keyPath}`,
      )
    }
    if (platform === 'win32' && dpapi && loaded.storage !== 'dpapi') {
      writeManagedSecretKey(keyPath, loaded.key, { platform, dpapi })
      return {
        key: loaded.key,
        storage: { kind: 'dpapi-file', keyPath },
      }
    }
    return {
      key: loaded.key,
      storage: {
        kind: loaded.storage === 'dpapi' ? 'dpapi-file' : 'base64-file',
        keyPath,
      },
    }
  }

  const generated = crypto.randomBytes(MANAGED_SECRET_KEY_BYTES)
  writeManagedSecretKey(keyPath, generated, { platform, dpapi })
  return {
    key: generated,
    storage: {
      kind: platform === 'win32' && dpapi ? 'dpapi-file' : 'base64-file',
      keyPath,
    },
  }
}

export function encryptManagedSecret(secret: string, key: Buffer): ManagedSecretCiphertext {
  const iv = crypto.randomBytes(MANAGED_SECRET_IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

export function decryptManagedSecret(input: ManagedSecretCiphertext, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(input.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(input.authTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function normalizeManagedSecretKey(value: string | undefined): Buffer | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  for (const encoding of ['base64', 'hex'] as const) {
    try {
      const decoded = Buffer.from(trimmed, encoding)
      if (decoded.byteLength === MANAGED_SECRET_KEY_BYTES) return decoded
    } catch {
      // ignore
    }
  }

  throw new Error(
    'Managed secret key must be 32 bytes encoded as base64 or hex.',
  )
}

function writeManagedSecretKey(
  keyPath: string,
  key: Buffer,
  input: { platform: NodeJS.Platform; dpapi?: ManagedSecretDpapiAdapter },
): void {
  const base64Key = key.toString('base64')
  const serialized =
    input.platform === 'win32' && input.dpapi
      ? `${DPAPI_KEY_PREFIX}${input.dpapi.protect(base64Key)}`
      : `${BASE64_KEY_PREFIX}${base64Key}`
  fs.writeFileSync(keyPath, serialized, { encoding: 'utf8', mode: 0o600 })
  fs.chmodSync(keyPath, 0o600)
}

function readManagedSecretKey(
  keyPath: string,
  input: { platform: NodeJS.Platform; dpapi?: ManagedSecretDpapiAdapter },
): { key: Buffer; storage: 'dpapi' | 'base64' | 'legacy' | 'credential-manager'; credentialName?: string } {
  const raw = fs.readFileSync(keyPath, 'utf8').trim()
  if (!raw) {
    throw new Error(`Managed secret key file is empty: ${keyPath}`)
  }

  if (raw.startsWith(CREDENTIAL_MANAGER_KEY_PREFIX)) {
    return {
      key: Buffer.alloc(0),
      storage: 'credential-manager',
      credentialName: raw.slice(CREDENTIAL_MANAGER_KEY_PREFIX.length),
    }
  }

  if (raw.startsWith(DPAPI_KEY_PREFIX)) {
    if (input.platform !== 'win32' || !input.dpapi) {
      throw new Error(`Managed secret key file requires Windows DPAPI: ${keyPath}`)
    }
    const decoded = normalizeManagedSecretKey(input.dpapi.unprotect(raw.slice(DPAPI_KEY_PREFIX.length)))
    if (!decoded) {
      throw new Error(`Managed secret key file could not be decrypted: ${keyPath}`)
    }
    return { key: decoded, storage: 'dpapi' }
  }

  if (raw.startsWith(BASE64_KEY_PREFIX)) {
    const decoded = normalizeManagedSecretKey(raw.slice(BASE64_KEY_PREFIX.length))
    if (!decoded) {
      throw new Error(`Managed secret key file is invalid: ${keyPath}`)
    }
    return { key: decoded, storage: 'base64' }
  }

  const decoded = normalizeManagedSecretKey(raw)
  if (!decoded) {
    throw new Error(`Managed secret key file is invalid: ${keyPath}`)
  }
  return { key: decoded, storage: 'legacy' }
}

function loadOrCreateCredentialManagedKey(input: {
  keyPath: string
  platform: NodeJS.Platform
  credentialName: string
  credentialStore?: ManagedSecretCredentialStoreAdapter
  dpapi?: ManagedSecretDpapiAdapter
  required: boolean
}): { key: Buffer; storage: ManagedSecretKeyStorageStatus } | null {
  if (input.platform !== 'win32') {
    if (input.required) {
      throw new Error('Windows Credential Manager managed-secret storage requires a Windows host.')
    }
    return null
  }

  const credentialStore = input.credentialStore ?? windowsCredentialManagerAdapter()
  try {
    const stored = credentialStore.read(input.credentialName)
    if (stored) {
      const key = normalizeManagedSecretKey(stored)
      if (!key) throw new Error(`Windows Credential Manager entry is invalid: ${input.credentialName}`)
      writeCredentialManagerPointer(input.keyPath, input.credentialName)
      return {
        key,
        storage: {
          kind: 'windows-credential-manager',
          credentialName: input.credentialName,
          keyPath: input.keyPath,
        },
      }
    }

    if (fs.existsSync(input.keyPath)) {
      const loaded = readManagedSecretKey(input.keyPath, {
        platform: input.platform,
        dpapi: input.dpapi,
      })
      if (loaded.storage === 'credential-manager') {
        const credentialName = loaded.credentialName ?? input.credentialName
        const pointed = credentialStore.read(credentialName)
        const key = normalizeManagedSecretKey(pointed ?? undefined)
        if (!key) throw new Error(`Windows Credential Manager entry is missing: ${credentialName}`)
        return {
          key,
          storage: { kind: 'windows-credential-manager', credentialName, keyPath: input.keyPath },
        }
      }
      credentialStore.write(input.credentialName, loaded.key.toString('base64'))
      writeCredentialManagerPointer(input.keyPath, input.credentialName)
      return {
        key: loaded.key,
        storage: {
          kind: 'windows-credential-manager',
          credentialName: input.credentialName,
          keyPath: input.keyPath,
        },
      }
    }

    const generated = crypto.randomBytes(MANAGED_SECRET_KEY_BYTES)
    credentialStore.write(input.credentialName, generated.toString('base64'))
    writeCredentialManagerPointer(input.keyPath, input.credentialName)
    return {
      key: generated,
      storage: {
        kind: 'windows-credential-manager',
        credentialName: input.credentialName,
        keyPath: input.keyPath,
      },
    }
  } catch (error) {
    if (input.required) throw error
    return null
  }
}

function writeCredentialManagerPointer(keyPath: string, credentialName: string): void {
  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  fs.writeFileSync(keyPath, `${CREDENTIAL_MANAGER_KEY_PREFIX}${credentialName}`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  fs.chmodSync(keyPath, 0o600)
}

function defaultCredentialName(keyPath: string): string {
  const digest = crypto.createHash('sha256').update(path.resolve(keyPath)).digest('hex').slice(0, 24)
  return `Mainspring/managed-secret-key/${digest}`
}

function windowsDpapiAdapter(): ManagedSecretDpapiAdapter {
  return {
    protect(secret: string): string {
      return execPowerShellSecretTransform({
        mode: 'protect',
        envKey: 'MAINSPRING_MANAGED_SECRET_PLAIN',
        envValue: secret,
      })
    },
    unprotect(protectedSecret: string): string {
      return execPowerShellSecretTransform({
        mode: 'unprotect',
        envKey: 'MAINSPRING_MANAGED_SECRET_PROTECTED',
        envValue: protectedSecret,
      })
    },
  }
}

function execPowerShellSecretTransform(input: {
  mode: 'protect' | 'unprotect'
  envKey: string
  envValue: string
}): string {
  const command =
    input.mode === 'protect'
      ? [
          "$value = [Environment]::GetEnvironmentVariable('MAINSPRING_MANAGED_SECRET_PLAIN')",
          "if ([string]::IsNullOrWhiteSpace($value)) { throw 'Missing managed secret input.' }",
          '$secure = ConvertTo-SecureString -String $value -AsPlainText -Force',
          '$secure | ConvertFrom-SecureString',
        ].join('; ')
      : [
          "$value = [Environment]::GetEnvironmentVariable('MAINSPRING_MANAGED_SECRET_PROTECTED')",
          "if ([string]::IsNullOrWhiteSpace($value)) { throw 'Missing managed secret input.' }",
          '$secure = ConvertTo-SecureString -String $value',
          '$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)',
          'try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }',
        ].join('; ')
  return execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, [input.envKey]: input.envValue },
    },
  ).trim()
}

function windowsCredentialManagerAdapter(): ManagedSecretCredentialStoreAdapter {
  return {
    read(targetName: string): string | null {
      const value = execPowerShellCredentialManager({
        mode: 'read',
        targetName,
      })
      return value || null
    },
    write(targetName: string, secret: string): void {
      execPowerShellCredentialManager({
        mode: 'write',
        targetName,
        secret,
      })
    },
    delete(targetName: string): void {
      execPowerShellCredentialManager({
        mode: 'delete',
        targetName,
      })
    },
  }
}

function execPowerShellCredentialManager(input: {
  mode: 'read' | 'write' | 'delete'
  targetName: string
  secret?: string
}): string {
  const source = [
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class MainspringCredMan {',
    '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    '  public struct CREDENTIAL {',
    '    public UInt32 Flags;',
    '    public UInt32 Type;',
    '    public string TargetName;',
    '    public string Comment;',
    '    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;',
    '    public UInt32 CredentialBlobSize;',
    '    public IntPtr CredentialBlob;',
    '    public UInt32 Persist;',
    '    public UInt32 AttributeCount;',
    '    public IntPtr Attributes;',
    '    public string TargetAlias;',
    '    public string UserName;',
    '  }',
    '  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]',
    '  public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);',
    '  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]',
    '  public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);',
    '  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]',
    '  public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);',
    '  [DllImport("advapi32.dll", SetLastError = true)]',
    '  public static extern void CredFree(IntPtr cred);',
    '}',
  ].join('\n')
  const command = [
    `$source = @'\n${source}\n'@`,
    'Add-Type -TypeDefinition $source',
    "$target = [Environment]::GetEnvironmentVariable('MAINSPRING_CREDENTIAL_TARGET')",
    "if ([string]::IsNullOrWhiteSpace($target)) { throw 'Missing credential target.' }",
    '$type = [UInt32]1',
    input.mode === 'read'
      ? [
          '$ptr = [IntPtr]::Zero',
          'if (-not [MainspringCredMan]::CredRead($target, $type, 0, [ref]$ptr)) {',
          '  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()',
          '  if ($err -eq 1168) { exit 0 }',
          "  throw \"CredRead failed: $err\"",
          '}',
          'try {',
          '  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][MainspringCredMan+CREDENTIAL])',
          '  $bytes = New-Object byte[] $cred.CredentialBlobSize',
          '  [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $bytes.Length)',
          '  [Text.Encoding]::UTF8.GetString($bytes)',
          '} finally {',
          '  [MainspringCredMan]::CredFree($ptr)',
          '}',
        ].join('; ')
      : input.mode === 'write'
        ? [
            "$secret = [Environment]::GetEnvironmentVariable('MAINSPRING_CREDENTIAL_SECRET')",
            "if ([string]::IsNullOrWhiteSpace($secret)) { throw 'Missing credential secret.' }",
            '$bytes = [Text.Encoding]::UTF8.GetBytes($secret)',
            '$blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)',
            'try {',
            '  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)',
            '  $cred = New-Object MainspringCredMan+CREDENTIAL',
            '  $cred.Type = $type',
            '  $cred.TargetName = $target',
            "  $cred.UserName = 'Mainspring'",
            '  $cred.Persist = [UInt32]2',
            '  $cred.CredentialBlobSize = [UInt32]$bytes.Length',
            '  $cred.CredentialBlob = $blob',
            '  if (-not [MainspringCredMan]::CredWrite([ref]$cred, 0)) {',
            '    $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()',
            "    throw \"CredWrite failed: $err\"",
            '  }',
            '} finally {',
            '  [Runtime.InteropServices.Marshal]::FreeHGlobal($blob)',
            '}',
          ].join('; ')
        : [
            'if (-not [MainspringCredMan]::CredDelete($target, $type, 0)) {',
            '  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()',
            '  if ($err -ne 1168) { throw "CredDelete failed: $err" }',
            '}',
          ].join('; '),
  ].join('; ')
  return execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MAINSPRING_CREDENTIAL_TARGET: input.targetName,
        ...(input.secret ? { MAINSPRING_CREDENTIAL_SECRET: input.secret } : {}),
      },
    },
  ).trim()
}
