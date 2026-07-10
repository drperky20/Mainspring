import type {
  RunLogProjectionCatchupResult,
  RunLogRunSummary,
  RunLogStore,
} from '../../core/types.js'

/**
 * Host-facing coordinator for the persisted RunLog read model. SQLite owns the
 * transaction because event reads, summary writes, and cursor advancement must
 * commit together in the same database.
 */
export class RunLogProjector {
  constructor(private readonly store: RunLogStore) {}

  catchUp(limit?: number): RunLogProjectionCatchupResult {
    return this.store.catchUpRunProjection(limit === undefined ? undefined : { limit })
  }

  catchUpUntilIdle(input: { limit?: number; maxBatches?: number } = {}): RunLogProjectionCatchupResult {
    const maxBatches = Math.min(Math.max(Math.floor(input.maxBatches ?? 10_000), 1), 100_000)
    let latest = this.catchUp(input.limit)
    for (let batch = 1; latest.processedEvents > 0 && batch < maxBatches; batch += 1) {
      const next = this.catchUp(input.limit)
      if (next.processedEvents === 0) return next
      latest = next
    }
    return latest
  }

  summary(runId: string): RunLogRunSummary | null {
    return this.store.getRunProjectionSummary(runId)
  }
}
