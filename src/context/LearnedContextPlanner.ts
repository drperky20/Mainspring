import type { ContextUsageLedgerSnapshot } from './ContextUsageLedger.js'

export interface LearnedContextPlannerRecommendation {
  modelId: string
  profileId: string
  encodingKind: string
  action: 'keep' | 'lower-density' | 'prefer-summary' | 'disable-images'
  reason: string
}

export function recommendContextPlannerAdjustments(
  snapshot: ContextUsageLedgerSnapshot,
): LearnedContextPlannerRecommendation[] {
  return snapshot.entries.map((entry) => {
    const rehydrateRate = entry.observations > 0 ? entry.rehydrated / entry.observations : 0
    const correctionRate = entry.observations > 0 ? entry.corrected / entry.observations : 0
    const averageSavings = entry.observations > 0 ? entry.estimatedSavingsTokens / entry.observations : 0
    let action: LearnedContextPlannerRecommendation['action'] = 'keep'
    let reason = `average savings ${averageSavings.toFixed(1)} tokens`
    if (correctionRate >= 0.2) {
      action = 'disable-images'
      reason = `correction rate ${correctionRate.toFixed(2)} is too high`
    } else if (rehydrateRate >= 0.5) {
      action = 'prefer-summary'
      reason = `rehydrate rate ${rehydrateRate.toFixed(2)} is too high`
    } else if (averageSavings < 128) {
      action = 'lower-density'
      reason = `average savings ${averageSavings.toFixed(1)} is low`
    }

    return {
      modelId: entry.modelId,
      profileId: entry.profileId,
      encodingKind: entry.encodingKind,
      action,
      reason,
    }
  })
}
