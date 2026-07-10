import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type { LocalGatewayDeploymentTargetRecord } from './AppStateStore.js'
import type {
  DeploymentDriver,
  DeploymentDriverExecuteInput,
  LocalGatewayDeploymentCommandRunner,
  LocalGatewayDeploymentPlan,
} from './DeploymentWizard.js'

const DnsLabel = z.string().trim().min(1).max(63).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
const WorkloadName = z.string().trim().min(1).max(50).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
const ImageRepository = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._/:-]*$/)
const SafeContext = z.string().trim().min(1).max(253).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
const SafeDockerfile = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9._/-]+$/)

const KubernetesDeploymentConfigSchema = z.object({
  context: SafeContext,
  expectedClusterServer: z.string().url(),
  namespace: DnsLabel,
  deploymentName: WorkloadName,
  serviceName: DnsLabel.optional(),
  imageRepository: ImageRepository,
  dockerfile: SafeDockerfile.optional(),
  secretName: DnsLabel,
  storageClaimName: DnsLabel,
  containerPort: z.number().int().min(1).max(65535).optional(),
  servicePort: z.number().int().min(1).max(65535).optional(),
  ingressHost: z.string().trim().min(1).max(253).regex(/^[A-Za-z0-9.-]+$/).optional(),
  ingressClassName: DnsLabel.optional(),
  ingressNamespaces: z.array(DnsLabel).min(1).max(20).optional(),
  trustedOrigins: z.array(z.string().url()).max(20).optional(),
  tlsSecretName: DnsLabel.optional(),
  allowDestroy: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.dockerfile && (value.dockerfile.includes('..') || path.isAbsolute(value.dockerfile))) {
    context.addIssue({ code: 'custom', path: ['dockerfile'], message: 'dockerfile must stay inside the repository.' })
  }
  if (!value.ingressHost && (value.ingressClassName || value.tlsSecretName || value.ingressNamespaces)) {
    context.addIssue({ code: 'custom', path: ['ingressHost'], message: 'Ingress settings require ingressHost.' })
  }
  if (value.ingressHost && !value.ingressNamespaces) {
    context.addIssue({ code: 'custom', path: ['ingressNamespaces'], message: 'ingressHost requires explicit ingressNamespaces.' })
  }
  if (value.ingressHost && !value.tlsSecretName) {
    context.addIssue({ code: 'custom', path: ['tlsSecretName'], message: 'ingressHost requires tlsSecretName.' })
  }
})

type ParsedKubernetesDeploymentConfig = z.infer<typeof KubernetesDeploymentConfigSchema>

export interface KubernetesDeploymentConfig extends Omit<
  ParsedKubernetesDeploymentConfig,
  'serviceName' | 'dockerfile' | 'containerPort' | 'servicePort' | 'ingressNamespaces' | 'trustedOrigins' | 'allowDestroy'
> {
  serviceName: string
  dockerfile: string
  containerPort: number
  servicePort: number
  ingressNamespaces: string[]
  trustedOrigins: string[]
  allowDestroy: boolean
}

export const kubernetesDeploymentDriver: DeploymentDriver = {
  kind: 'kubernetes',
  executionMode: 'kubectl-server-side-apply',
  validateTarget: (target) => { parseKubernetesConfig(target) },
  plan: ({ appState, target, operation, repoRoot }) => {
    const config = parseKubernetesConfig(target)
    assertKubernetesRepoFiles(config, repoRoot)
    if (operation === 'deploy') return buildKubernetesDeployPlan(target, config)
    if (operation === 'rollback') {
      return buildKubernetesRollbackPlan(target, config, previousReleaseId(appStateDeploymentRuns(appState, target)))
    }
    return buildKubernetesDestroyPlan(target, config)
  },
  execute: (input) => {
    const config = parseKubernetesConfig(input.target)
    assertKubernetesRepoFiles(config, input.repoRoot)
    executeKubernetesOperation(input, config)
  },
}

export function buildKubernetesManifest(input: {
  config: KubernetesDeploymentConfig
  image: string
  releaseId: string
}): Record<string, unknown> {
  const { config } = input
  const labels = {
    'app.kubernetes.io/name': 'mainspring-gateway',
    'app.kubernetes.io/instance': config.deploymentName,
    'app.kubernetes.io/managed-by': 'mainspring',
  }
  const resources: Array<Record<string, unknown>> = [
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: config.deploymentName,
        namespace: config.namespace,
        labels,
        annotations: { 'mainspring.dev/release-id': input.releaseId },
      },
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        selector: { matchLabels: labels },
        template: {
          metadata: { labels, annotations: { 'mainspring.dev/release-id': input.releaseId } },
          spec: {
            automountServiceAccountToken: false,
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 10001,
              runAsGroup: 10001,
              fsGroup: 10001,
              seccompProfile: { type: 'RuntimeDefault' },
            },
            containers: [{
              name: 'gateway',
              image: input.image,
              imagePullPolicy: 'IfNotPresent',
              command: ['node', 'dist/gateway/server/dev.js'],
              ports: [{ name: 'http', containerPort: config.containerPort, protocol: 'TCP' }],
              env: [
                { name: 'MAINSPRING_GATEWAY_HOST', value: '0.0.0.0' },
                { name: 'MAINSPRING_GATEWAY_PORT', value: String(config.containerPort) },
                { name: 'MAINSPRING_GATEWAY_ENV', value: 'production' },
                { name: 'MAINSPRING_GATEWAY_BOOTSTRAP_SAMPLE_STATE', value: '0' },
                { name: 'MAINSPRING_GATEWAY_AUTH_MODE', value: 'hosted' },
                { name: 'MAINSPRING_RUNLOG_APPROVAL_KEY_MODE', value: 'configured' },
                { name: 'MAINSPRING_GATEWAY_MANAGED_SECRET_STORE', value: 'file' },
                { name: 'CODEX_HOME', value: '/codex-home' },
                ...(config.trustedOrigins.length > 0
                  ? [{ name: 'MAINSPRING_GATEWAY_TRUSTED_ORIGINS', value: config.trustedOrigins.join(',') }]
                  : []),
              ],
              envFrom: [{ secretRef: { name: config.secretName } }],
              readinessProbe: {
                httpGet: { path: '/readyz', port: 'http' },
                initialDelaySeconds: 5,
                periodSeconds: 5,
                timeoutSeconds: 3,
                failureThreshold: 12,
              },
              livenessProbe: {
                httpGet: { path: '/health', port: 'http' },
                initialDelaySeconds: 20,
                periodSeconds: 15,
                timeoutSeconds: 3,
                failureThreshold: 4,
              },
              resources: {
                requests: { cpu: '250m', memory: '512Mi' },
                limits: { cpu: '2', memory: '2Gi' },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                privileged: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ['ALL'] },
              },
              volumeMounts: [
                { name: 'data', mountPath: '/data' },
                { name: 'tmp', mountPath: '/tmp' },
                { name: 'codex-home', mountPath: '/codex-home' },
              ],
            }],
            volumes: [
              { name: 'data', persistentVolumeClaim: { claimName: config.storageClaimName } },
              { name: 'tmp', emptyDir: { sizeLimit: '512Mi' } },
              { name: 'codex-home', emptyDir: { sizeLimit: '512Mi' } },
            ],
          },
        },
      },
    },
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: config.serviceName, namespace: config.namespace, labels },
      spec: {
        type: 'ClusterIP',
        selector: labels,
        ports: [{ name: 'http', port: config.servicePort, targetPort: 'http', protocol: 'TCP' }],
      },
    },
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${config.deploymentName}-ingress`, namespace: config.namespace, labels },
      spec: {
        podSelector: { matchLabels: labels },
        policyTypes: ['Ingress'],
        ingress: [{
          from: config.ingressNamespaces.map((namespace) => ({
            namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': namespace } },
          })),
          ports: [{ protocol: 'TCP', port: config.containerPort }],
        }],
      },
    },
  ]
  if (config.ingressHost) {
    resources.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: { name: config.deploymentName, namespace: config.namespace, labels },
      spec: {
        ...(config.ingressClassName ? { ingressClassName: config.ingressClassName } : {}),
        ...(config.tlsSecretName
          ? { tls: [{ hosts: [config.ingressHost], secretName: config.tlsSecretName }] }
          : {}),
        rules: [{
          host: config.ingressHost,
          http: {
            paths: [{
              path: '/',
              pathType: 'Prefix',
              backend: { service: { name: config.serviceName, port: { number: config.servicePort } } },
            }],
          },
        }],
      },
    })
  }
  return { apiVersion: 'v1', kind: 'List', items: resources }
}

function parseKubernetesConfig(target: LocalGatewayDeploymentTargetRecord): KubernetesDeploymentConfig {
  const parsed = KubernetesDeploymentConfigSchema.safeParse(target.metadata ?? {})
  if (!parsed.success) {
    throw new Error(`Deployment target ${target.targetId} has invalid Kubernetes deployment config.`)
  }
  const trustedOrigins = (parsed.data.trustedOrigins ?? []).map((value) => {
    const url = new URL(value)
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(hostname))
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) {
      throw new Error(`Deployment target ${target.targetId} has invalid trustedOrigins.`)
    }
    return url.origin
  })
  if (parsed.data.ingressHost && !trustedOrigins.includes(`https://${parsed.data.ingressHost}`)) {
    throw new Error(`Deployment target ${target.targetId} ingressHost requires a matching HTTPS trustedOrigins entry.`)
  }
  const expectedClusterServerUrl = new URL(parsed.data.expectedClusterServer)
  if (
    expectedClusterServerUrl.protocol !== 'https:'
    || expectedClusterServerUrl.username
    || expectedClusterServerUrl.password
    || expectedClusterServerUrl.pathname !== '/'
    || expectedClusterServerUrl.search
    || expectedClusterServerUrl.hash
  ) {
    throw new Error(`Deployment target ${target.targetId} expectedClusterServer must be credential-free HTTPS.`)
  }
  return {
    ...parsed.data,
    expectedClusterServer: expectedClusterServerUrl.toString().replace(/\/$/, ''),
    serviceName: parsed.data.serviceName ?? parsed.data.deploymentName,
    dockerfile: parsed.data.dockerfile ?? 'docker/gateway.Dockerfile',
    containerPort: parsed.data.containerPort ?? 8787,
    servicePort: parsed.data.servicePort ?? 8787,
    ingressNamespaces: parsed.data.ingressNamespaces ?? [parsed.data.namespace],
    trustedOrigins,
    allowDestroy: parsed.data.allowDestroy === true,
  }
}

function assertKubernetesRepoFiles(config: KubernetesDeploymentConfig, repoRoot: string): void {
  const root = path.resolve(repoRoot)
  const dockerfile = path.resolve(root, config.dockerfile)
  const relative = path.relative(root, dockerfile)
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(dockerfile)) {
    throw new Error(`Kubernetes Dockerfile is missing or outside the repository: ${config.dockerfile}`)
  }
}

function releaseId(): string {
  return `release-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 17)}`
}

function buildKubernetesDeployPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: KubernetesDeploymentConfig,
): LocalGatewayDeploymentPlan {
  const release = releaseId()
  const image = `${config.imageRepository}:${release}`
  return {
    operation: 'deploy',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Apply Mainspring gateway release ${release} to ${config.context}/${config.namespace}.`,
    releaseId: release,
    prerequisites: [
      'kubectl must be installed and the named context must resolve to the intended cluster.',
      `The selected context API server must match the configured server pin ${config.expectedClusterServer}.`,
      `Namespace ${config.namespace}, Secret ${config.secretName}, and PVC ${config.storageClaimName} must already exist.`,
      'Docker must be installed and authenticated to push the configured image repository.',
    ],
    warnings: [
      'The SQLite gateway deployment is intentionally single-replica and requires a persistent volume.',
      'Deployments use Recreate strategy to prevent overlapping pods from opening the same SQLite volume.',
      'Cluster admission, ingress, storage, backup, and disaster-recovery policies remain operator responsibilities.',
      'Provider and gateway secrets are referenced from an existing Kubernetes Secret and are never generated by this driver.',
    ],
    steps: [
      { phase: 'remote', label: 'Verify context API server pin', command: `kubectl --context ${config.context} config view --minify -o jsonpath={.clusters[0].cluster.server}` },
      { phase: 'remote', label: 'Verify namespace, Secret, and PVC', command: `kubectl --context ${config.context} -n ${config.namespace} get secret/${config.secretName} pvc/${config.storageClaimName}` },
      { phase: 'local', label: 'Build gateway image', command: `docker build -t ${image} -f ${config.dockerfile} .` },
      { phase: 'local', label: 'Push gateway image', command: `docker push ${image}` },
      { phase: 'remote', label: 'Server-side apply release', command: `kubectl --context ${config.context} -n ${config.namespace} apply --server-side --field-manager=mainspring -f <generated-manifest>` },
      { phase: 'remote', label: 'Wait for rollout', command: `kubectl --context ${config.context} -n ${config.namespace} rollout status deployment/${config.deploymentName} --timeout=5m` },
    ],
  }
}

function buildKubernetesRollbackPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: KubernetesDeploymentConfig,
  rollbackReleaseId: string,
): LocalGatewayDeploymentPlan {
  return {
    operation: 'rollback',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Roll back ${config.deploymentName} using Kubernetes Deployment revision history.`,
    rollbackReleaseId,
    prerequisites: ['The Deployment must retain a previous ReplicaSet revision in the selected cluster.'],
    warnings: ['Rollback changes the Deployment pod template but does not roll back PVC data or external secrets.'],
    steps: [
      { phase: 'remote', label: 'Verify context API server pin', command: `kubectl --context ${config.context} config view --minify -o jsonpath={.clusters[0].cluster.server}` },
      { phase: 'remote', label: 'Roll back Deployment revision', command: `kubectl --context ${config.context} -n ${config.namespace} rollout undo deployment/${config.deploymentName}` },
      { phase: 'remote', label: 'Wait for rollback', command: `kubectl --context ${config.context} -n ${config.namespace} rollout status deployment/${config.deploymentName} --timeout=5m` },
    ],
  }
}

function buildKubernetesDestroyPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: KubernetesDeploymentConfig,
): LocalGatewayDeploymentPlan {
  if (!config.allowDestroy) throw new Error('Kubernetes destroy requires allowDestroy=true in target config.')
  return {
    operation: 'destroy',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Delete Mainspring workload resources from ${config.context}/${config.namespace}.`,
    prerequisites: ['kubectl must resolve the intended context and namespace.'],
    warnings: [
      'Destroy removes Deployment, Service, NetworkPolicy, and optional Ingress resources.',
      'The referenced PVC, Secret, namespace, and container images are deliberately preserved.',
    ],
    steps: [
      { phase: 'remote', label: 'Verify context API server pin', command: `kubectl --context ${config.context} config view --minify -o jsonpath={.clusters[0].cluster.server}` },
      {
        phase: 'remote',
        label: 'Delete workload resources',
        command: `kubectl --context ${config.context} -n ${config.namespace} delete deployment/${config.deploymentName} service/${config.serviceName} networkpolicy/${config.deploymentName}-ingress${config.ingressHost ? ` ingress/${config.deploymentName}` : ''}`,
      },
    ],
  }
}

function executeKubernetesOperation(input: DeploymentDriverExecuteInput, config: KubernetesDeploymentConfig): void {
  assertCommand(input.runner, 'kubectl')
  assertKubernetesContextPin(input.runner, config)
  if (input.operation === 'deploy') {
    const image = `${config.imageRepository}:${input.plan.releaseId!}`
    runKubectl(input.runner, config, ['get', 'namespace', config.namespace], 'Kubernetes namespace preflight failed', false)
    const secretResult = runKubectl(input.runner, config, [
      'get', 'secret', config.secretName,
      '-o', 'go-template={{range $key, $_ := .data}}{{$key}}{{"\\n"}}{{end}}',
    ], 'Kubernetes Secret preflight failed')
    const secretKeys = new Set(secretResult.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))
    const requiredSecretKeys = [
      'MAINSPRING_GATEWAY_BOOTSTRAP_USERNAME',
      'MAINSPRING_GATEWAY_BOOTSTRAP_PASSWORD',
      'MAINSPRING_RUNLOG_APPROVAL_KEY',
      'MAINSPRING_PROVIDER',
      'MAINSPRING_MODEL',
    ]
    const missingSecretKeys = requiredSecretKeys.filter((key) => !secretKeys.has(key))
    if (missingSecretKeys.length > 0) {
      throw new Error(`Kubernetes auth resource is missing ${missingSecretKeys.length} required fields.`)
    }
    const providerCredentialKeys = ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'CODEX_ACCESS_TOKEN']
    if (!providerCredentialKeys.some((key) => secretKeys.has(key))) {
      throw new Error('Kubernetes auth resource is missing a supported provider credential field.')
    }
    runKubectl(input.runner, config, ['get', 'pvc', config.storageClaimName], 'Kubernetes PVC preflight failed')
    assertCommand(input.runner, 'docker')
    run(input.runner, 'docker', [
      'build', '-t', image,
      '-f', config.dockerfile,
      '.',
    ], input.repoRoot, 'docker build failed')
    run(input.runner, 'docker', ['push', image], undefined, 'docker push failed')
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-kubernetes-'))
    try {
      const manifestPath = path.join(tempRoot, 'manifest.json')
      fs.writeFileSync(manifestPath, `${JSON.stringify(buildKubernetesManifest({ config, image, releaseId: input.plan.releaseId! }), null, 2)}\n`)
      runKubectl(input.runner, config, [
        'apply', '--server-side', '--field-manager=mainspring', '-f', manifestPath,
      ], 'Kubernetes server-side apply failed')
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
    runKubectl(input.runner, config, [
      'rollout', 'status', `deployment/${config.deploymentName}`, '--timeout=5m',
    ], 'Kubernetes rollout failed')
    return
  }
  if (input.operation === 'rollback') {
    runKubectl(input.runner, config, ['rollout', 'undo', `deployment/${config.deploymentName}`], 'Kubernetes rollback failed')
    runKubectl(input.runner, config, [
      'rollout', 'status', `deployment/${config.deploymentName}`, '--timeout=5m',
    ], 'Kubernetes rollback rollout failed')
    return
  }
  if (!config.allowDestroy) throw new Error('Kubernetes destroy requires allowDestroy=true in target config.')
  const resources = [
    `deployment/${config.deploymentName}`,
    `service/${config.serviceName}`,
    `networkpolicy/${config.deploymentName}-ingress`,
    ...(config.ingressHost ? [`ingress/${config.deploymentName}`] : []),
  ]
  runKubectl(input.runner, config, ['delete', ...resources, '--ignore-not-found=true'], 'Kubernetes destroy failed')
}

function assertKubernetesContextPin(
  runner: LocalGatewayDeploymentCommandRunner,
  config: KubernetesDeploymentConfig,
): void {
  const contextResult = runKubectl(runner, config, [
    'config', 'view', '--minify', '-o', 'jsonpath={.clusters[0].cluster.server}',
  ], 'Kubernetes context preflight failed', false)
  if (contextResult.stdout.trim().replace(/\/$/, '') !== config.expectedClusterServer) {
    throw new Error('Kubernetes context API server does not match expectedClusterServer.')
  }
}

function runKubectl(
  runner: LocalGatewayDeploymentCommandRunner,
  config: KubernetesDeploymentConfig,
  args: string[],
  failure: string,
  namespaced = true,
) {
  return run(runner, 'kubectl', [
    '--context', config.context,
    ...(namespaced ? ['--namespace', config.namespace] : []),
    ...args,
  ], undefined, failure)
}

function assertCommand(runner: LocalGatewayDeploymentCommandRunner, command: string): void {
  const result = runner.run({ command, args: [] })
  if (result.error || /not recognized|no such file|not found/i.test(`${result.stderr}\n${result.stdout}`)) {
    throw new Error(`Required local command is unavailable: ${command}`)
  }
}

function run(
  runner: LocalGatewayDeploymentCommandRunner,
  command: string,
  args: string[],
  cwd: string | undefined,
  failure: string,
): ReturnType<LocalGatewayDeploymentCommandRunner['run']> {
  const result = runner.run({ command, args, ...(cwd ? { cwd } : {}) })
  if (result.status !== 0 || result.error) {
    const detail = (result.stderr || result.stdout || result.error?.message || 'unknown error').trim().slice(0, 500)
    throw new Error(`${failure}: ${detail}`)
  }
  return result
}

function appStateDeploymentRuns(
  appState: DeploymentDriverExecuteInput['appState'],
  target: LocalGatewayDeploymentTargetRecord,
): Array<{ releaseId: string; updatedAt: string }> {
  return appState.deploymentRuns
    .list({ targetId: target.targetId, status: 'succeeded' })
    .filter((entry) => typeof entry.metadata?.releaseId === 'string')
    .map((entry) => ({ releaseId: String(entry.metadata!.releaseId), updatedAt: entry.updatedAt }))
}

function previousReleaseId(runs: Array<{ releaseId: string; updatedAt: string }>): string {
  const releases = [...runs]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((entry) => entry.releaseId)
    .filter((release, index, all) => all.indexOf(release) === index)
  if (releases.length < 2) throw new Error('Kubernetes rollback requires at least two successful deployments.')
  return releases[1]
}
