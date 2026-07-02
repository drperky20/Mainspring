# Memory, Skills, And Template Provenance

Mainspring treats memory, skills, and local templates as behavior-changing inputs. They are useful, but they can also persist instructions that affect future runs.

## Implemented

- `src/provenance/ProvenanceReview.ts` provides deterministic scan results with content hashes, findings, and statuses: `pass`, `review`, or `block`.
- `memory.write` scans proposed memory before persistence.
  - `block` findings fail before writing.
  - `review` findings are staged in `.mainspring/provenance-review.jsonl`.
  - explicit `reviewMode: "stage"` stages even clean memory.
  - clean approved writes still persist through the existing memory store and include provenance metadata.
- `skills.install` and `skills.update` scan manifests before persistence.
  - remote or uploaded skill sources stage by default.
  - shell, open network, and computer-write permissions require review.
  - block-level findings fail before writing a manifest.
- Approved staged memory and skill mutations can be applied through exported helpers:
  - `createProvenanceReviewQueue`
  - `applyApprovedMemoryReview`
  - `applyApprovedSkillReview`
- Local example templates are scanned by `pnpm skills:check`.
- `pnpm verify` and `pnpm release:check` run `pnpm skills:check`.

## Scanner Rules

The current scanner looks for:

- remote content piped into shell or script interpreters
- prompt-injection phrases that try to override approvals, policy, or operator visibility
- secret or environment references
- policy/approval mutation language
- unsafe skill instruction paths
- high-capability skill permissions
- unsafe local template paths

Warnings route to review. Block findings fail closed.

## Limits

- This is local provenance and review plumbing, not a remote marketplace trust service.
- It does not prove that a reviewed skill is harmless.
- It does not run third-party code analysis beyond deterministic text and manifest checks.
- It does not add hosted identity, reputation, signing, or paid marketplace trust.
- Host shell execution remains unsafe host execution even when a skill or template is reviewed.

## Maintainer Commands

```bash
pnpm skills:check
pnpm exec vitest run src/provenance src/tools
pnpm verify
pnpm release:check
```
