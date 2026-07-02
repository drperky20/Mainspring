import { describe, expect, it } from 'vitest'
import { artifactPresentation } from './artifactPresentation'

describe('artifactPresentation', () => {
  it('allows inline image preview for safe raster image media types', () => {
    expect(
      artifactPresentation({
        mediaType: 'image/png',
        kind: 'image',
      }),
    ).toEqual({
      previewKind: 'image',
      previewLabel: 'Preview image',
      hint: 'Inline image preview is available in the console.',
    })
  })

  it('allows inline text preview for plain text, markdown, and json', () => {
    expect(
      artifactPresentation({
        mediaType: 'text/markdown',
        kind: 'report',
      }),
    ).toEqual({
      previewKind: 'text',
      previewLabel: 'Preview document',
      hint: 'Preview opens raw document content in a browser-safe inline frame.',
    })
  })

  it('allows inline pdf, audio, and video preview for safe media types', () => {
    expect(
      artifactPresentation({
        mediaType: 'application/pdf',
        kind: 'report',
      }),
    ).toEqual({
      previewKind: 'pdf',
      previewLabel: 'Preview PDF',
      hint: 'Preview opens PDF content in a browser-safe inline frame.',
    })

    expect(
      artifactPresentation({
        mediaType: 'audio/mpeg',
        kind: 'recording',
      }),
    ).toEqual({
      previewKind: 'audio',
      previewLabel: 'Preview audio',
      hint: 'Preview uses the browser audio player without exposing host paths.',
    })

    expect(
      artifactPresentation({
        mediaType: 'video/mp4',
        kind: 'capture',
      }),
    ).toEqual({
      previewKind: 'video',
      previewLabel: 'Preview video',
      hint: 'Preview uses the browser video player without exposing host paths.',
    })
  })

  it('refuses embedded preview for other or riskier browser types', () => {
    expect(
      artifactPresentation({
        mediaType: 'text/html',
        kind: 'report',
      }),
    ).toEqual({
      previewKind: 'none',
      previewLabel: 'Open file',
      hint: 'Preview is not embedded for this media type. Open or download the artifact instead.',
    })

    expect(
      artifactPresentation({
        mediaType: 'image/svg+xml',
        kind: 'vector',
      }),
    ).toEqual({
      previewKind: 'none',
      previewLabel: 'Open file',
      hint: 'Preview is not embedded for this media type. Open or download the artifact instead.',
    })
  })
})
