import { describe, expect, it } from 'vitest'
import { MainspringEventSchema, type MainspringEvent } from '#protocol'
import { RuntimePolicyGuard } from '../policy/PolicyGuard.js'
import { SkillRegistry } from './SkillRegistry.js'

describe('SkillRegistry', () => {
  it('rejects skill manifests that do not declare a permission category', () => {
    const registry = new SkillRegistry({
      runId: 'run_1',
      policy: RuntimePolicyGuard.defaultPolicy({ approvalPolicy: 'balanced' }),
    })

    expect(() =>
      registry.register({
        key: 'empty.skill',
        name: 'Empty Skill',
        description: 'No permissions declared.',
        version: '1.0.0',
        source: 'built-in',
        permissions: {},
        approval: {},
      }),
    ).toThrow('at least one permission category')
  })

  it('emits approval request events instead of installing unapproved powerful skills', () => {
    const events: MainspringEvent[] = []
    const registry = new SkillRegistry({
      runId: 'run_1',
      policy: RuntimePolicyGuard.defaultPolicy({ approvalPolicy: 'balanced' }),
      emitEvent: (event) => events.push(MainspringEventSchema.parse(event)),
    })

    const result = registry.install({
      key: 'git.shell.skill',
      name: 'Git Shell Skill',
      description: 'Needs shell access from an uploaded package.',
      version: '1.0.0',
      source: 'git',
      permissions: { shell: true, filesystem: 'workspace-write' },
      approval: {},
    })

    expect(result.status).toBe('approval_required')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'approval.requested',
      runId: 'run_1',
      approval: {
        kind: 'plugin',
        targetKey: 'git.shell.skill',
      },
    })
  })

  it('installs built-in scoped skills and emits audit events', () => {
    const events: MainspringEvent[] = []
    const registry = new SkillRegistry({
      runId: 'run_1',
      policy: RuntimePolicyGuard.defaultPolicy({ approvalPolicy: 'balanced' }),
      emitEvent: (event) => events.push(MainspringEventSchema.parse(event)),
    })

    const result = registry.install({
      key: 'memory.summary',
      name: 'Memory Summary',
      description: 'Reads runtime memory summaries.',
      version: '1.0.0',
      source: 'built-in',
      permissions: { filesystem: 'read' },
      approval: {},
    })

    expect(result).toMatchObject({ status: 'installed', skillKey: 'memory.summary' })
    expect(registry.get('memory.summary')).toMatchObject({ key: 'memory.summary' })
    expect(events).toEqual([
      {
        type: 'skill.event',
        runId: 'run_1',
        skillKey: 'memory.summary',
        action: 'installed',
        metadata: {
          source: 'built-in',
          version: '1.0.0',
        },
      },
    ])
  })
})
