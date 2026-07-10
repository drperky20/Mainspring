import { describe, expect, it } from 'vitest'
import { gatewaySnapshotRefreshDelay } from './useGatewaySnapshot'

describe('gateway snapshot refresh policy', () => {
  it('keeps active refreshes responsive while applying bounded exponential backoff', () => {
    expect(gatewaySnapshotRefreshDelay({ visible: true, consecutiveFailures: 0 })).toBe(5_000)
    expect(gatewaySnapshotRefreshDelay({ visible: true, consecutiveFailures: 1 })).toBe(10_000)
    expect(gatewaySnapshotRefreshDelay({ visible: true, consecutiveFailures: 2 })).toBe(20_000)
    expect(gatewaySnapshotRefreshDelay({ visible: true, consecutiveFailures: 3 })).toBe(30_000)
    expect(gatewaySnapshotRefreshDelay({ visible: true, consecutiveFailures: 20 })).toBe(30_000)
  })

  it('backs off hidden pages without exceeding the same bounded cap', () => {
    expect(gatewaySnapshotRefreshDelay({ visible: false, consecutiveFailures: 0 })).toBe(30_000)
    expect(gatewaySnapshotRefreshDelay({ visible: false, consecutiveFailures: 4 })).toBe(30_000)
  })
})
