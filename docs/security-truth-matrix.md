# Security Truth Matrix

Last updated: 2026-07-02.

Mainspring's security posture is deliberately plain: it is a local-first runtime with durable audit and approval controls, not a containment product.

| Claim area | Current truth | Allowed wording | Disallowed wording | Evidence |
| --- | --- | --- | --- | --- |
| Host shell/process execution | Host execution can affect the host account and workspace. | "unsafe host execution", "not a sandbox", "approvals reduce accidents" | "safe shell", "sandboxed shell", "secure containment" | `src/tools/ShellTool.ts`, `src/tools/ExecutionBackend.ts`, `docs/security.md` |
| Docker/WSL backends | Optional execution routes. They are not VM isolation guarantees. | "optional backend", "not complete VM isolation" | "secure VM pool", "isolated by default" | `src/tools/ExecutionBackend.ts`, `docs/roadmap.md` |
| Browser automation | Browser tooling is an automation capability, not a security boundary. | "browser automation is not a sandbox", "browser DTOs are sanitized" | "secure browser isolation", "browser sandbox product" | `src/tools/BrowserTool.ts`, `docs/security.md` |
| Provider secrets | Secrets should be host-side references. Renderer localStorage provider auth remains prototype-only. | "provider keys must not be stored in renderer localStorage" | "secure desktop secret vault", "browser-stored provider keys" | `SECURITY.md`, `docs/security.md`, gateway secret tests |
| RunLog crash recovery | RunLog has SQLite WAL events, leases, checkpoints, scoped approval resume for implemented tool boundaries, and provider continuation after approved tool resume. General checkpoint replay/retry controls remain incomplete. | "RunLog checkpoints are implemented", "scoped approval resume exists for approved tool boundaries", "approved tool resume continues to provider result" | "fully resumable approval workflow" | `src/core`, `src/adapters/sqlite`, `docs/current-state.md` |
| Approval receipts | Legacy receipts bind approval id/run/tool/input/expiry/nonce. RunLog receipts add HMAC signing, private request snapshots, expiry, one-time-use rows, and provider continuation after approved tool resume. | "scoped signed RunLog receipts", "one-time-use approved tool resume" | "broad approval token", "secure containment", "operator role system" | `src/policy/ApprovalReceipt.ts`, `src/core/RunLogApprovalReceipt.ts`, `src/adapters/sqlite/SqliteRunLogStore.ts` |
| Cron/headless | RunLog cron rows emit policy decisions before queue/fail, deny side-effecting headless schedules by default, and support scoped grants bound to prompt hash, schedule hash, allowed tools, expiry, and execution count. Legacy gateway cron scheduling is still a migration surface. | "RunLog cron creates ordinary audited runs", "side-effecting headless RunLog cron requires scoped grants", "gateway cron migration remains pending" | "cron can safely run any approved automation unattended", "gateway cron is fully RunLog-native" | `src/capabilities/cron/RunLogCron.ts`, `src/adapters/sqlite/SqliteRunLogStore.ts`, `src/core/RunLogKernel.test.ts`, `docs/runtime-loop.md` |
| Memory/skills | Memory and skill writes can alter future behavior and need policy/review. Provenance scanning is not complete. | "memory/skill writes are behavior mutation", "provenance scan planned" | "safe self-improving skill marketplace" | `src/memory`, `src/skills`, `docs/current-state.md` |
| Marketplace/templates | Local trusted templates exist. Hosted paid marketplace trust is not implemented. | "trusted local templates" | "secure marketplace", "paid marketplace" | `src/gateway/TemplateMarketplace.ts`, `docs/current-state.md` |
| Cloud/Kubernetes/multi-tenancy | Future adapter/deployment direction only. | "future adapter", "not production multi-tenant isolation" | "Kubernetes production ready", "enterprise tenant isolation" | `docs/roadmap.md`, `.github/workflows` |
| Billing/operator roles | Not implemented as product authority. | "not implemented", "future work" | "billing", "operator roles" as shipped controls | `docs/roadmap.md`, `SECURITY.md` |

## Release Guard

`pnpm security:truth` checks package-visible docs, examples, scripts, package metadata, and public source comments for unsupported security/product claims. Honest limitation wording is allowed; ambiguous or positive containment claims fail.

`pnpm release:check` and `pnpm verify` must include this guard so claim drift is caught before release.
