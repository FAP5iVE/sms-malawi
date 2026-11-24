/**
 * packages/shared/constants/signature.ts
 *
 * [CHANGE TYPE]: NEW FILE (phase 17, digital signature)
 * [PURPOSE]: What counts as a usable signature image. The "My signature" screen checks the file before
 *   it is sent and the server checks it again from the file's own bytes, with this one rule.
 */

export const SIGNATURE_MAX_BYTES = 200 * 1024
export const SIGNATURE_MIN_WIDTH = 120
export const SIGNATURE_MAX_WIDTH = 1600
export const SIGNATURE_MIN_HEIGHT = 40
export const SIGNATURE_MAX_HEIGHT = 800
/** Wide enough for a signature, never a square photo or a thin strip. */
export const SIGNATURE_MIN_RATIO = 1.5
export const SIGNATURE_MAX_RATIO = 8

export const SIGNATURE_TYPES = ['image/png', 'image/jpeg'] as const

/** The first thing wrong with an image, in plain words, or null when it can be used. */
export function signatureProblem(img: { bytes: number; width: number; height: number }): string | null {
  if (img.bytes === 0) return 'The file is empty.'
  if (img.bytes > SIGNATURE_MAX_BYTES) return `The image is larger than ${SIGNATURE_MAX_BYTES / 1024} KB. Crop it or save it at a smaller size.`
  if (img.width < SIGNATURE_MIN_WIDTH || img.height < SIGNATURE_MIN_HEIGHT) {
    return `The image is too small. It must be at least ${SIGNATURE_MIN_WIDTH} by ${SIGNATURE_MIN_HEIGHT} pixels.`
  }
  if (img.width > SIGNATURE_MAX_WIDTH || img.height > SIGNATURE_MAX_HEIGHT) {
    return `The image is too large. It must be at most ${SIGNATURE_MAX_WIDTH} by ${SIGNATURE_MAX_HEIGHT} pixels.`
  }
  const ratio = img.width / img.height
  if (ratio < SIGNATURE_MIN_RATIO || ratio > SIGNATURE_MAX_RATIO) return 'Crop the image to the signature only, wider than it is tall.'
  return null
}
