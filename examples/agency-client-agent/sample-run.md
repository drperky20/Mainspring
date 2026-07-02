# Sample Run

- Create temporary SQLite RunLog state and one client workspace for an agency-managed operator.
- Start one `RunIntent` through `createRunLogMainspring`.
- Read one launch brief from the client workspace through `file.read`.
- Record an allowed policy decision and checkpoint for the read.
- Request `file.write`, record a `requires_approval` policy decision, and pause the run.
- Approve the exact write request with a scoped RunLog receipt.
- Resume through `ToolRegistry`, write one client-update deliverable, checkpoint the approved tool result, and complete with an assistant result.
- Print a JSON run summary and remove temporary RunLog state plus generated example files.
