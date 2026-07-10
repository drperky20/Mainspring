import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import {
  executeLocalGatewayDeployment,
  planLocalGatewayDeployment,
  type LocalGatewayDeploymentCommandRunner,
} from './DeploymentWizard.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
  roots.length = 0
})

describe('Kubernetes deployment driver', () => {
  it('builds and applies a single-replica hardened gateway manifest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-kubernetes-driver-'))
    roots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({ dbPath: path.join(root, 'gateway.sqlite') })
    try {
      const target = appState.deploymentTargets.create({
        label: 'Production cluster',
        kind: 'kubernetes',
        metadata: {
          context: 'prod-us-central',
          expectedClusterServer: 'https://kubernetes.example.com',
          namespace: 'mainspring',
          deploymentName: 'mainspring-gateway',
          imageRepository: 'registry.example.com/mainspring/gateway',
          secretName: 'mainspring-gateway-secrets',
          storageClaimName: 'mainspring-gateway-data',
          ingressHost: 'mainspring.example.com',
          ingressClassName: 'nginx',
          ingressNamespaces: ['ingress-nginx'],
          tlsSecretName: 'mainspring-gateway-tls',
          trustedOrigins: ['https://mainspring.example.com'],
        },
      })
      appState.deploymentRuns.upsert({
        deploymentRunId: 'deployment_run_previous',
        targetId: target.targetId,
        status: 'succeeded',
        metadata: { operation: 'deploy', releaseId: 'release-20260709000000000' },
      })
      const plan = planLocalGatewayDeployment({ appState, targetId: target.targetId, operation: 'deploy' })
      expect(plan).toMatchObject({
        targetKind: 'kubernetes',
        operation: 'deploy',
      })
      expect(plan.releaseId).toMatch(/^release-\d{17}$/)
      expect(plan.warnings.join(' ')).toContain('single-replica')

      const commands: Array<{ command: string; args: string[] }> = []
      let manifest: any
      const runner: LocalGatewayDeploymentCommandRunner = {
        run: (input) => {
          commands.push({ command: input.command, args: [...input.args] })
          const fileIndex = input.args.indexOf('-f')
          if (input.command === 'kubectl' && fileIndex >= 0) {
            manifest = JSON.parse(fs.readFileSync(input.args[fileIndex + 1], 'utf8'))
          }
          const stdout = input.command === 'kubectl' && input.args.includes('secret')
            ? 'MAINSPRING_GATEWAY_BOOTSTRAP_USERNAME\nMAINSPRING_GATEWAY_BOOTSTRAP_PASSWORD\nMAINSPRING_RUNLOG_APPROVAL_KEY\nMAINSPRING_PROVIDER\nMAINSPRING_MODEL\nOPENROUTER_API_KEY\n'
            : input.command === 'kubectl' && input.args.includes('config')
              ? 'https://kubernetes.example.com'
              : 'ok'
          return { status: 0, stdout, stderr: '' }
        },
      }
      const result = executeLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        dependencies: { repoRoot: process.cwd(), commandRunner: runner },
      })
      expect(result.execution.ok).toBe(true)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({ command: 'docker', args: expect.arrayContaining(['build']) }),
        expect.objectContaining({ command: 'docker', args: expect.arrayContaining(['push']) }),
        expect.objectContaining({ command: 'kubectl', args: expect.arrayContaining(['apply', '--server-side']) }),
        expect.objectContaining({ command: 'kubectl', args: expect.arrayContaining(['rollout', 'status']) }),
      ]))
      const deployment = manifest.items.find((item: any) => item.kind === 'Deployment')
      expect(deployment.spec.replicas).toBe(1)
      expect(deployment.spec.strategy).toEqual({ type: 'Recreate' })
      expect(deployment.spec.template.spec).toMatchObject({
        automountServiceAccountToken: false,
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 10001,
          seccompProfile: { type: 'RuntimeDefault' },
        },
      })
      expect(deployment.spec.template.spec.containers[0]).toMatchObject({
        command: ['node', 'dist/gateway/server/dev.js'],
        readinessProbe: { httpGet: { path: '/readyz', port: 'http' } },
        securityContext: {
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          capabilities: { drop: ['ALL'] },
        },
      })
      expect(JSON.stringify(manifest)).toContain('mainspring-gateway-secrets')
      expect(JSON.stringify(manifest)).toContain('https://mainspring.example.com')
      expect(JSON.stringify(manifest)).not.toContain('MAINSPRING_RUNLOG_APPROVAL_KEY":')
      const networkPolicy = manifest.items.find((item: any) => item.kind === 'NetworkPolicy')
      expect(networkPolicy.spec.ingress[0].from[0].namespaceSelector.matchLabels)
        .toEqual({ 'kubernetes.io/metadata.name': 'ingress-nginx' })

      const rollback = executeLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'rollback',
        confirm: 'rollback',
        dependencies: { repoRoot: process.cwd(), commandRunner: runner },
      })
      expect(rollback.execution.ok).toBe(true)
      expect(commands).toEqual(expect.arrayContaining([
        expect.objectContaining({ command: 'kubectl', args: expect.arrayContaining(['rollout', 'undo']) }),
      ]))
    } finally {
      appState.close()
    }
  })

  it('fails closed on mismatched ingress origins and unapproved destroy', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-kubernetes-guards-'))
    roots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({ dbPath: path.join(root, 'gateway.sqlite') })
    try {
      const target = appState.deploymentTargets.create({
        label: 'Guarded cluster',
        kind: 'kubernetes',
        metadata: {
          context: 'prod',
          expectedClusterServer: 'https://kubernetes.example.com',
          namespace: 'mainspring',
          deploymentName: 'mainspring-gateway',
          imageRepository: 'registry.example.com/mainspring/gateway',
          secretName: 'mainspring-secrets',
          storageClaimName: 'mainspring-data',
          ingressHost: 'mainspring.example.com',
          ingressNamespaces: ['ingress-nginx'],
          tlsSecretName: 'mainspring-tls',
          trustedOrigins: ['https://other.example.com'],
        },
      })
      expect(() => planLocalGatewayDeployment({ appState, targetId: target.targetId, operation: 'deploy' }))
        .toThrow('requires a matching HTTPS trustedOrigins entry')

      const destroyTarget = appState.deploymentTargets.create({
        label: 'No destroy cluster',
        kind: 'kubernetes',
        metadata: {
          context: 'prod',
          expectedClusterServer: 'https://kubernetes.example.com',
          namespace: 'mainspring',
          deploymentName: 'mainspring-gateway-safe',
          imageRepository: 'registry.example.com/mainspring/gateway',
          secretName: 'mainspring-secrets',
          storageClaimName: 'mainspring-data',
        },
      })
      expect(() => planLocalGatewayDeployment({
        appState,
        targetId: destroyTarget.targetId,
        operation: 'destroy',
      })).toThrow('allowDestroy=true')

      const missingSecretResult = executeLocalGatewayDeployment({
        appState,
        targetId: destroyTarget.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        dependencies: {
          repoRoot: process.cwd(),
          commandRunner: {
            run: (input) => ({
              status: 0,
              stdout: input.command === 'kubectl' && input.args.includes('secret')
                ? 'MAINSPRING_GATEWAY_BOOTSTRAP_USERNAME\n'
                : input.command === 'kubectl' && input.args.includes('config')
                  ? 'https://kubernetes.example.com'
                  : 'ok',
              stderr: '',
            }),
          },
        },
      })
      expect(missingSecretResult.execution).toMatchObject({ ok: false })
      expect(missingSecretResult.execution.detail).toContain('required fields')

      const wrongContextCommands: string[][] = []
      const wrongContextResult = executeLocalGatewayDeployment({
        appState,
        targetId: destroyTarget.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        dependencies: {
          repoRoot: process.cwd(),
          commandRunner: {
            run: (input) => {
              wrongContextCommands.push([...input.args])
              return {
                status: 0,
                stdout: input.command === 'kubectl' && input.args.includes('config')
                  ? 'https://unexpected.example.com'
                  : 'ok',
                stderr: '',
              }
            },
          },
        },
      })
      expect(wrongContextResult.execution.detail).toContain('does not match expectedClusterServer')
      expect(wrongContextCommands.some((args) => args.includes('apply'))).toBe(false)
      expect(wrongContextCommands.some((args) => args.includes('push'))).toBe(false)

      const redactedFailure = executeLocalGatewayDeployment({
        appState,
        targetId: destroyTarget.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        dependencies: {
          repoRoot: process.cwd(),
          commandRunner: {
            run: (input) => input.command === 'docker' && input.args.includes('push')
              ? { status: 1, stdout: '', stderr: 'token=supersecretvalue' }
              : input.command === 'kubectl' && input.args.includes('config')
                ? { status: 0, stdout: 'https://kubernetes.example.com', stderr: '' }
                : input.command === 'kubectl' && input.args.includes('secret')
                  ? {
                      status: 0,
                      stdout: 'MAINSPRING_GATEWAY_BOOTSTRAP_USERNAME\nMAINSPRING_GATEWAY_BOOTSTRAP_PASSWORD\nMAINSPRING_RUNLOG_APPROVAL_KEY\nMAINSPRING_PROVIDER\nMAINSPRING_MODEL\nOPENROUTER_API_KEY\n',
                      stderr: '',
                    }
                  : { status: 0, stdout: 'ok', stderr: '' },
          },
        },
      })
      expect(redactedFailure.execution.detail).toContain('[redacted]')
      expect(redactedFailure.execution.detail).not.toContain('supersecretvalue')
    } finally {
      appState.close()
    }
  })
})
