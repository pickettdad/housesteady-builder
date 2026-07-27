/**
 * Preparing a photograph for a model to read.
 *
 * THE ORIENTATION PROBLEM, WHICH IS NOT OPTIONAL.
 *
 * Phone cameras almost never rotate the pixels. They write the sensor's native
 * landscape frame and set an EXIF Orientation tag saying which way is up.
 * Viewers honour the tag, which is why the photos look upright everywhere a
 * person looks at them. Reading the raw bytes does not, which is why a model
 * reading those same bytes sees the plate on its side.
 *
 * Twelve of the fifteen reference nameplates carry Orientation 6 and one carries
 * 3. Feeding them unrotated would turn a legibility test into an accidental test
 * of reading sideways text — and every abstention in the golden set would then
 * be measuring the wrong thing while looking exactly like model weakness.
 *
 * `sharp().rotate()` with no argument applies the tag and strips it, so the
 * pixels afterwards are upright and unambiguous. It is one call and it is
 * unconditional: there is no case where sending a knowingly-sideways plate is
 * the right thing to do.
 *
 * WHAT THIS DOES NOT FIX, AND CANNOT. EXIF describes how the camera was held.
 * It says nothing about a label mounted sideways on a pipe, a plate photographed
 * at an angle, or one occupying a tenth of the frame. Those stay the model's
 * problem — which is the right place for them, because they are perception
 * problems rather than metadata problems, and a vision model handles rotated
 * text within an upright frame far better than it handles an upside-down world.
 *
 * DOWNSCALING IS THE OTHER HALF, AND IT COSTS LEGIBILITY. Every model has a
 * longest-edge limit and silently downscales anything larger. Silent is the
 * problem: a plate's small text stops being readable and the abstention that
 * follows looks like the model failing when it is the pipeline throwing the
 * pixels away. So the resize happens here, deliberately, and the dimensions
 * actually sent are recorded on the generation.
 */

import sharp from 'sharp'

export interface PreparedImage {
  /** JPEG bytes, EXIF-normalised and within the model's limit. */
  data: Buffer
  mediaType: 'image/jpeg'
  /** What the model actually sees. Recorded so a poor read can be explained. */
  width: number
  height: number
  /** What was on disk, before any of this. */
  sourceWidth: number
  sourceHeight: number
  /** The EXIF tag that was applied, if any. 1 or absent means nothing to do. */
  appliedOrientation: number | null
  /** True when the image was larger than the model's limit and had to shrink. */
  downscaled: boolean
}

export class ImageRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ImageRefused'
  }
}

/**
 * Normalise a photograph for a model call.
 *
 * @param maxEdge longest edge the model accepts. Larger images are downscaled
 *   here rather than server-side, so the loss is ours and is recorded.
 */
export async function prepareImage(path: string, maxEdge: number): Promise<PreparedImage> {
  let meta: sharp.Metadata
  try {
    meta = await sharp(path).metadata()
  } catch (e) {
    throw new ImageRefused(
      `Could not read ${path} as an image: ${(e as Error).message}`,
      'image.unreadable',
    )
  }

  const orientation = meta.orientation ?? null
  const sourceWidth = meta.width ?? 0
  const sourceHeight = meta.height ?? 0
  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new ImageRefused(`${path} has no readable dimensions.`, 'image.no-dimensions')
  }

  // Orientation 5–8 swap the axes: a 4032x3024 landscape file is a 3024x4032
  // portrait image once the tag is applied. Getting this backwards would make
  // the downscale decision on the wrong edge.
  const swaps = orientation !== null && orientation >= 5 && orientation <= 8
  const uprightWidth = swaps ? sourceHeight : sourceWidth
  const uprightHeight = swaps ? sourceWidth : sourceHeight
  const longest = Math.max(uprightWidth, uprightHeight)
  const downscaled = longest > maxEdge

  // .rotate() with no argument applies the EXIF tag. Unconditional on purpose —
  // it is a no-op on an untagged image, and the one call is cheaper than the
  // branch plus the bug in the branch.
  let pipeline = sharp(path).rotate()
  if (downscaled) {
    pipeline = pipeline.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
  }

  // Quality 90 rather than the default 80. This is the one place in the build
  // where JPEG artefacts land on the thing being read — a worn serial and a
  // compression artefact look alike at the character level, and the extra bytes
  // cost far less than a misread digit.
  const { data, info } = await pipeline.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true })

  return {
    data,
    mediaType: 'image/jpeg',
    width: info.width,
    height: info.height,
    sourceWidth,
    sourceHeight,
    appliedOrientation: orientation !== null && orientation > 1 ? orientation : null,
    downscaled,
  }
}

/**
 * A plain-words note about what was done to the image, for the provenance line.
 *
 * The concierge should be able to see that a plate was shrunk before it was
 * read, because that is a real reason a read might be poor and it is not the
 * model's fault. "Not inspected" and "inspected badly" are different claims.
 */
export function imageNote(p: PreparedImage): string {
  const parts: string[] = []
  if (p.appliedOrientation !== null) parts.push('turned upright from its camera orientation')
  if (p.downscaled) {
    parts.push(`shrunk from ${Math.max(p.sourceWidth, p.sourceHeight)}px to ${Math.max(p.width, p.height)}px`)
  }
  return parts.length === 0 ? 'sent as photographed' : parts.join(', ')
}
