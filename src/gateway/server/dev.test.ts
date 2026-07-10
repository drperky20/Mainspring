import { describe, expect, it } from 'vitest'
import {
  defaultLocalGatewayDevHost,
  defaultLocalGatewayDevPort,
  defaultLocalGatewayCellLeaseTtlMs,
  isAllowedLocalGatewayDevHost,
  resolveLocalGatewayCellCapacity,
  resolveLocalGatewayCellLeaseTtlMs,
  assertExternalGatewayApprovalKey,
  resolveLocalGatewayDevAuth,
  resolveLocalGatewayDevHost,
  resolveLocalGatewayDevPort,
} from './dev.js'

describe('local gateway dev host', () => {
  it('accepts local-only host bindings', () => {
    expect(isAllowedLocalGatewayDevHost('127.0.0.1')).toBe(true)
    expect(isAllowedLocalGatewayDevHost('localhost')).toBe(true)
    expect(isAllowedLocalGatewayDevHost('::1')).toBe(true)
    expect(isAllowedLocalGatewayDevHost('0.0.0.0')).toBe(true)
    expect(isAllowedLocalGatewayDevHost('192.168.1.20')).toBe(false)
  })

  it('fails closed to the default host for invalid overrides', () => {
    expect(resolveLocalGatewayDevHost(undefined)).toBe(defaultLocalGatewayDevHost)
    expect(resolveLocalGatewayDevHost('')).toBe(defaultLocalGatewayDevHost)
    expect(resolveLocalGatewayDevHost('0.0.0.0')).toBe('0.0.0.0')
    expect(resolveLocalGatewayDevHost('localhost')).toBe('localhost')
  })
})

describe('externally reachable gateway safeguards', () => {
  it('requires hosted auth, bootstrap credentials, and a configured approval key for 0.0.0.0', () => {
    expect(() => resolveLocalGatewayDevAuth({}, '0.0.0.0')).toThrow('MAINSPRING_GATEWAY_AUTH_MODE=hosted')
    expect(() => resolveLocalGatewayDevAuth({ MAINSPRING_GATEWAY_AUTH_MODE: 'hosted' }, '0.0.0.0'))
      .toThrow('MAINSPRING_GATEWAY_BOOTSTRAP_USERNAME')
    expect(resolveLocalGatewayDevAuth({
      MAINSPRING_GATEWAY_AUTH_MODE: 'hosted',
      MAINSPRING_GATEWAY_BOOTSTRAP_USERNAME: 'admin',
      MAINSPRING_GATEWAY_BOOTSTRAP_PASSWORD: 'NorthlinePass123',
    }, '0.0.0.0')).toMatchObject({ mode: 'hosted', bootstrapAdmin: { username: 'admin' } })
    expect(() => assertExternalGatewayApprovalKey({}, '0.0.0.0', 'local-dev'))
      .toThrow('MAINSPRING_RUNLOG_APPROVAL_KEY_MODE=configured')
    expect(() => assertExternalGatewayApprovalKey({ MAINSPRING_RUNLOG_APPROVAL_KEY: 'configured-key' }, '0.0.0.0', 'configured'))
      .not.toThrow()
  })
})

describe('local gateway dev port', () => {
  it('accepts valid port overrides and fails closed for bad input', () => {
    expect(resolveLocalGatewayDevPort(undefined)).toBe(defaultLocalGatewayDevPort)
    expect(resolveLocalGatewayDevPort('8788')).toBe(8788)
    expect(resolveLocalGatewayDevPort('0')).toBe(defaultLocalGatewayDevPort)
    expect(resolveLocalGatewayDevPort('70000')).toBe(defaultLocalGatewayDevPort)
    expect(resolveLocalGatewayDevPort('not-a-port')).toBe(defaultLocalGatewayDevPort)
  })
})

describe('local gateway cell scheduler options', () => {
  it('accepts valid lease TTL overrides and fails closed to the default', () => {
    expect(resolveLocalGatewayCellLeaseTtlMs(undefined)).toBe(defaultLocalGatewayCellLeaseTtlMs)
    expect(resolveLocalGatewayCellLeaseTtlMs('5000')).toBe(5000)
    expect(resolveLocalGatewayCellLeaseTtlMs('999')).toBe(defaultLocalGatewayCellLeaseTtlMs)
    expect(resolveLocalGatewayCellLeaseTtlMs('not-a-number')).toBe(defaultLocalGatewayCellLeaseTtlMs)
  })

  it('accepts positive capacity overrides and treats missing or invalid values as uncapped', () => {
    expect(resolveLocalGatewayCellCapacity(undefined)).toBeUndefined()
    expect(resolveLocalGatewayCellCapacity('')).toBeUndefined()
    expect(resolveLocalGatewayCellCapacity('2')).toBe(2)
    expect(resolveLocalGatewayCellCapacity('0')).toBeUndefined()
    expect(resolveLocalGatewayCellCapacity('nope')).toBeUndefined()
  })
})
