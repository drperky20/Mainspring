import { describe, expect, it } from 'vitest'
import { gatewayRoleAllows, requiredGatewayPermission } from './GatewayAuthorization.js'

describe('gateway role authorization', () => {
  it('grants reads by role and keeps unclassified mutations admin-only', () => {
    expect(requiredGatewayPermission('GET', '/snapshot')).toBe('read')
    expect(requiredGatewayPermission('GET', '/auth/users')).toBe('admin')
    expect(requiredGatewayPermission('POST', '/runs/start')).toBe('operate')
    expect(requiredGatewayPermission('POST', '/chat/stream')).toBe('operate')
    expect(requiredGatewayPermission('POST', '/provenance-reviews/review_1/apply')).toBe('operate')
    expect(requiredGatewayPermission('POST', '/memory-history/memory_opaque_id/correct')).toBe('operate')
    expect(requiredGatewayPermission('POST', '/memory-history/memory_opaque_id/delete')).toBe('operate')
    expect(requiredGatewayPermission('POST', '/provider-profiles')).toBe('admin')
    expect(requiredGatewayPermission('POST', '/marketplace/remotes/sync')).toBe('admin')
    expect(requiredGatewayPermission('PATCH', '/future-mutation')).toBe('admin')

    expect(gatewayRoleAllows('viewer', 'read')).toBe(true)
    expect(gatewayRoleAllows('viewer', 'operate')).toBe(false)
    expect(gatewayRoleAllows('operator', 'operate')).toBe(true)
    expect(gatewayRoleAllows('operator', 'admin')).toBe(false)
    expect(gatewayRoleAllows('admin', 'admin')).toBe(true)
  })
})
