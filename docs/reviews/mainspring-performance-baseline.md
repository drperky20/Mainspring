# Mainspring Performance Baseline

Captured on 2026-07-10 in `E:\Mainspring` before this overhaul branch changed
runtime or console behavior.

## Environment

- Windows host, PowerShell, Node `v24.14.0`, pnpm `9.15.4`.
- Frozen install reused the checked-in lockfile and completed in 1.094 s.
- `corepack prepare pnpm@9.15.4 --activate` passed. `corepack enable` failed
  before repository work because the process could not write
  `C:\Program Files\nodejs\pnpx`; the required pnpm version was already active.
- Measurements are diagnostic evidence, not cross-machine performance targets.

## Baseline commands

| Command | Result | Observed duration / result |
| --- | --- | --- |
| `pnpm run doctor` | Pass | 0.505 s |
| `pnpm typecheck` | Pass | 4.415 s |
| `pnpm test:typecheck` | Pass | 5.328 s |
| `pnpm test` | Pass | 90 files; 569 passed, 1 skipped; Vitest wall time 42.57 s |
| `pnpm build` | Pass | 5.417 s |
| `pnpm console:typecheck` | Pass | 5.866 s |
| `pnpm console:build` | Pass | 6.286 s |
| `pnpm verify` | Pass | doctor, type/tests, build, security/truth, skill, migration, docs, and console lanes all passed |

## Console bundle baseline

| Artifact | Raw | gzip |
| --- | ---: | ---: |
| Main JavaScript | 299.48 kB | 89.65 kB |
| Main CSS | 80.15 kB | 15.30 kB |

Vite transformed 32 modules for the baseline production build.

## Structural and data-flow baseline

- `ConnectedConsoleApp` requests gateway health plus a full `/snapshot` on
  initial load and then every 5 seconds.
- `/snapshot` creates a sanitized aggregate projection from every app-state
  collection plus sessions, runs, approvals, RunLog summaries, and operational
  status. It has no conditional response mechanism at this baseline.
- `RunLogWorker` claims and awaits one execution before its next polling cycle.
  Its default behavior is safe and simple, but queue throughput is serial.

## Measurement protocol for this branch

Final measurements will use deterministic Echo/Mock provider fixtures and
record:

- first and unchanged `/snapshot` response bytes, status, and median latency;
- active versus hidden-page refresh schedule and failure backoff;
- one-worker serial versus configured bounded-concurrency queue drain time;
- resulting console bundle sizes;
- regression checks for cancellation, lease fencing, retries, browser safety,
  and public DTO compatibility.

The performance claim is limited to measured transport/dispatch behavior. It
does not claim provider latency, browser automation speed, or host isolation.

## Post-overhaul measurements

Captured on the same Windows host with `pnpm benchmark:overhaul` after the
transport, scheduler, console, and bounded-read-model changes. The fixture
creates 24 local client/workspace/session records, 24 compatibility runs and
approval rows, plus 24 queued RunLog records, and uses an eight-run provider
fixture with a 20 ms deterministic delay. The compatibility activity fixture
remains static while its cache is sampled, so those rows measure projection
transport rather than mailbox-worker contention. These are local comparative
measurements, not CI thresholds or live-provider claims.

| Measure | Result | Interpretation |
| --- | --- | --- |
| Eight runs, default one active worker | 250.71 ms | Compatibility-preserving serial baseline. |
| Eight runs, `maxConcurrentRuns=4` | 84.15 ms | 2.98x faster for independent delayed provider-only runs. |
| Fresh server projection, five samples | median 1102.06 ms; mean 981.44 ms; p95 1206.21 ms; median 89,286 bytes | A full compatibility projection remains the expensive path. |
| Cached full `200`, 20 samples | median 20.89 ms; mean 21.14 ms; p95 22.21 ms; 89,624 bytes | The sanitized server projection is reused when its revision is unchanged. |
| Conditional unchanged `304`, 20 samples | median 1.55 ms; mean 1.66 ms; p95 2.37 ms; 0 bytes | Browser retains only its in-memory safe projection and receives no body. |
| Snapshot revision check, 20 samples | median 1.12 ms; p95 1.35 ms | Process-local mailbox revisions avoid rereading every mailbox on normal refreshes. |
| Cursor-paginated RunLog activity `200`, 20 samples | median 10.79 ms; mean 11.30 ms; p95 13.68 ms; 12,971 bytes | Canonical RunLog rows load without rebuilding the 89,624-byte aggregate snapshot. |
| Cold cursor-paginated compatibility activity `200`, one sample | 380.57 ms; 7,858 bytes | The initial page builds projections only for its 24 represented sessions. |
| Warm cursor-paginated compatibility activity `200`, 20 samples | median 4.75 ms; mean 4.82 ms; p95 5.24 ms; 7,858 bytes | A 64-session cache keeps the page hot without consulting the broad snapshot revision or reopening represented session stores. |
| Cursor-paginated approval history `200`, 20 samples | median 5.22 ms; mean 5.30 ms; p95 5.72 ms; 7,961 bytes | Compatibility metadata and canonical RunLog summaries are merged without loading the full snapshot. |
| Public RunLog trace page `200`, 20 samples | median 2.81 ms; mean 2.88 ms; p95 3.27 ms; 3,885 bytes | Selected traces page only explicit public events; sensitive and artifact-only events stay host-side. |

Before the revision cache, an equivalent exploratory 24-client probe took
about 2.74 s for a repeated full snapshot and about 2.48 s for a conditional
request because the server rebuilt the whole projection before calculating an
ETag. Those pre-change observations were single samples, so the comparison is
directional; the post-change rows above are the repeatable evidence.

The current console bundle is 313.77 kB JavaScript (93.06 kB gzip) and 81.02
kB CSS (15.46 kB gzip). The increase reflects extracted feature boundaries and
the new bounded-page callers; it is not presented as a bundle-size improvement.
The measured UI win is avoided transfer and projection work on normal refreshes,
not a claim of code splitting.

## Safety and compatibility notes

- Worker concurrency is opt-in and defaults to one. The executor serializes
  same-workspace work inside the local process; multi-host workspace locking
  still requires a durable coordination adapter.
- The server cache stores only the already-sanitized console DTO in memory and
  sends `Cache-Control: no-store`; browser and intermediary persistence are not
  enabled.
- Compatibility cache entries track their own in-process mailbox mutation
  revision, so unrelated sessions do not flush a visible Activity page. A
  database/WAL fingerprint is refreshed for each represented session at most
  every 30 seconds to discover legacy external writers without a filesystem
  scan on each console refresh.
