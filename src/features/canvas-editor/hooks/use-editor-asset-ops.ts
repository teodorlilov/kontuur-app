'use client'

import { useCallback, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { MAX_NODES } from '@/lib/canvas/constants'
import { createCenteredNode } from '@/lib/canvas/elements'
import { rebindDocToImage } from '@/lib/canvas/resolve-doc'
import { validateImageFile } from '@/features/publishing/lib/validate-image-file'
import type { AssetRef } from '../lib/asset-client'
import { pasteFromUrlAsset, uploadElementAsset } from '../lib/asset-client'
import { loadCrossOriginImage, naturalSize } from '../lib/load-image'
import type { EditorTarget } from '../types'
import type { EditorDocState } from './use-doc-actions'
import type { EditorSelection } from './use-editor-selection'
import { usePasteImage } from './use-paste-image'

export interface EditorAssetOps {
  uploadingAsset: boolean
  replacingBackground: boolean
  /** Room in the doc for `count` more nodes; toasts and returns false when the cap is reached. */
  canAddNode: (count?: number) => boolean
  addImageFromFile: (file: File, dropPoint?: { x: number; y: number }) => Promise<void>
  addImageFromUrl: (url: string, dropPoint?: { x: number; y: number }) => Promise<void>
  replaceBackground: (file: File) => Promise<void>
}

/** Getting pictures into the doc: uploads, pastes, drops, and swapping the slide's background. */
export function useEditorAssetOps(
  target: EditorTarget,
  docState: EditorDocState,
  selection: EditorSelection
): EditorAssetOps {
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [replacingBackground, setReplacingBackground] = useState(false)

  // Guard before any upload work so we never store bytes we can't place (no doc yet, or the
  // schema's node cap is reached). The count matters: duplicating a selection of six adds six, and
  // asking whether there is room for ONE would let the doc past the cap and fail its own save gate.
  const canAddNode = useCallback(
    (count = 1) => {
      if (!docState.doc) return false
      if (docState.doc.nodes.length + count <= MAX_NODES) return true
      toast.error(`You can add up to ${MAX_NODES} things to a slide`)
      return false
    },
    [docState.doc]
  )

  // Shared tail for every "add a picture" path: place it (at dropPoint if given, else centered)
  // and select it.
  const insertImageNode = useCallback(
    async (src: AssetRef, dropPoint?: { x: number; y: number }) => {
      if (!docState.doc) return
      const asset = await loadCrossOriginImage(src.publicUrl)
      const node = createCenteredNode('image', src, naturalSize(asset), docState.doc.canvas)
      const placed = dropPoint
        ? { ...node, x: dropPoint.x - node.width / 2, y: dropPoint.y - node.height / 2 }
        : node
      docState.addNode(placed)
      selection.selectOnly(placed.id)
    },
    [docState, selection]
  )

  const addImageFromFile = useCallback(
    async (file: File, dropPoint?: { x: number; y: number }) => {
      const fileError = validateImageFile(file)
      if (fileError) {
        toast.error(fileError)
        return
      }
      if (!canAddNode()) return
      setUploadingAsset(true)
      try {
        await insertImageNode(await uploadElementAsset(target, file), dropPoint)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Asset upload failed')
      } finally {
        setUploadingAsset(false)
      }
    },
    [target, canAddNode, insertImageNode]
  )

  const addImageFromUrl = useCallback(
    async (url: string, dropPoint?: { x: number; y: number }) => {
      if (!canAddNode()) return
      setUploadingAsset(true)
      try {
        await insertImageNode(await pasteFromUrlAsset(target, url), dropPoint)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Paste failed')
      } finally {
        setUploadingAsset(false)
      }
    },
    [target, canAddNode, insertImageNode]
  )

  // Swapping the slide's image in place: the doc keeps every node, and the crop resets because it
  // was measured against the picture being replaced.
  const replaceBackground = useCallback(
    async (file: File) => {
      const fileError = validateImageFile(file)
      if (fileError) {
        toast.error(fileError)
        return
      }
      setReplacingBackground(true)
      try {
        const ref = await uploadElementAsset(target, file)
        // One step, through the same rebind rule the compose paths use: adopting the image and
        // dropping the crop measured against the old one must never be separable by undo.
        docState.transformDoc((doc) => rebindDocToImage(doc, ref))
        selection.clear()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Replacing the image failed')
      } finally {
        setReplacingBackground(false)
      }
    },
    [target, docState, selection]
  )

  usePasteImage({
    onFile: (file) => {
      void addImageFromFile(file)
    },
    onUrl: (url) => {
      void addImageFromUrl(url)
    },
  })

  return {
    uploadingAsset,
    replacingBackground,
    canAddNode,
    addImageFromFile,
    addImageFromUrl,
    replaceBackground,
  }
}
