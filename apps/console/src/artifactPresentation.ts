export interface ArtifactPresentation {
  previewKind: 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'none'
  previewLabel: string
  hint: string
}

export function artifactPresentation(input: {
  mediaType?: string
  kind: string
}): ArtifactPresentation {
  const mediaType = input.mediaType?.toLowerCase().trim()

  if (mediaType && isPreviewableImage(mediaType)) {
    return {
      previewKind: 'image',
      previewLabel: 'Preview image',
      hint: 'Inline image preview is available in the console.',
    }
  }

  if (mediaType && isPreviewableText(mediaType)) {
    return {
      previewKind: 'text',
      previewLabel: 'Preview document',
      hint: 'Preview opens raw document content in a browser-safe inline frame.',
    }
  }

  if (mediaType === 'application/pdf') {
    return {
      previewKind: 'pdf',
      previewLabel: 'Preview PDF',
      hint: 'Preview opens PDF content in a browser-safe inline frame.',
    }
  }

  if (mediaType && isPreviewableAudio(mediaType)) {
    return {
      previewKind: 'audio',
      previewLabel: 'Preview audio',
      hint: 'Preview uses the browser audio player without exposing host paths.',
    }
  }

  if (mediaType && isPreviewableVideo(mediaType)) {
    return {
      previewKind: 'video',
      previewLabel: 'Preview video',
      hint: 'Preview uses the browser video player without exposing host paths.',
    }
  }

  return {
    previewKind: 'none',
    previewLabel: input.kind === 'image' ? 'Open artifact' : 'Open file',
    hint: 'Preview is not embedded for this media type. Open or download the artifact instead.',
  }
}

function isPreviewableImage(mediaType: string): boolean {
  return (
    mediaType === 'image/png'
    || mediaType === 'image/jpeg'
    || mediaType === 'image/gif'
    || mediaType === 'image/webp'
  )
}

function isPreviewableText(mediaType: string): boolean {
  return (
    mediaType === 'text/plain'
    || mediaType === 'text/markdown'
    || mediaType === 'application/json'
  )
}

function isPreviewableAudio(mediaType: string): boolean {
  return (
    mediaType === 'audio/mpeg'
    || mediaType === 'audio/mp3'
    || mediaType === 'audio/wav'
    || mediaType === 'audio/ogg'
    || mediaType === 'audio/webm'
  )
}

function isPreviewableVideo(mediaType: string): boolean {
  return (
    mediaType === 'video/mp4'
    || mediaType === 'video/webm'
    || mediaType === 'video/ogg'
  )
}
