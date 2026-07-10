import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteLocalGatewayAppStateStore } from '../index.js'
import { HostedGatewayAuthManager, HostedGatewayFinalAdminError } from './HostedAuth.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

describe('HostedGatewayAuthManager user administration', () => {
  it('manages roles, protects the final admin, and revokes sessions after credential changes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-hosted-auth-users-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({ dbPath: path.join(root, 'gateway.sqlite') })
    try {
      const auth = new HostedGatewayAuthManager(appState)
      const admin = auth.bootstrapAdmin({ username: 'Admin', password: 'AdminPassword123' })
      const operator = auth.createUser({
        username: 'Operator',
        password: 'OperatorPassword123',
        role: 'operator',
      })
      auth.createUser({ username: 'Viewer', password: 'ViewerPassword123', role: 'viewer' })

      expect(auth.listUsers()).toEqual(expect.arrayContaining([
        expect.objectContaining({ username: 'admin', role: 'admin' }),
        expect.objectContaining({ username: 'operator', role: 'operator' }),
        expect.objectContaining({ username: 'viewer', role: 'viewer' }),
      ]))
      expect(JSON.stringify(auth.listUsers())).not.toContain('passwordHash')
      expect(() => auth.updateUser(admin.userId, { role: 'viewer' })).toThrow(HostedGatewayFinalAdminError)

      const login = auth.login({ username: 'operator', password: 'OperatorPassword123' })
      expect(auth.resolveSession(login.sessionToken)?.user.role).toBe('operator')
      auth.updateUser(operator.userId, { password: 'ReplacementPassword123' })
      expect(auth.resolveSession(login.sessionToken)).toBeNull()
      expect(auth.login({ username: 'operator', password: 'ReplacementPassword123' }).user.role).toBe('operator')
    } finally {
      appState.close()
    }
  })
})
