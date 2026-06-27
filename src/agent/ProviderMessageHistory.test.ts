import { describe, expect, it } from 'vitest'
import {
  repairProviderMessageHistory,
  REPAIRED_TOOL_ARGUMENTS_MARKER,
} from './ProviderMessageHistory.js'

describe('repairProviderMessageHistory', () => {
  it('drops orphan tool results and merges consecutive user messages', () => {
    const repaired = repairProviderMessageHistory([
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'call_1', name: 'file.read', arguments: '{"path":"notes.txt"}' }],
      },
      { role: 'tool', content: '{"oops":true}', toolCallId: 'orphan', name: 'file.read' },
      { role: 'tool', content: '{"ok":true}', toolCallId: 'call_1', name: 'file.read' },
      { role: 'user', content: 'third' },
      { role: 'tool', content: '{"late":true}', toolCallId: 'call_1', name: 'file.read' },
    ])

    expect(repaired.messages).toEqual([
      { role: 'user', content: 'first\n\nsecond' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'call_1', name: 'file.read', arguments: '{"path":"notes.txt"}' }],
      },
      { role: 'tool', content: '{"ok":true}', toolCallId: 'call_1', name: 'file.read' },
      { role: 'user', content: 'third' },
    ])
    expect(repaired.repairs).toEqual({
      orphanToolResultsDropped: 2,
      consecutiveUserMerges: 1,
      malformedToolArgumentsRepaired: 0,
    })
  })

  it('repairs malformed assistant tool-call arguments to empty objects', () => {
    const repaired = repairProviderMessageHistory([
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          { id: 'call_blank', name: 'file.read', arguments: '' },
          { id: 'call_bad', name: 'file.read', arguments: '{"path":' },
          { id: 'call_ok', name: 'file.read', arguments: '{"path":"notes.txt"}' },
        ],
      },
      { role: 'tool', content: '{"blank":true}', toolCallId: 'call_blank', name: 'file.read' },
      { role: 'tool', content: '{"bad":true}', toolCallId: 'call_bad', name: 'file.read' },
      { role: 'tool', content: '{"ok":true}', toolCallId: 'call_ok', name: 'file.read' },
    ])

    expect(repaired.messages).toEqual([
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          { id: 'call_blank', name: 'file.read', arguments: '{}' },
          { id: 'call_bad', name: 'file.read', arguments: '{}' },
          { id: 'call_ok', name: 'file.read', arguments: '{"path":"notes.txt"}' },
        ],
      },
      {
        role: 'tool',
        content: `${REPAIRED_TOOL_ARGUMENTS_MARKER}\n{"blank":true}`,
        toolCallId: 'call_blank',
        name: 'file.read',
      },
      {
        role: 'tool',
        content: `${REPAIRED_TOOL_ARGUMENTS_MARKER}\n{"bad":true}`,
        toolCallId: 'call_bad',
        name: 'file.read',
      },
      { role: 'tool', content: '{"ok":true}', toolCallId: 'call_ok', name: 'file.read' },
    ])
    expect(repaired.repairs).toEqual({
      orphanToolResultsDropped: 0,
      consecutiveUserMerges: 0,
      malformedToolArgumentsRepaired: 2,
    })
  })
})
