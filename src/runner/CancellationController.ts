import type { AgentQuery } from '../providers/types.js'

export class CancellationController {
  private readonly activeQueries = new Map<string, AgentQuery>()

  track(runId: string, query: AgentQuery): void {
    this.activeQueries.set(runId, query)
  }

  untrack(runId: string, query: AgentQuery): void {
    if (this.activeQueries.get(runId) === query) {
      this.activeQueries.delete(runId)
    }
  }

  abort(runId: string): boolean {
    const query = this.activeQueries.get(runId)
    if (!query) return false
    query.abort()
    return true
  }
}
