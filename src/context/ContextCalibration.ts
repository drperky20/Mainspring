import type { ContextRenderArtifact } from './ContextRenderer.js'

export interface ContextFontCandidate {
  id: string
  family: string
  glyphDisambiguation: number
  compactness: number
}

export interface ContextLayoutCandidate {
  id: string
  columns: number
  lineNumbers: boolean
  density: number
}

export interface ContextCalibrationCandidateScore {
  id: string
  score: number
  reasons: string[]
}

export interface ContextCalibrationResult {
  bestFont: ContextCalibrationCandidateScore
  bestLayout: ContextCalibrationCandidateScore
  fontScores: ContextCalibrationCandidateScore[]
  layoutScores: ContextCalibrationCandidateScore[]
}

export interface ContextOcrProbe {
  read(input: { artifact: ContextRenderArtifact; expectedCanary: string }): Promise<string>
}

export interface ContextOcrCheckResult {
  passed: boolean
  expectedCanary: string
  observed: string
}

export interface SyntheticContextEvalCase {
  id: string
  kind: 'log' | 'stack' | 'diff' | 'file-tree' | 'json' | 'docs' | 'transcript'
  content: string
  expectedFacts: string[]
}

export const DEFAULT_CONTEXT_FONT_CANDIDATES: ContextFontCandidate[] = [
  { id: 'jetbrains-mono', family: 'JetBrains Mono', glyphDisambiguation: 0.88, compactness: 0.72 },
  { id: 'spleen', family: 'Spleen', glyphDisambiguation: 0.82, compactness: 0.9 },
  { id: 'unifont', family: 'Unifont', glyphDisambiguation: 0.78, compactness: 0.82 },
]

export const DEFAULT_CONTEXT_LAYOUT_CANDIDATES: ContextLayoutCandidate[] = [
  { id: 'single-readable', columns: 1, lineNumbers: true, density: 0.35 },
  { id: 'two-column-dense', columns: 2, lineNumbers: true, density: 0.68 },
  { id: 'three-column-ultra', columns: 3, lineNumbers: false, density: 0.88 },
]

export function runContextCalibrationTournament(input: {
  fonts?: readonly ContextFontCandidate[]
  layouts?: readonly ContextLayoutCandidate[]
  targetDensity?: number
} = {}): ContextCalibrationResult {
  const targetDensity = input.targetDensity ?? 0.65
  const fontScores = (input.fonts ?? DEFAULT_CONTEXT_FONT_CANDIDATES)
    .map((font) => ({
      id: font.id,
      score: font.glyphDisambiguation * 0.7 + font.compactness * 0.3,
      reasons: [`family:${font.family}`, `compactness:${font.compactness}`],
    }))
    .sort((a, b) => b.score - a.score)
  const layoutScores = (input.layouts ?? DEFAULT_CONTEXT_LAYOUT_CANDIDATES)
    .map((layout) => ({
      id: layout.id,
      score:
        1 -
        Math.abs(layout.density - targetDensity) +
        (layout.lineNumbers ? 0.08 : 0) -
        Math.max(0, layout.columns - 2) * 0.04,
      reasons: [`columns:${layout.columns}`, `density:${layout.density}`],
    }))
    .sort((a, b) => b.score - a.score)

  return {
    bestFont: fontScores[0] ?? { id: 'none', score: 0, reasons: [] },
    bestLayout: layoutScores[0] ?? { id: 'none', score: 0, reasons: [] },
    fontScores,
    layoutScores,
  }
}

export async function runContextOcrCheck(input: {
  artifact: ContextRenderArtifact
  expectedCanary?: string
  probe?: ContextOcrProbe
}): Promise<ContextOcrCheckResult> {
  const expectedCanary = input.expectedCanary ?? input.artifact.canary
  const observed = input.probe
    ? await input.probe.read({ artifact: input.artifact, expectedCanary })
    : Buffer.from(input.artifact.bytes).toString('utf8')
  return {
    passed: observed.includes(expectedCanary),
    expectedCanary,
    observed,
  }
}

export function createSyntheticContextEvalCorpus(): SyntheticContextEvalCase[] {
  return [
    {
      id: 'log-basic',
      kind: 'log',
      content: 'ERROR src/context/ContextCodec.ts failed with hash abc1234 after pnpm test',
      expectedFacts: ['src/context/ContextCodec.ts', 'abc1234', 'pnpm test'],
    },
    {
      id: 'json-config',
      kind: 'json',
      content: '{"version":"1.2.3","path":"src/context/types.ts","count":"42 tokens"}',
      expectedFacts: ['1.2.3', 'src/context/types.ts', '42 tokens'],
    },
    {
      id: 'file-tree',
      kind: 'file-tree',
      content: 'src/context/ContextRenderer.ts\nsrc/context/RenderedContextPrompt.ts',
      expectedFacts: ['src/context/ContextRenderer.ts', 'src/context/RenderedContextPrompt.ts'],
    },
  ]
}
