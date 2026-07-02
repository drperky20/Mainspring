import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { LocalGatewayAppStateStore, LocalGatewayAuthSessionRecord, LocalGatewayAuthUserRecord } from '../AppStateStore.js'

export interface HostedGatewayAuthBootstrapInput {
  username: string
  password: string
}

export interface HostedGatewayAuthLoginResult {
  sessionToken: string
  session: LocalGatewayAuthSessionRecord
  user: LocalGatewayAuthUserRecord
}

export interface HostedGatewayAuthSessionView {
  authenticated: boolean
  authMode: 'hosted'
  user?: Pick<LocalGatewayAuthUserRecord, 'userId' | 'username' | 'role'>
  expiresAt?: string
  bootstrapRequired: boolean
}

const PASSWORD_KEYLEN = 64
const SESSION_TOKEN_BYTES = 32

function normalizeUsername(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) throw new Error('Username is required.')
  return trimmed
}

function passwordMaterial(password: string): string {
  const trimmed = password.trim()
  if (trimmed.length < 8) {
    throw new Error('Password must be at least 8 characters.')
  }
  return trimmed
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createHostedPasswordHash(password: string): {
  passwordSalt: string
  passwordHash: string
  passwordAlgorithm: 'scrypt-v1'
} {
  const normalizedPassword = passwordMaterial(password)
  const passwordSalt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync(normalizedPassword, passwordSalt, PASSWORD_KEYLEN).toString('hex')
  return { passwordSalt, passwordHash, passwordAlgorithm: 'scrypt-v1' }
}

export function verifyHostedPassword(input: {
  password: string
  passwordSalt: string
  passwordHash: string
}): boolean {
  const derived = scryptSync(passwordMaterial(input.password), input.passwordSalt, PASSWORD_KEYLEN)
  const stored = Buffer.from(input.passwordHash, 'hex')
  return stored.length === derived.length && timingSafeEqual(stored, derived)
}

export class HostedGatewayAuthManager {
  constructor(
    private readonly appState: LocalGatewayAppStateStore,
    private readonly sessionTtlMs = 1000 * 60 * 60 * 12,
  ) {}

  authMode(): 'hosted' {
    return 'hosted'
  }

  bootstrapRequired(): boolean {
    return this.appState.authUsers.list({ status: 'active' }).length === 0
  }

  bootstrapAdmin(input: HostedGatewayAuthBootstrapInput): LocalGatewayAuthUserRecord {
    if (!this.bootstrapRequired()) {
      throw new Error('Hosted auth is already bootstrapped.')
    }
    const username = normalizeUsername(input.username)
    const { passwordSalt, passwordHash, passwordAlgorithm } = createHostedPasswordHash(input.password)
    return this.appState.authUsers.create({
      username,
      passwordSalt,
      passwordHash,
      passwordAlgorithm,
      role: 'admin',
      status: 'active',
    })
  }

  login(input: HostedGatewayAuthBootstrapInput): HostedGatewayAuthLoginResult {
    const username = normalizeUsername(input.username)
    const user = this.appState.authUsers.getByUsername(username)
    if (!user || user.status !== 'active') {
      throw new Error('Invalid username or password.')
    }
    if (!verifyHostedPassword({
      password: input.password,
      passwordSalt: user.passwordSalt,
      passwordHash: user.passwordHash,
    })) {
      throw new Error('Invalid username or password.')
    }
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs).toISOString()
    const sessionToken = randomBytes(SESSION_TOKEN_BYTES).toString('hex')
    const session = this.appState.authSessions.create({
      userId: user.userId,
      tokenHash: tokenHash(sessionToken),
      expiresAt,
      status: 'active',
      lastUsedAt: now.toISOString(),
    })
    const updatedUser = this.appState.authUsers.update({
      userId: user.userId,
      lastLoginAt: now.toISOString(),
    })
    return { sessionToken, session, user: updatedUser }
  }

  resolveSession(sessionToken: string | undefined): {
    session: LocalGatewayAuthSessionRecord
    user: LocalGatewayAuthUserRecord
  } | null {
    const token = sessionToken?.trim()
    if (!token) return null
    const session = this.appState.authSessions.getByTokenHash(tokenHash(token))
    if (!session || session.status !== 'active') return null
    const now = new Date()
    if (new Date(session.expiresAt).getTime() <= now.getTime()) {
      this.appState.authSessions.update({
        authSessionId: session.authSessionId,
        status: 'expired',
        lastUsedAt: now.toISOString(),
      })
      return null
    }
    const user = this.appState.authUsers.get(session.userId)
    if (!user || user.status !== 'active') return null
    this.appState.authSessions.update({
      authSessionId: session.authSessionId,
      lastUsedAt: now.toISOString(),
    })
    return { session, user }
  }

  sessionView(sessionToken: string | undefined): HostedGatewayAuthSessionView {
    const resolved = this.resolveSession(sessionToken)
    return resolved
      ? {
          authenticated: true,
          authMode: 'hosted',
          user: {
            userId: resolved.user.userId,
            username: resolved.user.username,
            role: resolved.user.role,
          },
          expiresAt: resolved.session.expiresAt,
          bootstrapRequired: false,
        }
      : {
          authenticated: false,
          authMode: 'hosted',
          bootstrapRequired: this.bootstrapRequired(),
        }
  }

  logout(sessionToken: string | undefined): void {
    const resolved = this.resolveSession(sessionToken)
    if (!resolved) return
    this.appState.authSessions.update({
      authSessionId: resolved.session.authSessionId,
      status: 'revoked',
      lastUsedAt: new Date().toISOString(),
    })
  }
}
