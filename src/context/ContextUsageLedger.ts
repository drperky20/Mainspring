export interface ContextUsageObservation {
  modelId: string
  profileId: string
  blockId: string
  encodingKind: string
  estimatedTextTokens: number
  estimatedVisualTokens: number
  estimatedSavingsTokens: number
  rehydrated: boolean
  accepted: boolean
  corrected?: boolean
}

export interface ContextUsageLedgerEntry {
  modelId: string
  profileId: string
  encodingKind: string
  observations: number
  accepted: number
  corrected: number
  rehydrated: number
  estimatedTextTokens: number
  estimatedVisualTokens: number
  estimatedSavingsTokens: number
}

export interface ContextUsageLedgerSnapshot {
  entries: ContextUsageLedgerEntry[]
}

function keyFor(observation: ContextUsageObservation): string {
  return [observation.modelId, observation.profileId, observation.encodingKind].join('\u0000')
}

function emptyEntry(observation: ContextUsageObservation): ContextUsageLedgerEntry {
  return {
    modelId: observation.modelId,
    profileId: observation.profileId,
    encodingKind: observation.encodingKind,
    observations: 0,
    accepted: 0,
    corrected: 0,
    rehydrated: 0,
    estimatedTextTokens: 0,
    estimatedVisualTokens: 0,
    estimatedSavingsTokens: 0,
  }
}

export class InMemoryContextUsageLedger {
  private readonly entries = new Map<string, ContextUsageLedgerEntry>()

  record(observation: ContextUsageObservation): ContextUsageLedgerEntry {
    const key = keyFor(observation)
    const entry = this.entries.get(key) ?? emptyEntry(observation)
    entry.observations += 1
    entry.accepted += observation.accepted ? 1 : 0
    entry.corrected += observation.corrected ? 1 : 0
    entry.rehydrated += observation.rehydrated ? 1 : 0
    entry.estimatedTextTokens += observation.estimatedTextTokens
    entry.estimatedVisualTokens += observation.estimatedVisualTokens
    entry.estimatedSavingsTokens += observation.estimatedSavingsTokens
    this.entries.set(key, entry)
    return { ...entry }
  }

  snapshot(): ContextUsageLedgerSnapshot {
    return {
      entries: Array.from(this.entries.values())
        .map((entry) => ({ ...entry }))
        .sort((a, b) =>
          `${a.modelId}:${a.profileId}:${a.encodingKind}`.localeCompare(
            `${b.modelId}:${b.profileId}:${b.encodingKind}`,
          ),
        ),
    }
  }

  roiFor(input: {
    modelId: string
    profileId: string
    encodingKind: string
  }): {
    observations: number
    averageSavingsTokens: number
    rehydrateRate: number
    correctionRate: number
    acceptanceRate: number
  } {
    const entry = this.entries.get([input.modelId, input.profileId, input.encodingKind].join('\u0000'))
    if (!entry || entry.observations === 0) {
      return {
        observations: 0,
        averageSavingsTokens: 0,
        rehydrateRate: 0,
        correctionRate: 0,
        acceptanceRate: 0,
      }
    }
    return {
      observations: entry.observations,
      averageSavingsTokens: entry.estimatedSavingsTokens / entry.observations,
      rehydrateRate: entry.rehydrated / entry.observations,
      correctionRate: entry.corrected / entry.observations,
      acceptanceRate: entry.accepted / entry.observations,
    }
  }
}
