'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { isImageNode } from '@/lib/canvas/doc-nodes'
import { isFrameGrown, paddedFrame } from '@/lib/canvas/outpaint-geometry'
import { createCenteredNode, createNodeAtRect } from '@/lib/canvas/elements'
import { sourceRectToCanvas } from '@/lib/canvas/reposition'
import {
  generateBackgroundAsset,
  generateSvgAsset,
  inpaintBackgroundAsset,
  isolateSubjectAsset,
  uploadElementAsset,
} from '../lib/asset-client'
import {
  borderRegion,
  buildEditMask,
  compositeEditedRegion,
  strokeRegion,
} from '../lib/build-inpaint-mask'
import { buildPaddedBackground } from '../lib/outpaint'
import {
  cutoutFromLasso,
  cutoutFromLassoDetect,
  eraseStrokesFromElement,
  removeElementBackground,
  trimTransparentEdges,
} from '../lib/cutout'
import { loadCrossOriginImage, naturalSize } from '../lib/load-image'
import type { CanvasImageNode } from '@/types/canvas'
import type { AssetRef } from '../lib/asset-client'
import { rebindDocToImage } from '@/lib/canvas/resolve-doc'
import type { EditorTarget, SlideCopy } from '../types'
import type { EditorDocState } from './use-doc-actions'
import type { EditorModeState } from './use-editor-mode'
import type { EditorSelection } from './use-editor-selection'

/** Stable empty list so a slide with no candidates does not re-render the panel on every pass. */
const NO_CANDIDATES: AssetRef[] = []

/** What the model is told to paint into an outpaint's new border. */
const EXPAND_PROMPT =
  'extend the existing scene outward naturally, continuing the same subject, colours, lighting and style to the edges'

interface EditorAiOps {
  inpainting: boolean
  lassoCutting: boolean
  erasing: boolean
  removingBackground: boolean
  isolating: boolean
  generatingSvg: boolean
  /** A generation is running FOR THE ACTIVE SLIDE — what the panel's pending tile waits on. */
  generatingBackground: boolean
  /** A generation is running for some slide — what the rail's activity dot answers to. */
  generatingAnySlide: boolean
  expanding: boolean
  /** Grow the picture past its current frame, generating the new border. */
  expandBackground: () => Promise<void>
  /** Backgrounds generated for the ACTIVE slide, newest last. Kept until the editor closes. */
  candidates: AssetRef[]
  /** Generate one more candidate. `direction` is optional art direction the user typed. */
  generateBackground: (direction?: string) => Promise<void>
  /** Abandon the in-flight generation. The server keeps working; the result is orphaned. */
  cancelBackground: () => void
  /** Adopt a candidate as the slide's clean background — one undo step. */
  pickCandidate: (ref: AssetRef) => void
  /** Repaint the brushed region; an override prompt powers the "Remove object" preset. */
  applyInpaint: (promptOverride?: string) => Promise<void>
  lassoCut: (loopPoints: number[]) => Promise<void>
  applyErase: () => Promise<void>
  removeSelectedNodeBackground: () => Promise<void>
  isolateSubject: () => Promise<void>
  generateSvg: (prompt: string) => Promise<void>
}

interface AiOpsInput {
  target: EditorTarget
  /** Which slide the user is on — a generated candidate belongs to the slide that asked for it. */
  activePosition: number
  /** The copy the editor is showing — travels with a generate request; the server has no row to read. */
  slideCopy: SlideCopy | null
  docState: EditorDocState
  selection: EditorSelection
  modeState: EditorModeState
  backgroundImage: HTMLImageElement | null
  canAddNode: () => boolean
}

/**
 * Every model-backed edit the canvas offers. Each one round-trips a server route and lands as a
 * stored asset, so the doc only ever holds refs; each is also its own undo step.
 */
export function useEditorAiOps({
  target,
  activePosition,
  slideCopy,
  docState,
  selection,
  modeState,
  backgroundImage,
  canAddNode,
}: AiOpsInput): EditorAiOps {
  const [inpainting, setInpainting] = useState(false)
  const [lassoCutting, setLassoCutting] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [removingBackground, setRemovingBackground] = useState(false)
  const [isolating, setIsolating] = useState(false)
  const [generatingSvg, setGeneratingSvg] = useState(false)
  // Which slide a generation is running for, rather than a bare flag: a 52s job outlives the user's
  // attention on one slide, and its pending tile belongs where its result will land.
  const [generatingFor, setGeneratingFor] = useState<number | null>(null)
  const [expanding, setExpanding] = useState(false)
  const [candidatesBySlide, setCandidatesBySlide] = useState<Map<number, AssetRef[]>>(new Map())
  // One slot: the UI offers a single generate button, and a second press while one is in flight is
  // a mis-click, not a request for two.
  const backgroundAbortRef = useRef<AbortController | null>(null)
  // A generation outlives the editor if nothing stops it — abandon the response on unmount.
  useEffect(() => () => backgroundAbortRef.current?.abort(), [])

  const { strokes, inpaintPrompt, lassoDetect, clearStrokes, exitMode } = modeState

  // The slide the user is on RIGHT NOW, as opposed to the one an op closed over when it started.
  //
  // A finished op still commits its DOC to its own slide — that binding travels in the closure. But
  // its side effects on the SCREEN (dropping the strokes, leaving the tool) act on whatever is in
  // front of the user, and after a 45s inpaint that can be a different slide with a half-drawn mask
  // on it. So those are gated on still being where the op began.
  const livePosition = useRef(activePosition)
  useEffect(() => {
    livePosition.current = activePosition
  }, [activePosition])
  const ifStillOn = useCallback((position: number, effect: () => void) => {
    if (livePosition.current === position) effect()
  }, [])

  const applyInpaint = useCallback(
    async (promptOverride?: string) => {
      const prompt = (promptOverride ?? inpaintPrompt).trim()
      if (!docState.doc || !backgroundImage || strokes.length === 0 || !prompt || inpainting) return
      const position = activePosition
      const { background, backgroundTransform, canvas } = docState.doc
      const src = naturalSize(backgroundImage)
      setInpainting(true)
      try {
        const region = strokeRegion(strokes, src, canvas, backgroundTransform)
        const mask = await buildEditMask(src, region)
        const rawRef = await inpaintBackgroundAsset({
          target,
          storagePath: background.storagePath,
          prompt,
          mask,
          width: src.width,
          height: src.height,
        })
        // The model regenerates globally — composite its output back into the original so only
        // the painted region actually changes, then store THAT as the new clean background.
        const edited = await loadCrossOriginImage(rawRef.publicUrl)
        const composite = await compositeEditedRegion(backgroundImage, edited, src, region)
        const ref = await uploadElementAsset(
          target,
          new File([composite], 'inpainted.jpg', { type: 'image/jpeg' })
        )
        // Rebind the clean background in place; undo brings the previous one back (its file
        // survives until save, when the PUT's stale-background cleanup collects it).
        docState.setBackground(ref)
        ifStillOn(position, clearStrokes)
        toast.success('Backdrop updated')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Inpainting failed')
      } finally {
        setInpainting(false)
      }
    },
    [
      docState,
      backgroundImage,
      strokes,
      inpaintPrompt,
      inpainting,
      target,
      activePosition,
      clearStrokes,
      ifStillOn,
    ]
  )

  const lassoCut = useCallback(
    async (loopPoints: number[]) => {
      if (!docState.doc || !backgroundImage || lassoCutting) return
      if (!canAddNode()) return
      const position = activePosition
      const { backgroundTransform, canvas } = docState.doc
      const src = naturalSize(backgroundImage)
      setLassoCutting(true)
      try {
        // AI-detect: matte the loop's cropped region with the existing BiRefNet, clipped by the
        // loop. Any failure (or an empty matte) falls back to the pure geometric cut.
        let cut = lassoDetect
          ? await cutoutFromLassoDetect(
              backgroundImage,
              loopPoints,
              src,
              canvas,
              backgroundTransform,
              async (regionBlob) => {
                const regionRef = await uploadElementAsset(
                  target,
                  new File([regionBlob], 'lasso-region.png', { type: 'image/png' })
                )
                const matteRef = await isolateSubjectAsset(target, regionRef.storagePath)
                return loadCrossOriginImage(matteRef.publicUrl)
              }
            ).catch(() => null)
          : null
        // Say so when the AI pass did not land: identical gestures otherwise produce visibly
        // different quality with nothing to explain why.
        const detectFailed = lassoDetect && !cut
        cut ??= await cutoutFromLasso(backgroundImage, loopPoints, src, canvas, backgroundTransform)
        if (!cut) {
          toast.error('Draw a bigger loop around the object')
          return
        }
        if (detectFailed) toast.info('Object detection did not land — used the outline you drew')
        const ref = await uploadElementAsset(
          target,
          new File([cut.blob], 'lasso-cutout.png', { type: 'image/png' })
        )
        const node = createNodeAtRect(
          ref,
          sourceRectToCanvas(cut.bbox, src, canvas, backgroundTransform)
        )
        docState.addNode(node)
        ifStillOn(position, () => {
          exitMode()
          selection.selectOnly(node.id)
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Lasso cut failed')
      } finally {
        setLassoCutting(false)
      }
    },
    [
      docState,
      backgroundImage,
      lassoCutting,
      lassoDetect,
      target,
      activePosition,
      canAddNode,
      exitMode,
      selection,
      ifStillOn,
    ]
  )

  // The placed asset the erase/remove-background actions operate on. Both are bitmap edits, so a
  // selected text node is not a target for them.
  const selectedAsset = useCallback(() => {
    const node = docState.doc?.nodes.find((candidate) => candidate.id === selection.primaryId)
    return node && isImageNode(node) ? node : undefined
  }, [docState.doc, selection.primaryId])

  const applyErase = useCallback(async () => {
    if (!docState.doc || strokes.length === 0 || erasing) return
    const node = selectedAsset()
    if (!node) return
    const position = activePosition
    setErasing(true)
    try {
      const bitmap = await loadCrossOriginImage(node.src.publicUrl)
      const blob = await eraseStrokesFromElement(bitmap, strokes, node)
      const ref = await uploadElementAsset(
        target,
        new File([blob], 'erased.png', { type: 'image/png' })
      )
      // Geometry stays (holes, not a re-trim) — one undo step brings the previous bitmap back.
      docState.updateNode<CanvasImageNode>(node.id, { src: ref })
      ifStillOn(position, clearStrokes)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erase failed')
    } finally {
      setErasing(false)
    }
  }, [
    docState,
    strokes,
    erasing,
    selectedAsset,
    target,
    activePosition,
    clearStrokes,
    ifStillOn,
  ])

  const removeSelectedNodeBackground = useCallback(async () => {
    if (!docState.doc || removingBackground) return
    const node = selectedAsset()
    if (!node) return
    setRemovingBackground(true)
    try {
      const bitmap = await loadCrossOriginImage(node.src.publicUrl)
      const blob = await removeElementBackground(bitmap)
      if (!blob) {
        toast.error('No flat background detected on this element')
        return
      }
      const ref = await uploadElementAsset(
        target,
        new File([blob], 'keyed.png', { type: 'image/png' })
      )
      // An SVG that needed rasterized keying is a bitmap from here on.
      docState.updateNode<CanvasImageNode>(node.id, { src: ref, kind: 'image' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Background removal failed')
    } finally {
      setRemovingBackground(false)
    }
  }, [docState, removingBackground, selectedAsset, target])

  const isolateSubject = useCallback(async () => {
    if (!docState.doc || isolating) return
    if (!canAddNode()) return
    const { background, backgroundTransform, canvas } = docState.doc
    setIsolating(true)
    try {
      const fullRef = await isolateSubjectAsset(target, background.storagePath)
      const fullCutout = await loadCrossOriginImage(fullRef.publicUrl)
      // Trim to the subject so the element (and its resize handles) hugs the object instead of
      // spanning the whole frame; the bbox then lands pixel-exact through the inverse crop.
      const trimmed = await trimTransparentEdges(fullCutout)
      if (!trimmed) {
        toast.error('No subject found in this image')
        return
      }
      const ref = await uploadElementAsset(
        target,
        new File([trimmed.blob], 'cutout.png', { type: 'image/png' })
      )
      const node = createNodeAtRect(
        ref,
        sourceRectToCanvas(trimmed.bbox, naturalSize(fullCutout), canvas, backgroundTransform)
      )
      docState.addNode(node)
      selection.selectOnly(node.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Subject isolation failed')
    } finally {
      setIsolating(false)
    }
  }, [docState, target, isolating, canAddNode, selection])

  const generateSvg = useCallback(
    async (prompt: string) => {
      if (!docState.doc || generatingSvg) return
      if (!canAddNode()) return
      const { canvas } = docState.doc
      setGeneratingSvg(true)
      try {
        const asset = await generateSvgAsset(target, prompt)
        const node = createCenteredNode(
          'svg',
          { publicUrl: asset.publicUrl, storagePath: asset.storagePath },
          { width: asset.width, height: asset.height },
          canvas
        )
        docState.addNode(node)
        selection.selectOnly(node.id)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Vector generation failed')
      } finally {
        setGeneratingSvg(false)
      }
    },
    [docState, generatingSvg, target, canAddNode, selection]
  )

  const expandBackground = useCallback(async () => {
    if (!docState.doc || !backgroundImage || expanding) return
    const src = naturalSize(backgroundImage)
    const frame = paddedFrame(src, docState.doc.canvas)
    if (!isFrameGrown(frame)) {
      toast.info('This picture is already as large as the model will paint')
      return
    }
    setExpanding(true)
    try {
      // The model needs a real file to edit, so the padded intermediate is uploaded before the
      // call. It is never referenced by the doc — TECH-DEBT §2.8 accepts it as an orphan.
      const padded = await buildPaddedBackground(backgroundImage, frame)
      const paddedRef = await uploadElementAsset(
        target,
        new File([padded.blob], 'padded.jpg', { type: 'image/jpeg' })
      )
      const region = borderRegion(frame)
      const mask = await buildEditMask(frame, region)
      const rawRef = await inpaintBackgroundAsset({
        target,
        storagePath: paddedRef.storagePath,
        prompt: EXPAND_PROMPT,
        mask,
        // Already on-grid, so the route's own rounding is a no-op and the mask cannot shift.
        width: frame.width,
        height: frame.height,
      })
      const edited = await loadCrossOriginImage(rawRef.publicUrl)
      const composite = await compositeEditedRegion(padded.canvas, edited, frame, region)
      const ref = await uploadElementAsset(
        target,
        new File([composite], 'expanded.jpg', { type: 'image/jpeg' })
      )
      // Through the shared rebind: the crop MUST reset, because the whole point of the operation
      // is to show the user the border they just paid for.
      docState.transformDoc((doc) => rebindDocToImage(doc, ref))
      toast.success('Picture expanded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Expanding the picture failed')
    } finally {
      setExpanding(false)
    }
  }, [docState, backgroundImage, expanding, target])

  const generateBackground = useCallback(
    async (direction?: string) => {
      if (!docState.doc || generatingFor !== null) return
      // Pinned at the start: the user is free to go and work on another slide while this runs, and
      // the picture they asked for has to come back to the slide they asked from.
      const position = activePosition
      const controller = new AbortController()
      backgroundAbortRef.current = controller
      setGeneratingFor(position)
      try {
        const ref = await generateBackgroundAsset({
          target,
          slideCopy,
          ...(direction?.trim() ? { direction: direction.trim() } : {}),
          signal: controller.signal,
        })
        setCandidatesBySlide((current) =>
          new Map(current).set(position, [...(current.get(position) ?? []), ref])
        )
      } catch (err) {
        // A cancel rejects the fetch too; that is the user's own doing, not a failure to report.
        if (!controller.signal.aborted) {
          toast.error(err instanceof Error ? err.message : 'Background generation failed')
        }
      } finally {
        backgroundAbortRef.current = null
        setGeneratingFor(null)
      }
    },
    [docState.doc, generatingFor, activePosition, target, slideCopy]
  )

  const cancelBackground = useCallback(() => backgroundAbortRef.current?.abort(), [])

  /** The same single-commit rebind every other background swap uses — adopting the image and
   *  dropping the crop measured against the old one must never be separable by undo. */
  const pickCandidate = useCallback(
    (ref: AssetRef) => {
      docState.transformDoc((doc) => rebindDocToImage(doc, ref))
      selection.clear()
    },
    [docState, selection]
  )

  return {
    inpainting,
    lassoCutting,
    erasing,
    removingBackground,
    isolating,
    generatingSvg,
    generatingBackground: generatingFor === activePosition,
    generatingAnySlide: generatingFor !== null,
    expanding,
    expandBackground,
    candidates: candidatesBySlide.get(activePosition) ?? NO_CANDIDATES,
    generateBackground,
    cancelBackground,
    pickCandidate,
    applyInpaint,
    lassoCut,
    applyErase,
    removeSelectedNodeBackground,
    isolateSubject,
    generateSvg,
  }
}
