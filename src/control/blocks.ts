import { z } from 'zod'
import {
  AgentStatusEventPayloadSchema,
  ApprovalRequestedEventPayloadSchema,
  ArtifactCreatedEventPayloadSchema,
  BrowserPreviewEventPayloadSchema,
  ErrorEventPayloadSchema,
  FilePreviewEventPayloadSchema,
  ProgressEventPayloadSchema,
  ResultSummaryEventPayloadSchema,
  SourceReferenceEventPayloadSchema,
  type TurnEvent,
} from './events.js'
import { TurnStatusSchema } from './turn.js'

// ============================================================
// Generative UI block taxonomy (D7).
// Backend events map onto AI SDK v6 UIMessage parts:
//   text → text part, reasoning → reasoning part,
//   tool.* → tool-* parts, everything else → typed data-* parts.
// Console renders custom data-* parts via BlockRenderer.
// ============================================================

export const UI_DATA_PART_NAMES = {
  approval: 'data-approval',
  progress: 'data-progress',
  sourceReference: 'data-source-reference',
  browserPreview: 'data-browser-preview',
  filePreview: 'data-file-preview',
  artifact: 'data-artifact',
  resultSummary: 'data-result-summary',
  agentStatus: 'data-agent-status',
  timeline: 'data-timeline',
  error: 'data-error',
} as const
export type UiDataPartName = (typeof UI_DATA_PART_NAMES)[keyof typeof UI_DATA_PART_NAMES]

export const ApprovalBlockSchema = ApprovalRequestedEventPayloadSchema.extend({
  status: z.enum(['pending', 'approved', 'denied', 'expired']),
})
export type ApprovalBlock = z.infer<typeof ApprovalBlockSchema>

export const ProgressBlockSchema = ProgressEventPayloadSchema
export type ProgressBlock = z.infer<typeof ProgressBlockSchema>

export const SourceReferenceBlockSchema = SourceReferenceEventPayloadSchema
export type SourceReferenceBlock = z.infer<typeof SourceReferenceBlockSchema>

export const BrowserPreviewBlockSchema = BrowserPreviewEventPayloadSchema
export type BrowserPreviewBlock = z.infer<typeof BrowserPreviewBlockSchema>

export const FilePreviewBlockSchema = FilePreviewEventPayloadSchema
export type FilePreviewBlock = z.infer<typeof FilePreviewBlockSchema>

export const ArtifactBlockSchema = ArtifactCreatedEventPayloadSchema
export type ArtifactBlock = z.infer<typeof ArtifactBlockSchema>

export const ResultSummaryBlockSchema = ResultSummaryEventPayloadSchema
export type ResultSummaryBlock = z.infer<typeof ResultSummaryBlockSchema>

export const AgentStatusBlockSchema = AgentStatusEventPayloadSchema
export type AgentStatusBlock = z.infer<typeof AgentStatusBlockSchema>

export const ErrorBlockSchema = ErrorEventPayloadSchema
export type ErrorBlock = z.infer<typeof ErrorBlockSchema>

export const TimelineBlockSchema = z.object({
  turnId: z.string().min(1),
  status: TurnStatusSchema,
  steps: z.array(
    z.object({
      at: z.string(),
      label: z.string().min(1),
      kind: z.enum(['status', 'tool', 'approval', 'artifact', 'error']),
    }),
  ),
})
export type TimelineBlock = z.infer<typeof TimelineBlockSchema>

export const UiBlockSchemas = {
  [UI_DATA_PART_NAMES.approval]: ApprovalBlockSchema,
  [UI_DATA_PART_NAMES.progress]: ProgressBlockSchema,
  [UI_DATA_PART_NAMES.sourceReference]: SourceReferenceBlockSchema,
  [UI_DATA_PART_NAMES.browserPreview]: BrowserPreviewBlockSchema,
  [UI_DATA_PART_NAMES.filePreview]: FilePreviewBlockSchema,
  [UI_DATA_PART_NAMES.artifact]: ArtifactBlockSchema,
  [UI_DATA_PART_NAMES.resultSummary]: ResultSummaryBlockSchema,
  [UI_DATA_PART_NAMES.agentStatus]: AgentStatusBlockSchema,
  [UI_DATA_PART_NAMES.timeline]: TimelineBlockSchema,
  [UI_DATA_PART_NAMES.error]: ErrorBlockSchema,
} as const

// Which UIMessage data-part a non-text/non-tool event maps to, or null
// when the event maps to native parts (text/reasoning/tool) or is
// transcript-invisible (usage/log/provider.*/turn.status).
export function uiDataPartNameForEvent(event: TurnEvent): UiDataPartName | null {
  switch (event.type) {
    case 'approval.requested':
      return UI_DATA_PART_NAMES.approval
    case 'progress':
      return UI_DATA_PART_NAMES.progress
    case 'source.reference':
      return UI_DATA_PART_NAMES.sourceReference
    case 'browser.preview':
      return UI_DATA_PART_NAMES.browserPreview
    case 'file.preview':
      return UI_DATA_PART_NAMES.filePreview
    case 'artifact.created':
      return UI_DATA_PART_NAMES.artifact
    case 'result.summary':
      return UI_DATA_PART_NAMES.resultSummary
    case 'agent.status':
      return UI_DATA_PART_NAMES.agentStatus
    case 'error':
      return UI_DATA_PART_NAMES.error
    default:
      return null
  }
}
