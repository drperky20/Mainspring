import type { LocalGatewayAuthUserRecord } from '../AppStateStore.js'

export type GatewayPermission = 'read' | 'operate' | 'admin'

const ROLE_PERMISSIONS: Record<LocalGatewayAuthUserRecord['role'], ReadonlySet<GatewayPermission>> = {
  admin: new Set(['read', 'operate', 'admin']),
  operator: new Set(['read', 'operate']),
  viewer: new Set(['read']),
}

const OPERATOR_MUTATIONS = [
  /^POST \/runs\/start$/,
  /^POST \/runs\/[^/]+\/cancel$/,
  /^POST \/runlog\/runs\/start$/,
  /^POST \/approvals\/[^/]+\/resolve$/,
  /^POST \/runlog\/approvals\/[^/]+\/resolve$/,
  /^POST \/cron\/[^/]+\/run-now$/,
  /^POST \/cron\/[^/]+\/grant$/,
  /^POST \/provenance-reviews\/[^/]+\/decision$/,
  /^POST \/provenance-reviews\/[^/]+\/apply$/,
]

export function requiredGatewayPermission(method: string, path: string): GatewayPermission {
  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod === 'GET' && path === '/auth/users') return 'admin'
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') return 'read'
  if (normalizedMethod === 'POST' && path === '/auth/browser-access') return 'read'
  const route = `${normalizedMethod} ${path}`
  return OPERATOR_MUTATIONS.some((pattern) => pattern.test(route)) ? 'operate' : 'admin'
}

export function gatewayRoleAllows(
  role: LocalGatewayAuthUserRecord['role'],
  permission: GatewayPermission,
): boolean {
  return ROLE_PERMISSIONS[role].has(permission)
}
