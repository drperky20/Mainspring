import type { AgentProvider } from '../providers/types.js'
import type { AgentSpec, ProviderRouter, ProviderRouterMap, RunRecord } from './types.js'

export class StaticProviderRouter implements ProviderRouter {
  constructor(private readonly map: ProviderRouterMap) {}

  resolve(input: { run: RunRecord; agent: AgentSpec }): AgentProvider {
    const providerId = input.run.providerId ?? input.agent.providerId ?? this.map.defaultProviderId
    const provider = this.map.providers[providerId]
    if (!provider) {
      throw new Error(`No provider registered for RunLog provider id: ${providerId}`)
    }
    return provider
  }
}

export class SingleProviderRouter implements ProviderRouter {
  constructor(private readonly provider: AgentProvider) {}

  resolve(): AgentProvider {
    return this.provider
  }
}
