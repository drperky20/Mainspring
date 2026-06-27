# Open Source Readiness

Mainspring is being shaped as a serious public repo: runtime-first, local-first, and explicit about its limits.

## Public Repo Standard

- clear README
- editable brand assets
- examples that map to real agent-business shapes
- verification lane centered on `pnpm verify`
- security docs that distinguish implemented controls from roadmap language
- root contributor, release, and conduct documents

## Truth Rules

Public docs should not claim:

- secure sandboxing where only host execution exists
- desktop secret storage where prototype localStorage exists
- billing, hosted control plane, or Electron packaging unless implemented
- HyperCells or VM isolation unless they land in code and tests

## What Is Ready To Share

- runtime architecture
- SDK surface
- gateway and console read-model direction
- examples for common operator and agency scenarios
- honest security and deployment notes

## What Still Needs Care

- live console transport
- richer runtime-backed trace screens
- broader release automation
- long-term deployment story beyond local and Docker packaging
