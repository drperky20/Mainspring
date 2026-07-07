import type {
  CompiledContextPrompt,
  ContextImageProjection,
  ContextPromptPart,
} from './types.js'

export type ContextProviderPayloadKind =
  | 'openai-responses'
  | 'openai-chat'
  | 'anthropic-messages'
  | 'gemini-interactions'
  | 'xai-chat'
  | 'text'
  | 'custom'

export interface SerializedContextImage {
  blockId: string
  recoverableId: string
  projection: ContextImageProjection
  uri: string
  mediaType: string
  altText: string
}

export interface ContextProviderPayload {
  kind: ContextProviderPayloadKind
  modelId: string
  payload: unknown
  imageBindings: SerializedContextImage[]
  warnings: string[]
}

export interface SerializeContextPromptOptions {
  imageUriFor?: (part: Extract<ContextPromptPart, { type: 'image' }>) => string
  mediaTypeFor?: (part: Extract<ContextPromptPart, { type: 'image' }>) => string
  mediaType?: string
}

function defaultImageUri(part: Extract<ContextPromptPart, { type: 'image' }>): string {
  return `mainspring-context://${part.recoverableId}/${part.blockId}.png`
}

function imageBinding(
  part: Extract<ContextPromptPart, { type: 'image' }>,
  options: SerializeContextPromptOptions,
): SerializedContextImage {
  return {
    blockId: part.blockId,
    recoverableId: part.recoverableId,
    projection: part.projection,
    uri: options.imageUriFor?.(part) ?? defaultImageUri(part),
    mediaType: options.mediaTypeFor?.(part) ?? options.mediaType ?? 'image/png',
    altText: part.altText,
  }
}

function textPartText(part: ContextPromptPart): string {
  if (part.type === 'text') return part.text
  return part.altText
}

function serializeOpenAiResponses(
  compiled: CompiledContextPrompt,
  options: SerializeContextPromptOptions,
): ContextProviderPayload {
  const imageBindings: SerializedContextImage[] = []
  const content = compiled.parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'input_text', text: part.text }
    }
    const binding = imageBinding(part, options)
    imageBindings.push(binding)
    return {
      type: 'input_image',
      image_url: binding.uri,
      detail: part.projection.detail === 'auto' ? 'auto' : part.projection.detail,
    }
  })

  return {
    kind: 'openai-responses',
    modelId: compiled.model.modelId,
    payload: {
      model: compiled.model.modelId,
      input: [{ role: 'user', content }],
    },
    imageBindings,
    warnings: compiled.warnings,
  }
}

function serializeOpenAiCompatibleChat(
  compiled: CompiledContextPrompt,
  options: SerializeContextPromptOptions,
  kind: Extract<ContextProviderPayloadKind, 'openai-chat' | 'xai-chat'>,
): ContextProviderPayload {
  const imageBindings: SerializedContextImage[] = []
  const content = compiled.parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text }
    }
    const binding = imageBinding(part, options)
    imageBindings.push(binding)
    return { type: 'image_url', image_url: { url: binding.uri }, alt_text: binding.altText }
  })

  return {
    kind,
    modelId: compiled.model.modelId,
    payload: {
      model: compiled.model.modelId,
      messages: [{ role: 'user', content }],
    },
    imageBindings,
    warnings: compiled.warnings,
  }
}

function serializeAnthropicMessages(
  compiled: CompiledContextPrompt,
  options: SerializeContextPromptOptions,
): ContextProviderPayload {
  const imageBindings: SerializedContextImage[] = []
  const content = compiled.parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text }
    }
    const binding = imageBinding(part, options)
    imageBindings.push(binding)
    return {
      type: 'image',
      source: {
        type: 'url',
        url: binding.uri,
      },
      alt_text: binding.altText,
    }
  })

  return {
    kind: 'anthropic-messages',
    modelId: compiled.model.modelId,
    payload: {
      model: compiled.model.modelId,
      messages: [{ role: 'user', content }],
    },
    imageBindings,
    warnings: compiled.warnings,
  }
}

function serializeGeminiInteractions(
  compiled: CompiledContextPrompt,
  options: SerializeContextPromptOptions,
): ContextProviderPayload {
  const imageBindings: SerializedContextImage[] = []
  const parts = compiled.parts.map((part) => {
    if (part.type === 'text') {
      return { text: part.text }
    }
    const binding = imageBinding(part, options)
    imageBindings.push(binding)
    return {
      fileData: {
        mimeType: binding.mediaType,
        fileUri: binding.uri,
      },
      metadata: {
        blockId: binding.blockId,
        recoverableId: binding.recoverableId,
        mediaResolution: part.projection.detail,
      },
    }
  })

  return {
    kind: 'gemini-interactions',
    modelId: compiled.model.modelId,
    payload: {
      model: compiled.model.modelId,
      contents: [{ role: 'user', parts }],
    },
    imageBindings,
    warnings: compiled.warnings,
  }
}

function serializeText(compiled: CompiledContextPrompt): ContextProviderPayload {
  return {
    kind: 'text',
    modelId: compiled.model.modelId,
    payload: {
      model: compiled.model.modelId,
      prompt: compiled.textFallback,
    },
    imageBindings: [],
    warnings: compiled.warnings,
  }
}

export function serializeContextPromptForProvider(
  compiled: CompiledContextPrompt,
  options: SerializeContextPromptOptions = {},
): ContextProviderPayload {
  if (compiled.stats.imageParts === 0 || compiled.model.promptStyle === 'text') {
    return serializeText(compiled)
  }
  if (compiled.model.promptStyle === 'openai-responses') {
    return serializeOpenAiResponses(compiled, options)
  }
  if (compiled.model.promptStyle === 'openai-chat' || compiled.model.promptStyle === 'custom') {
    return serializeOpenAiCompatibleChat(compiled, options, 'openai-chat')
  }
  if (compiled.model.promptStyle === 'xai-chat') {
    return serializeOpenAiCompatibleChat(compiled, options, 'xai-chat')
  }
  if (compiled.model.promptStyle === 'anthropic-messages') {
    return serializeAnthropicMessages(compiled, options)
  }
  if (compiled.model.promptStyle === 'gemini-interactions') {
    return serializeGeminiInteractions(compiled, options)
  }

  return {
    kind: 'custom',
    modelId: compiled.model.modelId,
    payload: {
      model: compiled.model.modelId,
      parts: compiled.parts.map(textPartText),
    },
    imageBindings: [],
    warnings: [
      ...compiled.warnings,
      `No provider serializer exists for prompt style ${compiled.model.promptStyle}.`,
    ],
  }
}
