import { describe, expect, it } from 'vitest'
import { readConsoleLocation } from './ConsoleLocation'

describe('readConsoleLocation', () => {
  it('restores an activity run deep link without accepting unsafe URL material', () => {
    expect(readConsoleLocation('?screen=activity&activity=runs&runId=run_123')).toEqual({
      screen: 'activity',
      activityTab: 'runs',
      runId: 'run_123',
    })
    expect(readConsoleLocation('?screen=activity&activity=runs&runId=../secret')).toEqual({
      screen: 'activity',
      activityTab: 'runs',
    })
  })

  it('falls back to safe first-level navigation for unknown values', () => {
    expect(readConsoleLocation('?screen=../../admin&activity=private&runId=run_1')).toEqual({
      screen: 'home',
      activityTab: 'runs',
    })
    expect(readConsoleLocation('?screen=workspaces&activity=memory&runId=run_1')).toEqual({
      screen: 'workspaces',
      activityTab: 'memory',
    })
  })
})
