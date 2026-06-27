import { createMainspringRuntimeId } from '#protocol'
import type { AgentProvider, AgentQuery, ProviderEvent, QueryInput } from './types.js'

class EchoQuery implements AgentQuery {
  private aborted = false
  readonly events: AsyncIterable<ProviderEvent>

  constructor(private readonly input: QueryInput) {
    this.events = this.createEvents()
  }

  push(_message: string): void {}

  end(): void {}

  abort(): void {
    this.aborted = true
  }

  private async *createEvents(): AsyncIterable<ProviderEvent> {
    if (this.aborted) return
    yield {
      type: 'init',
      provider: 'echo',
      providerSessionId: this.input.sessionId ?? createMainspringRuntimeId('echo'),
      modelId: this.input.model,
    }
    if (this.aborted) return
    yield { type: 'delta', text: this.input.prompt }
    if (this.aborted) return
    yield { type: 'result', text: this.input.prompt }
  }
}

export class EchoProvider implements AgentProvider {
  query(input: QueryInput): AgentQuery {
    return new EchoQuery(input)
  }
}
