import { describe, expect, it } from 'vitest'
import {
  defaultLocalGatewayDevHost,
  defaultLocalGatewayDevPort,
  defaultLocalGatewayCellLeaseTtlMs,
  isAllowedLocalGatewayDevHost,
  resolveLocalGatewayCellCapacity,
  resolveLocalGatewayCellLeaseTtlMs,
  resolveLocalGatewayDevHost,
  resolveLocalGatewayDevPort,
} from './dev.js'

describe('local gateway dev host', () => {
  it('accepts local-only host bindings', () => {
    expect(isAllowedLocalGatewayDevHost('127.0.0.1')).toBe(true)
    expect(isAllowedLocalGatewayDevHost('localhost')).toBe(true)
    expect(isAllowedLocalGatewayDevHost('::1')).toBe(true)
    expect(isAllowedLocalGatewayDevHost('0.0.0.0')).toBe(false)
    expect(isAllowedLocalGatewayDevHost('192.168.1.20')).toBe(false)
  })

  it('fails closed to the default host for invalid overrides', () => {
    expect(resolveLocalGatewayDevHost(undefined)).toBe(defaultLocalGatewayDevHost)
    expect(resolveLocalGatewayDevHost('')).toBe(defaultLocalGatewayDevHost)
    expect(resolveLocalGatewayDevHost('0.0.0.0')).toBe(defaultLocalGatewayDevHost)
    expect(resolveLocalGatewayDevHost('localhost')).toBe('localhost')
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
