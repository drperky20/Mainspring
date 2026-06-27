import { createMainspringRuntimeId } from '#protocol'
import type { AgentProvider, AgentQuery, ProviderEvent, QueryInput } from './types.js'

export type MockProviderStep =
  | { type: 'event'; event: ProviderEvent }
  | {
      type: 'await_push'
      produce:
        | ProviderEvent
        | ProviderEvent[]
        | ((message: string) => ProviderEvent | ProviderEvent[] | Promise<ProviderEvent | ProviderEvent[]>)
    }

class MockQuery implements AgentQuery {
  private aborted = false
  private readonly pushed: string[] = []
  private readonly waiters: Array<(message: string) => void> = []
  readonly events: AsyncIterable<ProviderEvent>

  constructor(
    private readonly input: QueryInput,
    private readonly steps: MockProviderStep[],
  ) {
    this.events = this.createEvents()
  }

  push(message: string): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter(message)
      return
    }
    this.pushed.push(message)
  }

  end(): void {}

  abort(): void {
    this.aborted = true
    while (this.waiters.length > 0) {
      this.waiters.shift()?.('')
    }
  }

  private async nextPush(): Promise<string> {
    if (this.pushed.length > 0) return this.pushed.shift() ?? ''
    return await new Promise<string>((resolve) => {
      this.waiters.push(resolve)
    })
  }

  private async *createEvents(): AsyncIterable<ProviderEvent> {
    if (this.steps.length === 0 || this.steps[0]?.type !== 'event' || this.steps[0].event.type !== 'init') {
      yield {
        type: 'init',
        provider: 'mock',
        providerSessionId: this.input.sessionId ?? createMainspringRuntimeId('mock'),
        modelId: this.input.model,
      }
    }

    for (const step of this.steps) {
      if (this.aborted) return
      if (step.type === 'event') {
        yield step.event
        continue
      }

      const pushed = await this.nextPush()
      if (this.aborted) return
      const produced =
        typeof step.produce === 'function' ? await step.produce(pushed) : step.produce
      const events = Array.isArray(produced) ? produced : [produced]
      for (const event of events) {
        if (this.aborted) return
        yield event
      }
    }
  }
}

export class MockProvider implements AgentProvider {
  constructor(
    private readonly script:
      | MockProviderStep[]
      | ((input: QueryInput) => MockProviderStep[]),
  ) {}

  query(input: QueryInput): AgentQuery {
    return new MockQuery(
      input,
      typeof this.script === 'function' ? this.script(input) : this.script,
    )
  }
}
