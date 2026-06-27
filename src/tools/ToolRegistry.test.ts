import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MainspringEventSchema, type MainspringEvent } from '#protocol'
import { createApprovalReceipt } from '../policy/ApprovalReceipt.js'
import { RuntimePolicyGuard } from '../policy/PolicyGuard.js'
import { createBrowserTools } from './BrowserTool.js'
import { createMainspringTools } from './MainspringTools.js'
import { createFileTools } from './FileTools.js'
import { createMemoryTools } from './MemoryTool.js'
import { createShellTool } from './ShellTool.js'
import { createSkillTools } from './SkillTools.js'
import { ToolRegistry } from './ToolRegistry.js'
import { createWebTools } from './WebTools.js'

let tempRoots: string[] = []
let approvalCounter = 0

afterEach(() => {
  for (const root of tempRoots) {
    removeTempRoot(root)
  }
  tempRoots = []
  approvalCounter = 0
})

function removeTempRoot(root: string): void {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (
        attempt === 4 ||
        !(error instanceof Error) ||
        !('code' in error) ||
        (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

function approvalFor(
  key: string,
  toolInput: unknown,
  options: { runId?: string; expiresAt?: string } = {},
) {
  approvalCounter += 1
  return createApprovalReceipt({
    approvalId: `ap_test_${approvalCounter}`,
    runId: options.runId ?? 'run_1',
    targetKey: key,
    toolInput,
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
  })
}

function makeWorkspace(): { root: string; events: MainspringEvent[]; registry: ToolRegistry } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-tool-registry-'))
  tempRoots.push(root)
  const events: MainspringEvent[] = []
  const registry = new ToolRegistry({
    runId: 'run_1',
    workspaceRoot: root,
    policy: RuntimePolicyGuard.defaultPolicy({
      approvalPolicy: 'balanced',
      allowedTools: [
        'file.read',
        'file.write',
        'shell.exec',
        'browser.open',
        'browser.snapshot',
        'browser.click',
        'browser.type',
        'browser.screenshot',
        'mainspring.diagnostics.overview',
        'mainspring.agent.events.tail',
        'web.search',
        'web.fetch',
        'memory.read',
        'memory.write',
        'skills.install',
        'skills.update',
      ],
    }),
    emitEvent: (event) => {
      events.push(MainspringEventSchema.parse(event))
    },
    readRecentEvents: ({ runId, limit }) =>
      events.slice(-(limit ?? 25)).map((event, index) => ({
        seq: index + 1,
        runId,
        event,
      })),
  })
  registry.registerMany(createFileTools())
  registry.register(createShellTool())
  registry.registerMany(createBrowserTools())
  registry.registerMany(createMainspringTools())
  registry.registerMany(createMemoryTools())
  registry.registerMany(createSkillTools())
  registry.registerMany(
    createWebTools({
      fetchImpl: async (url) => {
        const requestUrl = String(url)
        if (requestUrl.startsWith('https://duckduckgo.com/html/')) {
          return new Response(
            [
              '<a class="result__a" href="https://example.com/page">Example Result</a>',
              '<div class="result__snippet">A useful result &amp; summary.</div>',
            ].join(''),
            {
              status: 200,
              headers: { 'content-type': 'text/html' },
            },
          )
        }
        return new Response(
          '<html><title>Example</title><body><script>bad()</script>Hello web</body></html>',
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        )
      },
    }),
  )
  return { root, events, registry }
}

describe('ToolRegistry', () => {
  it('emits approval requests instead of executing shell, open-network, and source-mutation tools', async () => {
    const { events, registry } = makeWorkspace()

    const blocked = [
      ['shell.exec', { command: 'pnpm install' }],
      ['browser.open', { url: 'https://example.com' }],
      ['browser.snapshot', { format: 'aria' }],
      ['browser.click', { ref: '@e5' }],
      ['browser.type', { ref: '@e5', text: 'hello' }],
      ['browser.screenshot', { fullPage: true }],
      ['file.write', { path: 'src/index.ts', data: 'export {}', sourceMutation: true }],
    ] as const
    const results = []
    for (const [key, input] of blocked) results.push(await registry.execute({ key, input }))

    expect(results.map((result) => result.status)).toEqual(blocked.map(() => 'approval_required'))
    expect(events.map((event) => event.type)).toEqual(blocked.map(() => 'approval.requested'))
    expect(
      events.map((event) => (event as { approval: { targetKey: string } }).approval.targetKey),
    ).toEqual(blocked.map(([key]) => key))
    expect(JSON.stringify(events)).not.toContain('pnpm install')
  })

  it('routes approved browser tools through the native browser adapter', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-browser-tools-'))
    tempRoots.push(root)
    const calls: unknown[] = []
    const registry = new ToolRegistry({
      runId: 'run_browser',
      workspaceRoot: root,
      policy: RuntimePolicyGuard.defaultPolicy({
        approvalPolicy: 'balanced',
        allowedTools: [
          'browser.open',
          'browser.snapshot',
          'browser.click',
          'browser.type',
          'browser.screenshot',
        ],
      }),
    })
    registry.registerMany(
      createBrowserTools({
        adapter: {
          open: (input) => {
            calls.push({ tool: 'open', input })
            return { opened: true, url: input.url }
          },
          snapshot: (input) => {
            calls.push({ tool: 'snapshot', input })
            return { page: { title: 'Example', elements: ['@e5 Search'] }, ...input }
          },
          click: (input) => {
            calls.push({ tool: 'click', input })
            return { clicked: true, ...input }
          },
          type: (input) => {
            calls.push({ tool: 'type', input })
            return { typed: true, ...input }
          },
          screenshot: (input) => {
            calls.push({ tool: 'screenshot', input })
            return { artifactId: 'shot_1', url: 'artifact://shot-1', ...input }
          },
        },
      }),
    )

    await expect(
      registry.execute({
        key: 'browser.open',
        input: { url: '' },
        approvalReceipt: approvalFor('browser.open', { url: '' }, { runId: 'run_browser' }),
      }),
    ).rejects.toThrow('non-empty')

    const opened = await registry.execute({
      key: 'browser.open',
      input: { url: 'https://example.com' },
      approvalReceipt: approvalFor(
        'browser.open',
        { url: 'https://example.com' },
        { runId: 'run_browser' },
      ),
    })
    const snapshot = await registry.execute({
      key: 'browser.snapshot',
      input: { format: 'text', task: 'find pricing' },
      approvalReceipt: approvalFor(
        'browser.snapshot',
        { format: 'text', task: 'find pricing' },
        { runId: 'run_browser' },
      ),
    })
    const clicked = await registry.execute({
      key: 'browser.click',
      input: { ref: 'e5', task: 'open pricing' },
      approvalReceipt: approvalFor(
        'browser.click',
        { ref: 'e5', task: 'open pricing' },
        { runId: 'run_browser' },
      ),
    })
    const typed = await registry.execute({
      key: 'browser.type',
      input: { ref: '@search_box', text: 'Mainspring runtime', submit: true },
      approvalReceipt: approvalFor(
        'browser.type',
        { ref: '@search_box', text: 'Mainspring runtime', submit: true },
        { runId: 'run_browser' },
      ),
    })
    const screenshot = await registry.execute({
      key: 'browser.screenshot',
      input: { fullPage: true, artifactLabel: 'homepage' },
      approvalReceipt: approvalFor('browser.screenshot', {
        fullPage: true,
        artifactLabel: 'homepage',
      }, { runId: 'run_browser' }),
    })

    expect(opened).toMatchObject({
      status: 'completed',
      output: { opened: true, url: 'https://example.com/' },
    })
    expect(snapshot).toMatchObject({
      status: 'completed',
      output: {
        page: { title: 'Example' },
        format: 'text',
        task: 'find pricing',
      },
    })
    expect(clicked).toMatchObject({
      status: 'completed',
      output: { clicked: true, ref: '@e5', task: 'open pricing' },
    })
    expect(typed).toMatchObject({
      status: 'completed',
      output: {
        typed: true,
        ref: '@search_box',
        text: 'Mainspring runtime',
        submit: true,
      },
    })
    expect(screenshot).toMatchObject({
      status: 'completed',
      output: { artifactId: 'shot_1', url: 'artifact://shot-1', fullPage: true },
    })
    expect(calls).toEqual([
      { tool: 'open', input: { url: 'https://example.com/' } },
      { tool: 'snapshot', input: { format: 'text', task: 'find pricing' } },
      { tool: 'click', input: { ref: '@e5', task: 'open pricing' } },
      {
        tool: 'type',
        input: { ref: '@search_box', text: 'Mainspring runtime', submit: true, task: undefined },
      },
      { tool: 'screenshot', input: { fullPage: true, artifactLabel: 'homepage' } },
    ])

    await expect(
      registry.execute({
        key: 'browser.open',
        input: { url: 'http://127.0.0.1:3000/private' },
        approvalReceipt: approvalFor(
          'browser.open',
          { url: 'http://127.0.0.1:3000/private' },
          { runId: 'run_browser' },
        ),
      }),
    ).rejects.toThrow('private or local')
  })

  it('executes approved shell commands with bounded native output', async () => {
    const { registry } = makeWorkspace()

    await expect(
      registry.execute({
        key: 'shell.exec',
        input: { command: '' },
        approvalReceipt: approvalFor('shell.exec', { command: '' }),
      }),
    ).rejects.toThrow('non-empty')

    const result = await registry.execute({
      key: 'shell.exec',
      input: {
        command: 'node -e "process.stdout.write(\'SHELL_OK\')"',
        timeoutMs: 15_000,
        maxOutputBytes: 1024,
      },
      approvalReceipt: approvalFor('shell.exec', {
        command: 'node -e "process.stdout.write(\'SHELL_OK\')"',
        timeoutMs: 15_000,
        maxOutputBytes: 1024,
      }),
    })

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        command: 'node -e "process.stdout.write(\'SHELL_OK\')"',
        exitCode: 0,
        timedOut: false,
        stdout: 'SHELL_OK',
        stderr: '',
        truncated: false,
      },
    })
  }, 15_000)

  it('does not inherit provider or internal secrets into approved shell commands', async () => {
    const { registry } = makeWorkspace()
    const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY
    const originalInternalToken = process.env.MAINSPRING_CHANNEL_TOKEN
    process.env.OPENROUTER_API_KEY = 'sk-or-test-secret'
    process.env.MAINSPRING_CHANNEL_TOKEN = 'internal-test-secret'

    try {
      const result = await registry.execute({
        key: 'shell.exec',
        input: {
          command:
            'node -e "process.stdout.write(process.env.OPENROUTER_API_KEY || process.env.MAINSPRING_CHANNEL_TOKEN || \'missing\')"',
          timeoutMs: 5_000,
          maxOutputBytes: 1024,
        },
        approvalReceipt: approvalFor('shell.exec', {
          command:
            'node -e "process.stdout.write(process.env.OPENROUTER_API_KEY || process.env.MAINSPRING_CHANNEL_TOKEN || \'missing\')"',
          timeoutMs: 5_000,
          maxOutputBytes: 1024,
        }),
      })

      expect(result).toMatchObject({
        status: 'completed',
        output: {
          exitCode: 0,
          stdout: 'missing',
          stderr: '',
          truncated: false,
        },
      })
      expect(JSON.stringify(result)).not.toContain('sk-or-test-secret')
      expect(JSON.stringify(result)).not.toContain('internal-test-secret')
    } finally {
      if (originalOpenRouterApiKey === undefined) {
        delete process.env.OPENROUTER_API_KEY
      } else {
        process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey
      }
      if (originalInternalToken === undefined) {
        delete process.env.MAINSPRING_CHANNEL_TOKEN
      } else {
        process.env.MAINSPRING_CHANNEL_TOKEN = originalInternalToken
      }
    }
  })

  it('exposes native Mainspring diagnostics and event tail tools', async () => {
    const { events, registry } = makeWorkspace()

    events.push({
      type: 'run.status',
      runId: 'run_1',
      status: 'running',
      phase: 'provider',
    })
    const diagnostics = await registry.execute({
      key: 'mainspring.diagnostics.overview',
      input: {},
    })
    const tail = await registry.execute({
      key: 'mainspring.agent.events.tail',
      input: { limit: 1 },
    })

    expect(diagnostics).toMatchObject({
      status: 'completed',
      output: {
        runId: 'run_1',
        runtime: 'mainspring',
        tools: expect.arrayContaining([
          expect.objectContaining({ key: 'mainspring.agent.events.tail' }),
          expect.objectContaining({ key: 'mainspring.diagnostics.overview' }),
        ]),
      },
    })
    expect(tail).toMatchObject({
      status: 'completed',
      output: {
        available: true,
        count: 1,
        events: [
          {
            runId: 'run_1',
            event: {
              type: 'run.status',
              runId: 'run_1',
              status: 'running',
              phase: 'provider',
            },
          },
        ],
      },
    })
    expect(JSON.stringify(diagnostics)).not.toContain(process.cwd())
  })

  it('keeps Mainspring diagnostics available through the native tool bundle', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-native-tools-'))
    tempRoots.push(root)
    const registry = new ToolRegistry({
      runId: 'run_1',
      workspaceRoot: root,
      policy: RuntimePolicyGuard.defaultPolicy({
        approvalPolicy: 'balanced',
        allowedTools: ['mainspring.diagnostics.overview'],
      }),
    })
    registry.registerMany(createMainspringTools())

    await expect(
      registry.execute({ key: 'mainspring.diagnostics.overview', input: {} }),
    ).resolves.toMatchObject({
      status: 'completed',
      output: { runtime: 'mainspring' },
    })
  })

  it('keeps file reads and writes contained to the workspace root', async () => {
    const { root, registry } = makeWorkspace()
    fs.mkdirSync(path.join(root, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(root, 'notes', 'input.txt'), 'inside')

    await expect(
      registry.execute({ key: 'file.read', input: { path: '../escape.txt' } }),
    ).rejects.toThrow('Path escapes root')
    await expect(
      registry.execute({
        key: 'file.write',
        input: { path: '/tmp/escape.txt', data: 'outside' },
        approvalReceipt: approvalFor('file.write', {
          path: '/tmp/escape.txt',
          data: 'outside',
        }),
      }),
    ).rejects.toThrow('Path escapes root')

    const read = await registry.execute({ key: 'file.read', input: { path: 'notes/input.txt' } })
    const writeApproval = await registry.execute({
      key: 'file.write',
      input: { path: 'notes/output.txt', data: 'inside too' },
    })
    const write = await registry.execute({
      key: 'file.write',
      input: { path: 'notes/output.txt', data: 'inside too' },
      approvalReceipt: approvalFor('file.write', {
        path: 'notes/output.txt',
        data: 'inside too',
      }),
    })

    expect(read).toMatchObject({ status: 'completed', output: { text: 'inside' } })
    expect(writeApproval).toMatchObject({ status: 'approval_required' })
    expect(write).toMatchObject({
      status: 'completed',
      output: { path: 'notes/output.txt', bytes: 10 },
    })
    expect(fs.readFileSync(path.join(root, 'notes', 'output.txt'), 'utf8')).toBe('inside too')
    expect(fs.existsSync('/tmp/escape.txt')).toBe(false)
  })

  it('executes bounded public web fetches without exposing browser or shell power', async () => {
    const { registry } = makeWorkspace()

    await expect(
      registry.execute({ key: 'web.fetch', input: { url: 'http://localhost:3000/private' } }),
    ).rejects.toThrow('private or local')
    await expect(
      registry.execute({ key: 'web.fetch', input: { url: 'http://172.16.0.2/private' } }),
    ).rejects.toThrow('private or local')

    const fetched = await registry.execute({
      key: 'web.fetch',
      input: { url: 'https://example.com/page#secret', maxBytes: 4096 },
    })

    expect(fetched).toMatchObject({
      status: 'completed',
      output: {
        url: 'https://example.com/page',
        status: 200,
        ok: true,
        contentType: 'text/html',
        title: 'Example',
        text: 'Example Hello web',
      },
    })
  })

  it('executes bounded public web searches through native policy', async () => {
    const { registry } = makeWorkspace()

    await expect(
      registry.execute({ key: 'web.search', input: { query: '', maxResults: 3 } }),
    ).rejects.toThrow('non-empty')

    const search = await registry.execute({
      key: 'web.search',
      input: { query: 'mainspring runtime', maxResults: 3 },
    })

    expect(search).toMatchObject({
      status: 'completed',
      output: {
        query: 'mainspring runtime',
        status: 200,
        ok: true,
        source: 'duckduckgo-html',
        results: [
          {
            title: 'Example Result',
            url: 'https://example.com/page',
            snippet: 'A useful result & summary.',
          },
        ],
      },
    })
  })

  it('blocks redirect-to-private fetches and enforces streaming byte caps', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-web-policy-'))
    tempRoots.push(root)
    const registry = new ToolRegistry({
      runId: 'run_web_policy',
      workspaceRoot: root,
      policy: RuntimePolicyGuard.defaultPolicy({
        approvalPolicy: 'balanced',
        allowedTools: ['web.fetch'],
      }),
    })
    registry.registerMany(
      createWebTools({
        fetchImpl: async (url) => {
          const value = String(url)
          if (value === 'https://example.com/redirect') {
            return new Response('', {
              status: 302,
              headers: { location: 'http://127.0.0.1/private' },
            })
          }
          return new Response('x'.repeat(512), {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          })
        },
      }),
    )

    await expect(
      registry.execute({ key: 'web.fetch', input: { url: 'https://example.com/redirect' } }),
    ).rejects.toThrow('private or local')

    const capped = await registry.execute({
      key: 'web.fetch',
      input: { url: 'https://example.com/large', maxBytes: 32 },
    })
    expect(capped).toMatchObject({
      status: 'completed',
      output: {
        url: 'https://example.com/large',
        status: 200,
        ok: true,
        contentType: 'text/plain',
        truncated: true,
      },
    })
    expect((capped as { output: { text: string } }).output.text.length).toBeLessThanOrEqual(32)
  })

  it('rejects approval receipt replay, changed input, and expiry', async () => {
    const { registry } = makeWorkspace()
    const firstInput = { path: 'notes/replay.txt', data: 'first' }
    const replayReceipt = approvalFor('file.write', firstInput)

    const first = await registry.execute({
      key: 'file.write',
      input: firstInput,
      approvalReceipt: replayReceipt,
    })
    expect(first).toMatchObject({
      status: 'completed',
      output: { path: 'notes/replay.txt' },
    })

    await expect(
      registry.execute({
        key: 'file.write',
        input: firstInput,
        approvalReceipt: replayReceipt,
      }),
    ).rejects.toThrow('already been used')

    await expect(
      registry.execute({
        key: 'file.write',
        input: { path: 'notes/replay.txt', data: 'changed' },
        approvalReceipt: approvalFor('file.write', firstInput),
      }),
    ).rejects.toThrow('input does not match')

    await expect(
      registry.execute({
        key: 'file.write',
        input: firstInput,
        approvalReceipt: approvalFor('file.write', firstInput, {
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      }),
    ).rejects.toThrow('expired')
  })

  it('persists and searches native workspace memory with write approval', async () => {
    const { registry } = makeWorkspace()

    const approval = await registry.execute({
      key: 'memory.write',
      input: { text: 'Remember the Mainspring native runtime direction.', tags: ['runtime'] },
    })
    expect(approval.status).toBe('approval_required')

    const write = await registry.execute({
      key: 'memory.write',
      input: { text: 'Remember the Mainspring native runtime direction.', tags: ['runtime'] },
      approvalReceipt: approvalFor('memory.write', {
        text: 'Remember the Mainspring native runtime direction.',
        tags: ['runtime'],
      }),
    })
    expect(write).toMatchObject({
      status: 'completed',
      output: { stored: true, tags: ['runtime'] },
    })

    const read = await registry.execute({
      key: 'memory.read',
      input: { query: 'native runtime', limit: 3 },
    })
    expect(read).toMatchObject({
      status: 'completed',
      output: {
        count: 1,
        memories: [
          {
            text: 'Remember the Mainspring native runtime direction.',
            tags: ['runtime'],
          },
        ],
      },
    })
    expect(JSON.stringify(read)).not.toContain('secret')
  })

  it('persists approved native skill installs and updates inside the workspace', async () => {
    const { events, registry, root } = makeWorkspace()
    const manifest = {
      key: 'workspace.summary',
      name: 'Workspace Summary',
      description: 'Summarizes workspace files.',
      version: '1.0.0',
      source: 'uploaded' as const,
      permissions: { filesystem: 'read' as const },
      approval: { required: true },
    }

    const approval = await registry.execute({
      key: 'skills.install',
      input: { manifest },
    })
    expect(approval.status).toBe('approval_required')

    const install = await registry.execute({
      key: 'skills.install',
      input: { manifest },
      approvalReceipt: approvalFor('skills.install', { manifest }),
    })
    expect(install).toMatchObject({
      status: 'completed',
      output: {
        skillKey: 'workspace.summary',
        action: 'installed',
        persisted: true,
        version: '1.0.0',
      },
    })

    const update = await registry.execute({
      key: 'skills.update',
      input: { manifest: { ...manifest, version: '1.1.0' } },
      approvalReceipt: approvalFor('skills.update', {
        manifest: { ...manifest, version: '1.1.0' },
      }),
    })
    expect(update).toMatchObject({
      status: 'completed',
      output: {
        skillKey: 'workspace.summary',
        action: 'updated',
        persisted: true,
        version: '1.1.0',
        previousVersion: '1.0.0',
      },
    })
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(root, '.mainspring/skills/workspace.summary/manifest.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({ key: 'workspace.summary', version: '1.1.0' })
    expect(events.map((event) => event.type)).toEqual([
      'approval.requested',
      'skill.event',
      'skill.event',
    ])
  })
})
