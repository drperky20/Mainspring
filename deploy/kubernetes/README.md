# Kubernetes gateway deployment

Mainspring's `kubernetes` deployment driver generates and server-side applies a gateway workload. It requires an existing namespace, Secret, persistent volume claim, registry, and configured `kubectl` context. `expectedClusterServer` pins that context to an explicit HTTPS API-server origin before any cluster mutation.

Example target config:

```json
{
  "context": "production",
  "expectedClusterServer": "https://kubernetes.company.invalid",
  "namespace": "mainspring",
  "deploymentName": "mainspring-gateway",
  "imageRepository": "registry.company.invalid/mainspring/gateway",
  "secretName": "mainspring-gateway-secrets",
  "storageClaimName": "mainspring-gateway-data",
  "ingressHost": "mainspring.company.invalid",
  "ingressClassName": "nginx",
  "ingressNamespaces": ["ingress-nginx"],
  "tlsSecretName": "mainspring-gateway-tls",
  "trustedOrigins": ["https://mainspring.company.invalid"]
}
```

The Secret must supply hosted bootstrap credentials and a non-development RunLog approval key at minimum:

- `MAINSPRING_GATEWAY_BOOTSTRAP_USERNAME`
- `MAINSPRING_GATEWAY_BOOTSTRAP_PASSWORD`
- `MAINSPRING_RUNLOG_APPROVAL_KEY`
- `MAINSPRING_PROVIDER`
- `MAINSPRING_MODEL`
- one of `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, or `CODEX_ACCESS_TOKEN`

The driver never creates or prints Secret values. Production mode fails closed instead of starting the Echo provider when provider configuration is absent, and it disables the local Northline sample-state bootstrap.

Preflight reads only the Secret's key names and fails unless all three required keys are present; it does not request their values.

The generated Deployment is intentionally single-replica with `Recreate` strategy because the gateway uses SQLite and a single persistent volume; this avoids overlapping old/new pods at the cost of rollout downtime. It runs as UID/GID 10001, disables service-account token mounting, drops Linux capabilities, uses a read-only root filesystem, mounts writable `/data`, `/tmp`, and `/codex-home` volumes, and configures `/readyz` readiness, process liveness, and resource limits.

`destroy` requires `allowDestroy: true` and preserves the namespace, Secret, PVC, and images. This driver is deployable code, not evidence that a particular cluster, storage class, ingress controller, backup policy, or disaster-recovery plan is production-ready.
