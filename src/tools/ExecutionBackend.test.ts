import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  backendPreferenceFromComputerId,
  backendSummaryLine,
  ExecutionBackendRegistry,
  executionBackendCapabilities,
  parseExecutionBackendPreference,
  resolveExecutionBackend,
  toWslPath,
  type ExecutionBackendAdapter,
  type ExecutionBackendInventory,
} from './ExecutionBackend.js'
import {
  DEFAULT_DOCKER_CELL_IMAGE,
  ProcessRegistry,
  processSpawnSpecForBackend,
} from './ProcessRegistry.js'

function fakeInventory(
  overrides: Partial<ExecutionBackendInventory> = {},
): ExecutionBackendInventory {
  return {
    defaultBackend: 'host',
    backends: [
      {
        key: 'host',
        label: 'Host shell',
        available: true,
        unsafe: true,
        capabilities: executionBackendCapabilities('host'),
        reason: 'Host process execution is available but not isolated.',
      },
      {
        key: 'wsl',
        label: 'WSL bash',
        available: false,
        unsafe: false,
        capabilities: executionBackendCapabilities('wsl'),
        reason: 'WSL is not installed.',
      },
      {
        key: 'docker',
        label: 'Docker Linux container',
        available: false,
        unsafe: false,
        capabilities: executionBackendCapabilities('docker'),
        reason: 'Docker is not running.',
      },
    ],
    ...overrides,
  }
}

describe('ExecutionBackend', () => {
  it('parses backend preferences', () => {
    expect(parseExecutionBackendPreference(undefined)).toBeUndefined()
    expect(parseExecutionBackendPreference('auto')).toBe('auto')
    expect(parseExecutionBackendPreference('HOST')).toBe('host')
    expect(parseExecutionBackendPreference(' wsl ')).toBe('wsl')
    expect(parseExecutionBackendPreference('docker')).toBe('docker')
    expect(parseExecutionBackendPreference('podman')).toBe('podman')
    expect(() => parseExecutionBackendPreference('bad backend')).toThrow('Execution backend id')
  })

  it('derives backend preferences from known computer ids', () => {
    expect(backendPreferenceFromComputerId(undefined)).toBeUndefined()
    expect(backendPreferenceFromComputerId('computer_local')).toBe('host')
    expect(backendPreferenceFromComputerId('computer_host')).toBe('host')
    expect(backendPreferenceFromComputerId('computer_process_dev')).toBe('host')
    expect(backendPreferenceFromComputerId('computer_wsl')).toBe('wsl')
    expect(backendPreferenceFromComputerId('computer_docker')).toBe('docker')
    expect(backendPreferenceFromComputerId('computer_custom')).toBeUndefined()
  })

  it('maps Windows paths into WSL mount paths', () => {
    expect(toWslPath('E:\\Mainspring\\src')).toBe('/mnt/e/Mainspring/src')
  })

  it('resolves host by default and rejects unavailable isolated backends', () => {
    expect(resolveExecutionBackend({ probe: () => fakeInventory() })).toMatchObject({
      key: 'host',
      unsafe: true,
      capabilities: {
        isolationKind: 'host-process',
        isolationStrength: 'none',
        networkPolicy: 'host-inherited',
        unsafeFallback: true,
      },
    })
    expect(() =>
      resolveExecutionBackend({ preferredBackend: 'wsl', probe: () => fakeInventory() }),
    ).toThrow('Execution backend "wsl" is unavailable: WSL is not installed.')
  })

  it('resolves custom registered backends through adapter metadata and spawn specs', () => {
    const customAdapter: ExecutionBackendAdapter = {
      key: 'podman',
      label: () => 'Podman container',
      inspect: () => ({
        key: 'podman',
        label: 'Podman container',
        available: true,
        unsafe: false,
        capabilities: executionBackendCapabilities('docker'),
      }),
      capabilities: () => executionBackendCapabilities('docker'),
      spawnSpec: (input) => [
        'podman',
        ['run', '--rm', '-w', input.cwd, 'node:22-alpine', 'sh', '-lc', input.command],
        { cwd: input.cwd, shell: false, windowsHide: true, env: input.env },
      ],
    }
    const registry = new ExecutionBackendRegistry().register(customAdapter)

    const resolved = resolveExecutionBackend({
      preferredBackend: 'podman',
      registry,
    })
    expect(resolved).toMatchObject({
      key: 'podman',
      label: 'Podman container',
      unsafe: false,
    })
    expect(resolved.spawnSpec?.({
      command: 'printf CUSTOM_BACKEND',
      cwd: '/workspace',
      workspaceRoot: '/workspace',
      env: { NO_COLOR: '1' },
    })[0]).toBe('podman')
  })

  it('surfaces backend metadata in process snapshots', async () => {
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mainspring-process-registry-test-'),
    )
    const registry = new ProcessRegistry({
      resolveBackend: (options) =>
        resolveExecutionBackend({
          preferredBackend: options.preferredBackend,
          probe: () =>
            fakeInventory({
              backends: [
                {
                  key: 'host',
                  label: 'Host shell',
                  available: true,
                  unsafe: true,
                  capabilities: executionBackendCapabilities('host'),
                },
                {
                  key: 'wsl',
                  label: 'WSL bash',
                  available: true,
                  unsafe: false,
                  capabilities: executionBackendCapabilities('wsl'),
                },
                {
                  key: 'docker',
                  label: 'Docker Linux container',
                  available: false,
                  unsafe: false,
                  capabilities: executionBackendCapabilities('docker'),
                },
              ],
            }),
        }),
    })

    const started = registry.start({
      runId: 'run_backend',
      workspaceRoot,
      command: 'node -e "process.stdout.write(\'BACKEND_OK\')"',
      backend: 'host',
      maxOutputBytes: 1024,
      timeoutMs: 5_000,
    })
    const result = await registry.waitForExit('run_backend', started.sessionId, workspaceRoot)
    expect(result).toMatchObject({
      backend: 'host',
      backendLabel: 'Host shell',
      backendUnsafe: true,
      backendCapabilities: {
        isolationKind: 'host-process',
        isolationStrength: 'none',
        networkPolicy: 'host-inherited',
      },
      executionCell: {
        backend: 'host',
        backendLabel: 'Host shell',
        backendUnsafe: true,
        backendCapabilities: {
          isolationKind: 'host-process',
          isolationStrength: 'none',
          networkPolicy: 'host-inherited',
        },
      },
      executionLease: {
        leaseId: `lease_exec_${started.sessionId}`,
        status: 'released',
        acquiredAt: expect.any(String),
        releasedAt: expect.any(String),
      },
      stdout: 'BACKEND_OK',
    })
    expect(result.executionCell.cellKey).toMatch(/^cell_exec_host_[a-f0-9]{12}$/)
    expect(result.executionLease.cellKey).toBe(result.executionCell.cellKey)
  })

  it('rejects terminal cwd paths that resolve through a symlink outside the workspace root', () => {
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mainspring-process-registry-symlink-'),
    )
    const outsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mainspring-process-registry-outside-'),
    )
    const linked = path.join(workspaceRoot, 'linked-outside')
    fs.symlinkSync(outsideRoot, linked, process.platform === 'win32' ? 'junction' : 'dir')
    const registry = new ProcessRegistry({
      resolveBackend: () => ({
        key: 'host',
        label: 'Host shell',
        unsafe: true,
        capabilities: executionBackendCapabilities('host'),
      }),
    })

    expect(() =>
      registry.start({
        runId: 'run_symlink_escape',
        workspaceRoot,
        cwd: 'linked-outside',
        command: 'node -e "process.exit(0)"',
        backend: 'host',
      }),
    ).toThrow('inside the workspace root')
  })

  it('builds Docker process specs with an explicit workspace mount and no network', () => {
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mainspring-docker-spec-workspace-'),
    )
    const nestedCwd = path.join(workspaceRoot, 'packages', 'agent')
    fs.mkdirSync(nestedCwd, { recursive: true })

    const [command, args, options] = processSpawnSpecForBackend({
      backend: {
        key: 'docker',
        label: 'Docker Linux container',
        unsafe: false,
        capabilities: executionBackendCapabilities('docker'),
      },
      command: 'printf DOCKER_OK',
      cwd: nestedCwd,
      workspaceRoot,
    })

    expect(command).toBe('docker')
    expect(args).toEqual([
      'run',
      '--rm',
      '--network',
      'none',
      '--security-opt',
      'no-new-privileges',
      '--cap-drop',
      'ALL',
      '--pids-limit',
      '256',
      '-v',
      `${fs.realpathSync.native(workspaceRoot)}:/workspace`,
      '-w',
      '/workspace/packages/agent',
      process.env.MAINSPRING_DOCKER_CELL_IMAGE || DEFAULT_DOCKER_CELL_IMAGE,
      'sh',
      '-lc',
      'printf DOCKER_OK',
    ])
    expect(options).toMatchObject({
      cwd: nestedCwd,
      shell: false,
      windowsHide: true,
    })
  })

  it('formats compact backend summary lines', () => {
    expect(
      backendSummaryLine({
        key: 'wsl',
        label: 'WSL bash',
        available: false,
        unsafe: false,
        capabilities: executionBackendCapabilities('wsl'),
        reason: 'Broken distro',
      }),
    ).toContain('wsl: unavailable (isolated-capable; userland-boundary; host-inherited) - Broken distro')
  })

  it('describes backend capability boundaries without claiming secure VM isolation', () => {
    expect(executionBackendCapabilities('host')).toMatchObject({
      isolationKind: 'host-process',
      isolationStrength: 'none',
      securityBoundary: 'none',
      networkPolicy: 'host-inherited',
      workspaceMapping: 'host-path',
      requiresApproval: true,
      unsafeFallback: true,
    })
    expect(executionBackendCapabilities('docker')).toMatchObject({
      isolationKind: 'docker-container',
      isolationStrength: 'container-boundary',
      networkPolicy: 'container-network-disabled',
      workspaceMapping: 'docker-bind-mount',
      requiresApproval: true,
      unsafeFallback: false,
    })
  })

  it('labels host execution as container-scoped inside the gateway container', () => {
    const original = process.env.MAINSPRING_CONTAINERIZED
    process.env.MAINSPRING_CONTAINERIZED = '1'
    try {
      const registry = new ExecutionBackendRegistry()
        .register({
          key: 'host',
          label: () => 'unused',
          inspect: () => ({
            key: 'host',
            label: 'Gateway container shell',
            available: true,
            unsafe: false,
            capabilities: executionBackendCapabilities('host'),
            reason: 'Process execution is confined to the running Mainspring gateway container.',
          }),
          capabilities: () => executionBackendCapabilities('host'),
          spawnSpec: (input) => [input.command, [], { cwd: input.cwd, shell: true, env: input.env }],
        })
      const inventory = registry.inspect('linux')
      expect(inventory.backends[0]).toMatchObject({
        label: 'Gateway container shell',
        unsafe: false,
        capabilities: {
          isolationKind: 'docker-container',
          isolationStrength: 'container-boundary',
          securityBoundary: 'container-process',
          unsafeFallback: false,
        },
      })
    } finally {
      if (original === undefined) delete process.env.MAINSPRING_CONTAINERIZED
      else process.env.MAINSPRING_CONTAINERIZED = original
    }
  })
})
