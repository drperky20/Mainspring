import type { RunEvent } from '../contracts/runtime.js'

export interface PollingEventStreamOptions {
  pollIntervalMs: number
  loadAfterSeq: (afterSeq: number) => RunEvent[]
  isTerminal?: (event: RunEvent) => boolean
}

export async function* createPollingEventStream(
  options: PollingEventStreamOptions,
): AsyncIterable<RunEvent> {
  let lastSeq = 0

  for (;;) {
    const events = options.loadAfterSeq(lastSeq)
    if (events.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs))
      continue
    }

    for (const event of events) {
      lastSeq = Math.max(lastSeq, event.seq)
      yield event
      if (options.isTerminal?.(event)) return
    }
  }
}
