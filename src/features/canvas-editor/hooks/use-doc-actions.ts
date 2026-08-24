'use client'

import { useCallback } from 'react'
import {
  addNodeToDoc,
  duplicateNodesInDoc,
  findNode,
  isImageNode,
  isLocked,
  moveNodeInDoc,
  nudgeNodesInDoc,
  placeNodesInDoc,
  removeNodesFromDoc,
  reorderNodeInDoc,
  unlockedIds,
  updateNodeInDoc,
} from '@/lib/canvas/doc-nodes'
import { rebindDocToImage } from '@/lib/canvas/resolve-doc'
import type {
  CanvasBackdrop,
  CanvasBackgroundRef,
  CanvasBackgroundTransform,
  CanvasDoc,
  CanvasNode,
} from '@/types/canvas'
import type { CommitOptions } from '../lib/doc-history'

/**
 * Apply a mutation to the doc being edited and record it on that doc's undo history. Continuous
 * gestures (slider drags, arrow-key repeats) pass a coalesce key so the whole gesture is one step.
 */
export type TransformDoc = (mutate: (doc: CanvasDoc) => CanvasDoc, options?: CommitOptions) => void

interface DocActions {
  transformDoc: TransformDoc
  /** Patch one node. Callers name the node's kind so a text field cannot land on an image. */
  updateNode: <T extends CanvasNode>(id: string, patch: Partial<T>, options?: CommitOptions) => void
  addNode: (node: CanvasNode) => void
  setNodeAsBackground: (id: string) => void
  removeNodes: (ids: string[]) => void
  /** Step a node through the stacking order (`toEdge` sends it to the very front/back). */
  moveNode: (id: string, direction: 'up' | 'down', toEdge?: boolean) => void
  /** Drop a node at an exact stack position — the layers panel's drag-reorder. */
  reorderNode: (id: string, toIndex: number) => void
  /** Arrow-key move. One held key run folds into a single undo step. */
  nudgeNodes: (ids: string[], dx: number, dy: number) => void
  /** Land a finished drag: every node in the gesture moves in one undo step. */
  placeNodes: (placements: Array<{ id: string; x: number; y: number }>) => void
  /** Copy nodes just above their originals; returns the new ids so the caller can select them. */
  duplicateNodes: (ids: string[]) => string[]
  setBackdrop: (patch: Partial<CanvasBackdrop>, options?: CommitOptions) => void
  setBackgroundTransform: (
    transform: CanvasBackgroundTransform | undefined,
    options?: CommitOptions
  ) => void
  setBackground: (background: CanvasBackgroundRef) => void
}

/**
 * The doc being edited plus every way to change it. The ops hooks and the stage take this rather
 * than the whole slides state, so nothing below the shell can see which slide it is working on.
 */
export interface EditorDocState extends DocActions {
  doc: CanvasDoc | null
}

/**
 * Every node and backdrop mutation the editor offers, expressed against a supplied `transformDoc`.
 *
 * It takes the history operations rather than owning them because the editor holds one history PER
 * SLIDE: the same action set has to drive whichever slide is active, and an owned `useState` here
 * would make "which doc does this edit" a second answer competing with the slide strip's.
 */
export function useDocActions(doc: CanvasDoc | null, transformDoc: TransformDoc): DocActions {
  const updateNode = useCallback(
    <T extends CanvasNode>(id: string, patch: Partial<T>, options?: CommitOptions) =>
      transformDoc((current) => updateNodeInDoc<T>(current, id, patch), options),
    [transformDoc]
  )

  const addNode = useCallback(
    (node: CanvasNode) => transformDoc((current) => addNodeToDoc(current, node)),
    [transformDoc]
  )

  const setBackdrop = useCallback(
    (patch: Partial<CanvasBackdrop>, options?: CommitOptions) =>
      transformDoc(
        (current) => ({ ...current, backdrop: { ...current.backdrop, ...patch } }),
        options
      ),
    [transformDoc]
  )

  const setBackgroundTransform = useCallback(
    (transform: CanvasBackgroundTransform | undefined, options?: CommitOptions) =>
      transformDoc((current) => ({ ...current, backgroundTransform: transform }), options),
    [transformDoc]
  )

  // Inpaint rebinds the clean background in place; the crop stays valid (same dimensions).
  const setBackground = useCallback(
    (background: CanvasBackgroundRef) => transformDoc((current) => ({ ...current, background })),
    [transformDoc]
  )

  // Promote a placed asset to the slide background: reuse its stored image as the background ref,
  // clear the crop so the new image cover-fits fresh, and drop the now-redundant node — one undo
  // step. The displaced background file is collected by the save PUT's stale-background cleanup.
  //
  // A mirrored node is refused rather than promoted: the flip lives on the node, the background is
  // a bare file ref with no orientation of its own, so promoting one would silently un-mirror the
  // picture. Carrying it properly means baking the mirror into a new upload — async work that does
  // not belong in a doc reducer. See TECH-DEBT §2.12.
  const setNodeAsBackground = useCallback(
    (id: string) =>
      transformDoc((current) => {
        const node = findNode(current, id)
        if (!node || !isImageNode(node) || isLocked(node)) return current
        if (node.flipX || node.flipY) return current
        // Through the shared rebind rule, not a hand-spelling of it — adopting the image and
        // dropping the crop measured against the old one is one decision, defined once.
        return {
          ...rebindDocToImage(current, node.src),
          nodes: current.nodes.filter((candidate) => candidate.id !== id),
        }
      }),
    [transformDoc]
  )

  /**
   * Delete whichever kind of node the ids name — one undo step for the whole selection.
   *
   * Locked nodes are filtered out here rather than at each call site: Delete, the toolbar bin and
   * the layers row all land on this one function. `updateNode` deliberately has NO such guard —
   * unlocking a node is itself an update.
   */
  const removeNodes = useCallback(
    (ids: string[]) =>
      transformDoc((current) => removeNodesFromDoc(current, unlockedIds(current, ids))),
    [transformDoc]
  )

  const moveNode = useCallback(
    (id: string, direction: 'up' | 'down', toEdge = false) =>
      transformDoc((current) => moveNodeInDoc(current, id, direction, toEdge)),
    [transformDoc]
  )

  const nudgeNodes = useCallback(
    (ids: string[], dx: number, dy: number) =>
      transformDoc((current) => nudgeNodesInDoc(current, unlockedIds(current, ids), dx, dy), {
        coalesceKey: `nudge:${ids.join(',')}`,
      }),
    [transformDoc]
  )

  const placeNodes = useCallback(
    (placements: Array<{ id: string; x: number; y: number }>) =>
      transformDoc((current) =>
        placeNodesInDoc(
          current,
          placements.filter((placement) => {
            const node = findNode(current, placement.id)
            return node !== null && !isLocked(node)
          })
        )
      ),
    [transformDoc]
  )

  const reorderNode = useCallback(
    (id: string, toIndex: number) =>
      transformDoc((current) => reorderNodeInDoc(current, id, toIndex)),
    [transformDoc]
  )

  const duplicateNodes = useCallback(
    (ids: string[]): string[] => {
      // Ids are decided before dispatching so the caller can select the copies; the mutation still
      // runs against the freshest doc.
      const newIdFor = new Map(ids.map((id) => [id, crypto.randomUUID()]))
      if (!doc) return []
      const { ids: created } = duplicateNodesInDoc(doc, newIdFor)
      if (created.length === 0) return []
      transformDoc((current) => duplicateNodesInDoc(current, newIdFor).doc)
      return created
    },
    [doc, transformDoc]
  )

  return {
    transformDoc,
    updateNode,
    addNode,
    setNodeAsBackground,
    removeNodes,
    moveNode,
    reorderNode,
    nudgeNodes,
    placeNodes,
    duplicateNodes,
    setBackdrop,
    setBackgroundTransform,
    setBackground,
  }
}
