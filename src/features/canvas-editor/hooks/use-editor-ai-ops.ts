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
  inpaintAsset,
  isolateSubjectAsset,
  uploadElementAsset,
} from '../lib/asset-client'
import {
  borderRegion,
  buildEditMask,
  compositeEditedRegion,
  elementStrokeRegion,
  strokeRegion,
} from '../lib/build-inpaint-mask'
import { buildPaddedBackground } from '../lib/outpaint'
import {
  cutoutFromLasso,
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
import { TYPICAL_SECONDS, type EditorJobs, type JobHandle } from './use-editor-jobs'
import type { EditorModeState } from './use-editor-mode'
import type { EditorSelection } from './use-editor-selection'

/** Stable empty list so a slide with no candidates does not re-render the panel on every pass. */
const NO_CANDIDATES: AssetRef[] = []

/** What the model is told to paint into an outpaint's new border. */
const EXPAND_PROMPT =
  'extend the existing scene outward naturally, continuing the same subject, colours, lighting and style to the edges'

interface EditorAiOps {
  /**
   * The busy flags a control reads to disable itself.
   *
   * Every one is DERIVED from the job registry rather than held beside it. They used to be eight
   * separate `useState` booleans, which meant "is a repair running" had two possible answers the
   * moment the tray needed the same fact.
   */
  inpainting: boolean
  lassoCutting: boolean
  erasing: boolean
  removingBackground: boolean
  /** A model-backed repair of the selected picture is running. */
  repairing: boolean
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
  /** Repaint the brushed zone of the SELECTED picture; the prompt says what belongs there. */
  repairSelectedNode: (promptOverride?: string) => Promise<void>
  removeSelectedNodeBackground: () => Promise<void>
  isolateSubject: () => Promise<void>
  generateSvg: (prompt: string) => Promise<void>
}

interface AiOpsInput {
  target: EditorTarget
  /** Everything the editor is waiting on. Each op below reports into it for its whole life. */
  jobs: EditorJobs
  /** Jump to a slide — what a finished job's toast offers when you have moved on since. */
  goToSlide: (position: number) => void
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
  jobs,
  goToSlide,
  activePosition,
  slideCopy,
  docState,
  selection,
  modeState,
  backgroundImage,
  canAddNode,
}: AiOpsInput): EditorAiOps {
  const [candidatesBySlide, setCandidatesBySlide] = useState<Map<number, AssetRef[]>>(new Map())
  // One slot: the UI offers a single generate button, and a second press while one is in flight is
  // a mis-click, not a request for two.
  const backgroundAbortRef = useRef<AbortController | null>(null)
  // A generation outlives the editor if nothing stops it — abandon the response on unmount.
  useEffect(() => () => backgroundAbortRef.current?.abort(), [])
  /**
   * A re-entry latch for the one op whose job starts late.
   *
   * Not a second source of "is it running" — nothing renders from this. It closes the gap between
   * the click and the job, which every other op has closed by registering immediately.
   */
  const cuttingOutRef = useRef(false)

  const { strokes, inpaintPrompt, clearStrokes, exitMode } = modeState

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

  /**
   * What a finished job says, and where.
   *
   * Naming the slide is the whole point: a 45s job outlives your attention on one slide, and
   * "Picture updated" is useless once you have moved — it does not say updated WHERE. When you are
   * still on the slide it landed on, the plain sentence is enough and the offer would be noise.
   */
  const announceDone = useCallback(
    (message: string, slide: number) => {
      if (livePosition.current === slide) {
        toast.success(message)
        return
      }
      toast.success(`Slide ${slide + 1}: ${message}`, {
        action: { label: 'Show me', onClick: () => goToSlide(slide) },
      })
    },
    [goToSlide]
  )

  /**
   * What every cut-out has to say for itself.
   *
   * A cut-out lands PIXEL-EXACT over the subject it was cut from — deliberately, so it can be
   * composited without hunting for its old position. The cost is that it is invisible on arrival: it
   * is an identical copy of what is behind it. Every edit to it then reads as a no-op, because
   * rubbing a hole in it reveals the same pixels and taking its background off leaves the same
   * picture. Two separate sessions were spent concluding the tools were broken.
   *
   * So the toast offers the way out it took us that long to find: cover the picture, and the cut-out
   * becomes the only thing on the slide. One undo step, and declining it costs nothing.
   */
  const announceCutout = useCallback(() => {
    // Says where the cut-out IS, and claims nothing about what it contains. "Subject cut out" was a
    // verdict the toast is in no position to reach — the lasso fires this too, and a cut that came
    // back holding the wrong object announced itself as a success.
    toast.success(
      'Cut-out placed exactly over the original — that is why nothing looks different',
      {
        action: {
          label: 'Hide the picture',
          onClick: () => docState.setBackdrop({ enabled: true }),
        },
      }
    )
  }, [docState])

  const applyInpaint = useCallback(
    async (promptOverride?: string) => {
      const prompt = (promptOverride ?? inpaintPrompt).trim()
      if (!docState.doc || !backgroundImage || strokes.length === 0 || !prompt) return
      if (jobs.running('inpaint')) return
      const position = activePosition
      const { background, backgroundTransform, canvas } = docState.doc
      const src = naturalSize(backgroundImage)
      const job = jobs.start({
        kind: 'inpaint',
        label: 'Repair or replace a zone',
        slide: position,
        typicalSeconds: TYPICAL_SECONDS.inpaint,
      })
      try {
        const region = strokeRegion(strokes, src, canvas, backgroundTransform)
        const mask = await buildEditMask(src, region)
        const rawRef = await inpaintAsset({
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
        // Thrown away rather than committed: the user discarded this while it ran, and landing it
        // now would be the editor overruling them a minute after the fact.
        if (job.discarded()) return
        // Rebind the clean background in place; undo brings the previous one back (its file
        // survives until save, when the PUT's stale-background cleanup collects it).
        docState.setBackground(ref)
        ifStillOn(position, clearStrokes)
        // Not "Backdrop updated": that word now names the slide's colour layer in the toolbar, and
        // this changed the picture.
        announceDone('Picture updated', position)
      } catch (err) {
        if (!job.discarded()) toast.error(err instanceof Error ? err.message : 'Inpainting failed')
      } finally {
        job.finish()
      }
    },
    [
      docState,
      backgroundImage,
      strokes,
      inpaintPrompt,
      jobs,
      target,
      activePosition,
      clearStrokes,
      ifStillOn,
      announceDone,
    ]
  )

  const lassoCut = useCallback(
    async (loopPoints: number[]) => {
      if (!docState.doc || !backgroundImage || jobs.running('lasso')) return
      if (!canAddNode()) return
      const position = activePosition
      const { backgroundTransform, canvas } = docState.doc
      const src = naturalSize(backgroundImage)
      const job = jobs.start({
        kind: 'lasso',
        label: 'Lasso something out',
        slide: position,
        typicalSeconds: TYPICAL_SECONDS.lasso,
      })
      try {
        // Geometry only, on this machine: the loop is clipped out of the background and colours
        // matching its own edge are keyed away. No model, so no second-guessing what was drawn —
        // "Cut out the subject" is where the model gets to choose an object.
        const cut = await cutoutFromLasso(
          backgroundImage,
          loopPoints,
          src,
          canvas,
          backgroundTransform
        )
        if (!cut) {
          toast.error('Draw a bigger loop around the object')
          return
        }
        const ref = await uploadElementAsset(
          target,
          new File([cut.blob], 'lasso-cutout.png', { type: 'image/png' })
        )
        const node = createNodeAtRect(
          ref,
          sourceRectToCanvas(cut.bbox, src, canvas, backgroundTransform)
        )
        if (job.discarded()) return
        docState.addNode(node)
        // The same pixel-exact placement, and so the same illusion — a loop cut lands on top of
        // what it was cut from just as the whole-subject one does.
        announceCutout()
        ifStillOn(position, () => {
          exitMode()
          selection.selectOnly(node.id)
        })
      } catch (err) {
        if (!job.discarded()) toast.error(err instanceof Error ? err.message : 'Lasso cut failed')
      } finally {
        job.finish()
      }
    },
    [
      docState,
      backgroundImage,
      jobs,
      target,
      activePosition,
      canAddNode,
      exitMode,
      selection,
      ifStillOn,
      announceCutout,
    ]
  )

  // The placed asset the erase/remove-background actions operate on. Both are bitmap edits, so a
  // selected text node is not a target for them.
  const selectedAsset = useCallback(() => {
    const node = docState.doc?.nodes.find((candidate) => candidate.id === selection.primaryId)
    return node && isImageNode(node) ? node : undefined
  }, [docState.doc, selection.primaryId])

  const applyErase = useCallback(async () => {
    if (!docState.doc || strokes.length === 0 || jobs.running('erase')) return
    const node = selectedAsset()
    // Says so rather than returning quietly. The eraser works ON a selected picture and keeps that
    // selection when the mode opens — but a mode entered from a text layer, or after the picture
    // was deleted, left a painted stroke and an Apply that did nothing and explained nothing.
    if (!node) {
      toast.error('Select the picture you want to rub out first')
      return
    }
    const position = activePosition
    const job = jobs.start({
      kind: 'erase',
      label: 'Rub out parts',
      slide: position,
      typicalSeconds: TYPICAL_SECONDS.erase,
    })
    try {
      const bitmap = await loadCrossOriginImage(node.src.publicUrl)
      const blob = await eraseStrokesFromElement(bitmap, strokes, node)
      const ref = await uploadElementAsset(
        target,
        new File([blob], 'erased.png', { type: 'image/png' })
      )
      if (job.discarded()) return
      // Geometry stays (holes, not a re-trim) — one undo step brings the previous bitmap back.
      docState.updateNode<CanvasImageNode>(node.id, { src: ref })
      ifStillOn(position, clearStrokes)
      // Confirmed in words, because the hole may not be visible: over a cut-out still sitting on
      // its original, what shows through the gap is an identical copy of what was rubbed away.
      announceDone('Rubbed out — whatever sits behind the picture now shows through', position)
    } catch (err) {
      if (!job.discarded()) toast.error(err instanceof Error ? err.message : 'Erase failed')
    } finally {
      job.finish()
    }
  }, [
    docState,
    strokes,
    jobs,
    selectedAsset,
    target,
    activePosition,
    clearStrokes,
    ifStillOn,
    announceDone,
  ])

  /**
   * Repaint a brushed zone of the SELECTED PICTURE — "Repair or replace a zone", aimed at a cut-out
   * instead of the slide's background.
   *
   * Every step is the background repair's step, in the element's own pixel space instead of the
   * background's cropped space: mask the zone, let the model regenerate, composite its output back
   * inside that zone only. Same route, same model, same guarantee that nothing outside the zone
   * moves.
   *
   * Two things differ, and both are the transparency:
   *   · the composite writes PNG, so the transparent pixels OUTSIDE the zone stay transparent (jpeg
   *     would flatten a cut-out's surroundings to black);
   *   · INSIDE the zone the model's output is opaque, because gpt-image returns no alpha. Painting
   *     past the subject's edge therefore fills that part of the zone with whatever the model
   *     invented. That is deliberate — it is what makes "repair the missing corner" possible — and
   *     it is why the hint says to keep the brush inside the picture.
   */
  const repairSelectedNode = useCallback(
    async (promptOverride?: string) => {
      const prompt = (promptOverride ?? inpaintPrompt).trim()
      if (!docState.doc || strokes.length === 0 || !prompt || jobs.running('repair')) return
      const node = selectedAsset()
      if (!node) {
        toast.error('Select the picture you want to repair first')
        return
      }
      const position = activePosition
      const job = jobs.start({
        kind: 'repair',
        label: 'Repair a zone',
        slide: position,
        typicalSeconds: TYPICAL_SECONDS.repair,
      })
      try {
        const bitmap = await loadCrossOriginImage(node.src.publicUrl)
        const natural = naturalSize(bitmap)
        const region = elementStrokeRegion(strokes, node, natural)
        const mask = await buildEditMask(natural, region)
        const rawRef = await inpaintAsset({
          target,
          storagePath: node.src.storagePath,
          prompt,
          mask,
          width: natural.width,
          height: natural.height,
        })
        const edited = await loadCrossOriginImage(rawRef.publicUrl)
        const composite = await compositeEditedRegion(bitmap, edited, natural, region, {
          type: 'image/png',
        })
        const ref = await uploadElementAsset(
          target,
          new File([composite], 'repaired.png', { type: 'image/png' })
        )
        if (job.discarded()) return
        // Same dimensions in, same dimensions out, so the node's box still frames it exactly — the
        // repair cannot move or resize the picture, only change what is inside the painted zone.
        docState.updateNode<CanvasImageNode>(node.id, { src: ref, kind: 'image' })
        ifStillOn(position, clearStrokes)
        announceDone('Picture repaired', position)
      } catch (err) {
        if (!job.discarded()) toast.error(err instanceof Error ? err.message : 'Repair failed')
      } finally {
        job.finish()
      }
    },
    [
      docState,
      inpaintPrompt,
      strokes,
      jobs,
      selectedAsset,
      target,
      activePosition,
      clearStrokes,
      ifStillOn,
      announceDone,
    ]
  )

  /**
   * Take the background off the selected picture, by whichever of the two methods can.
   *
   * The cheap one first: a colour key that deletes everything matching the picture's border. It is
   * instant and free, and it is the RIGHT answer for the generated SVGs it was written for — art on
   * one uniform colour. It is helpless against a photograph, where the background is a thousand
   * colours, so that case falls through to the same matting model the rail's "Isolate subject" runs
   * on the slide background. One model call, only when the free pass has already failed.
   *
   * A picture that is already cut out is neither: it is finished, and it says so rather than
   * spending ten seconds re-cutting what has no background left.
   */
  const removeSelectedNodeBackground = useCallback(async () => {
    // Two guards, because this op has a window the registry cannot see. Its job is registered late,
    // only if the free colour key fails and the model is needed — so between the first click and
    // that point, `running('cutout')` is false and a second click would start a whole second run,
    // uploading twice and swapping the node's picture twice.
    if (!docState.doc || jobs.running('cutout') || cuttingOutRef.current) return
    const node = selectedAsset()
    if (!node) {
      toast.error('Select a picture first')
      return
    }
    cuttingOutRef.current = true
    let aiJob: JobHandle | null = null
    try {
      const bitmap = await loadCrossOriginImage(node.src.publicUrl)
      const keyed = await removeElementBackground(bitmap)
      if (keyed.status === 'already-cutout') {
        toast.info('This picture is already cut out — there is no background left on it')
        return
      }

      let ref: AssetRef
      if (keyed.status === 'keyed') {
        ref = await uploadElementAsset(
          target,
          new File([keyed.blob], 'keyed.png', { type: 'image/png' })
        )
      } else {
        // Said out loud: the wait that follows is the difference between the two methods, and a
        // button that is instant on one picture and slow on the next looks broken without it.
        toast.info('No flat colour behind this one — cutting the subject out with AI')
        // The job is registered HERE, not at the top: the colour key above is local and instant, and
        // a tray row that appears and vanishes inside 200ms is noise pretending to be information.
        aiJob = jobs.start({
          kind: 'cutout',
          label: 'Cut out subject',
          slide: activePosition,
          typicalSeconds: TYPICAL_SECONDS.cutout,
        })
        // Used as it comes back, deliberately UNTRIMMED. The matte keeps the picture's own frame
        // and aspect, so swapping it in leaves the subject exactly where it sits on the slide —
        // same as the keyed path. Trimming would hug the box to the subject, which means computing
        // a new rect through the node's scale and rotation to keep it from jumping; the rail's
        // "Isolate subject" does that because it is PLACING a new picture, not replacing one.
        ref = await isolateSubjectAsset(target, node.src.storagePath)
      }
      if (aiJob?.discarded()) return
      // An SVG that needed rasterized keying is a bitmap from here on.
      docState.updateNode<CanvasImageNode>(node.id, { src: ref, kind: 'image' })
      // Same reason the eraser says so: this picture may be sitting on the very image it was cut
      // from, in which case dropping its background changes nothing anybody can see.
      announceCutout()
    } catch (err) {
      if (!aiJob?.discarded()) {
        toast.error(err instanceof Error ? err.message : 'Background removal failed')
      }
    } finally {
      cuttingOutRef.current = false
      aiJob?.finish()
    }
  }, [docState, jobs, activePosition, selectedAsset, target, announceCutout])

  const isolateSubject = useCallback(async () => {
    if (!docState.doc || jobs.running('isolate')) return
    if (!canAddNode()) return
    const { background, backgroundTransform, canvas } = docState.doc
    const job = jobs.start({
      kind: 'isolate',
      label: 'Cut out the subject',
      slide: activePosition,
      typicalSeconds: TYPICAL_SECONDS.isolate,
    })
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
      if (job.discarded()) return
      docState.addNode(node)
      selection.selectOnly(node.id)
      announceCutout()
    } catch (err) {
      if (!job.discarded()) {
        toast.error(err instanceof Error ? err.message : 'Subject isolation failed')
      }
    } finally {
      job.finish()
    }
  }, [docState, target, jobs, activePosition, canAddNode, selection, announceCutout])

  const generateSvg = useCallback(
    async (prompt: string) => {
      if (!docState.doc || jobs.running('vector')) return
      if (!canAddNode()) return
      const { canvas } = docState.doc
      const job = jobs.start({
        kind: 'vector',
        label: 'Draw a vector',
        slide: activePosition,
        typicalSeconds: TYPICAL_SECONDS.vector,
      })
      try {
        const asset = await generateSvgAsset(target, prompt)
        const node = createCenteredNode(
          'svg',
          { publicUrl: asset.publicUrl, storagePath: asset.storagePath },
          { width: asset.width, height: asset.height },
          canvas
        )
        if (job.discarded()) return
        docState.addNode(node)
        selection.selectOnly(node.id)
      } catch (err) {
        if (!job.discarded()) {
          toast.error(err instanceof Error ? err.message : 'Vector generation failed')
        }
      } finally {
        job.finish()
      }
    },
    [docState, jobs, activePosition, target, canAddNode, selection]
  )

  const expandBackground = useCallback(async () => {
    if (!docState.doc || !backgroundImage || jobs.running('expand')) return
    const src = naturalSize(backgroundImage)
    const frame = paddedFrame(src, docState.doc.canvas)
    if (!isFrameGrown(frame)) {
      toast.info('This picture is already as large as the model will paint')
      return
    }
    const position = activePosition
    const job = jobs.start({
      kind: 'expand',
      label: 'Expand the picture',
      slide: position,
      typicalSeconds: TYPICAL_SECONDS.expand,
    })
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
      const rawRef = await inpaintAsset({
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
      if (job.discarded()) return
      // Through the shared rebind: the crop MUST reset, because the whole point of the operation
      // is to show the user the border they just paid for.
      docState.transformDoc((doc) => rebindDocToImage(doc, ref))
      announceDone('Picture expanded', position)
    } catch (err) {
      if (!job.discarded()) {
        toast.error(err instanceof Error ? err.message : 'Expanding the picture failed')
      }
    } finally {
      job.finish()
    }
  }, [docState, backgroundImage, jobs, activePosition, target, announceDone])

  const generateBackground = useCallback(
    async (direction?: string) => {
      if (!docState.doc || jobs.running('generate')) return
      // Pinned at the start: the user is free to go and work on another slide while this runs, and
      // the picture they asked for has to come back to the slide they asked from.
      const position = activePosition
      const controller = new AbortController()
      backgroundAbortRef.current = controller
      // The only op that can do more than ignore its answer: it owns the request, so discarding it
      // aborts the fetch as well. Everything else can only decline to use what comes back.
      const job = jobs.start({
        kind: 'generate',
        label: 'New picture',
        slide: position,
        typicalSeconds: TYPICAL_SECONDS.generate,
        onDiscard: () => controller.abort(),
      })
      try {
        const ref = await generateBackgroundAsset({
          target,
          slideCopy,
          ...(direction?.trim() ? { direction: direction.trim() } : {}),
          signal: controller.signal,
        })
        if (job.discarded()) return
        setCandidatesBySlide((current) =>
          new Map(current).set(position, [...(current.get(position) ?? []), ref])
        )
        // Only worth announcing from another slide: on this one the tile appearing in the grid IS
        // the announcement, and a toast on top of it says the same thing twice.
        if (livePosition.current !== position) {
          announceDone('A new picture is ready to pick', position)
        }
      } catch (err) {
        // A discard rejects the fetch too; that is the user's own doing, not a failure to report.
        if (!controller.signal.aborted && !job.discarded()) {
          toast.error(err instanceof Error ? err.message : 'Background generation failed')
        }
      } finally {
        backgroundAbortRef.current = null
        job.finish()
      }
    },
    [docState.doc, jobs, activePosition, target, slideCopy, announceDone]
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
    inpainting: jobs.running('inpaint'),
    lassoCutting: jobs.running('lasso'),
    erasing: jobs.running('erase'),
    removingBackground: jobs.running('cutout'),
    isolating: jobs.running('isolate'),
    generatingSvg: jobs.running('vector'),
    // Per-slide, because a generation belongs to the slide that asked for it: its pending tile
    // waits in that slide's grid, and the rail's activity dot answers for any slide at all.
    generatingBackground: jobs.jobs.some(
      (job) => job.kind === 'generate' && job.slide === activePosition
    ),
    generatingAnySlide: jobs.running('generate'),
    expanding: jobs.running('expand'),
    expandBackground,
    candidates: candidatesBySlide.get(activePosition) ?? NO_CANDIDATES,
    generateBackground,
    cancelBackground,
    pickCandidate,
    applyInpaint,
    lassoCut,
    applyErase,
    repairing: jobs.running('repair'),
    repairSelectedNode,
    removeSelectedNodeBackground,
    isolateSubject,
    generateSvg,
  }
}
