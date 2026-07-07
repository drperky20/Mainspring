import type { CompiledContextPrompt, ContextPromptPart, RecoverableContextStore } from './types.js'
import type { ContextProviderPayload } from './ContextProviderPayload.js'
import {
  serializeContextPromptForProvider,
  type SerializedContextImage,
} from './ContextProviderPayload.js'
import type { ContextRenderArtifact } from './ContextRenderer.js'
import { ContextRendererRegistry } from './ContextRenderer.js'

export interface RenderedContextPromptImage {
  part: Extract<ContextPromptPart, { type: 'image' }>
  artifact: ContextRenderArtifact
  dataUri: string
}

export interface RenderedContextProviderBundle {
  compiled: CompiledContextPrompt
  payload: ContextProviderPayload
  renderedImages: RenderedContextPromptImage[]
}

function imageKey(part: Extract<ContextPromptPart, { type: 'image' }>): string {
  return [
    part.blockId,
    part.recoverableId,
    part.projection.canary,
    part.projection.pageNumber ?? 1,
    part.projection.pageCount ?? 1,
  ].join('\u0000')
}

function dataUriFor(artifact: ContextRenderArtifact): string {
  return `data:${artifact.mediaType};base64,${Buffer.from(artifact.bytes).toString('base64')}`
}

export async function renderContextPromptImages(input: {
  compiled: CompiledContextPrompt
  store: RecoverableContextStore
  rendererRegistry: ContextRendererRegistry
}): Promise<RenderedContextPromptImage[]> {
  const imageParts = input.compiled.parts.filter(
    (part): part is Extract<ContextPromptPart, { type: 'image' }> => part.type === 'image',
  )
  return Promise.all(
    imageParts.map(async (part) => {
      const artifact = await input.rendererRegistry.render({
        store: input.store,
        recoverableId: part.recoverableId,
        projection: part.projection,
      })
      return {
        part,
        artifact,
        dataUri: dataUriFor(artifact),
      }
    }),
  )
}

export async function serializeRenderedContextPromptForProvider(input: {
  compiled: CompiledContextPrompt
  store: RecoverableContextStore
  rendererRegistry: ContextRendererRegistry
}): Promise<RenderedContextProviderBundle> {
  const renderedImages = await renderContextPromptImages(input)
  const byKey = new Map(renderedImages.map((image) => [imageKey(image.part), image]))
  const payload = serializeContextPromptForProvider(input.compiled, {
    imageUriFor: (part) => byKey.get(imageKey(part))?.dataUri ?? '',
    mediaTypeFor: (part) => byKey.get(imageKey(part))?.artifact.mediaType ?? 'image/png',
  })

  return {
    compiled: input.compiled,
    payload: {
      ...payload,
      imageBindings: payload.imageBindings.map((binding): SerializedContextImage => {
        const rendered = byKey.get([
          binding.blockId,
          binding.recoverableId,
          binding.projection.canary,
          binding.projection.pageNumber ?? 1,
          binding.projection.pageCount ?? 1,
        ].join('\u0000'))
        if (!rendered) return binding
        return {
          ...binding,
          mediaType: rendered.artifact.mediaType,
          uri: rendered.dataUri,
        }
      }),
    },
    renderedImages,
  }
}
