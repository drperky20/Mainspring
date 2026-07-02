# Documentation Guide

## Rule

Keep docs short, current, and attached to verification.

## Where Things Go

- `README.md`: project front door.
- `docs/index.md`: map.
- `docs/getting-started.md`: first run.
- `docs/architecture.md`: system shape.
- `docs/features/*`: feature behavior and limits.
- `docs/operations.md`: commands.
- `docs/current-state.md`: short repo truth.
- `docs/goal-digest.md`: repo-local long milestone ledger, excluded from npm package artifacts.

## Every Feature Doc Should Say

Use these headings:

- `## What It Does`
- `## What It Does Not Do`
- `## How To Verify`

The verification section should include a `bash` block with the relevant `pnpm` command or commands.

## Link Rules

- Package-visible Markdown must only link to files that exist in the npm package.
- Repo-local ledgers or working notes can be named in prose, but package-visible Markdown should not depend on them with Markdown links.
- Run `pnpm docs:check` after adding, moving, or removing docs so the public index, repo-local goal digest boundary, and removed-docs guard stay current.
- Run `pnpm package:check` after adding, moving, or removing public docs.

## Avoid

- roadmap claims in present tense
- fake security claims
- duplicating long status lists across multiple files
- burying user instructions in `goal-digest.md`
