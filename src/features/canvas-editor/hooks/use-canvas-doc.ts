'use client'

import { useCallback, useState } from 'react'
import type {
  CanvasBackgroundRef,
  CanvasBackgroundTransform,
  CanvasDoc,
  CanvasElement,
  CanvasScrim,
  CanvasTextLayer,
} from '@/types/canvas'

const UNDO_CAP = 50

interface DocHistory {
  past: CanvasDoc[]
  present: CanvasDoc | null
  future: CanvasDoc[]
}

/**
 * Canvas-doc editing state: layer/scrim mutations with an undo/redo snapshot stack (docs are small
 * plain JSON) and a dirty flag relative to the last loaded/saved doc.
 */
export function useCanvasDoc() {
  const [history, setHistory] = useState<DocHistory>({ past: [], present: null, future: [] })
  const [savedDoc, setSavedDoc] = useState<CanvasDoc | null>(null)

  const initDoc = useCallback((doc: CanvasDoc) => {
    setSavedDoc(doc)
    setHistory({ past: [], present: doc, future: [] })
  }, [])

  const commit = useCallback((mutate: (doc: CanvasDoc) => CanvasDoc) => {
    setHistory((h) => {
      if (!h.present) return h
      const next = mutate(h.present)
      if (next === h.present) return h
      return { past: [...h.past.slice(-UNDO_CAP + 1), h.present], present: next, future: [] }
    })
  }, [])

  const updateLayer = useCallback(
    (id: string, patch: Partial<CanvasTextLayer>) =>
      commit((doc) => ({
        ...doc,
        layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
      })),
    [commit]
  )

  const addLayer = useCallback(
    (layer: CanvasTextLayer) => commit((doc) => ({ ...doc, layers: [...doc.layers, layer] })),
    [commit]
  )

  const removeLayer = useCallback(
    (id: string) => commit((doc) => ({ ...doc, layers: doc.layers.filter((layer) => layer.id !== id) })),
    [commit]
  )

  const setScrim = useCallback(
    (patch: Partial<CanvasScrim>) => commit((doc) => ({ ...doc, scrim: { ...doc.scrim, ...patch } })),
    [commit]
  )

  const setBackgroundTransform = useCallback(
    (transform: CanvasBackgroundTransform | undefined) =>
      commit((doc) => ({ ...doc, backgroundTransform: transform })),
    [commit]
  )

  // Inpaint rebinds the clean background in place; the crop stays valid (same dimensions).
  const setBackground = useCallback(
    (background: CanvasBackgroundRef) => commit((doc) => ({ ...doc, background })),
    [commit]
  )

  const updateElement = useCallback(
    (id: string, patch: Partial<CanvasElement>) =>
      commit((doc) => ({
        ...doc,
        elements: (doc.elements ?? []).map((element) => (element.id === id ? { ...element, ...patch } : element)),
      })),
    [commit]
  )

  const addElement = useCallback(
    (element: CanvasElement) =>
      commit((doc) => ({ ...doc, elements: [...(doc.elements ?? []), element] })),
    [commit]
  )

  const removeElement = useCallback(
    (id: string) =>
      commit((doc) => ({ ...doc, elements: (doc.elements ?? []).filter((element) => element.id !== id) })),
    [commit]
  )

  // Promote a placed element to the slide background: reuse its stored image as the background ref,
  // clear the crop so the new image cover-fits fresh, and drop the now-redundant element — one undo
  // step. The displaced background file is collected by the save PUT's stale-background cleanup.
  const setElementAsBackground = useCallback(
    (id: string) =>
      commit((doc) => {
        const element = (doc.elements ?? []).find((candidate) => candidate.id === id)
        if (!element) return doc
        return {
          ...doc,
          background: element.src,
          backgroundTransform: undefined,
          elements: (doc.elements ?? []).filter((candidate) => candidate.id !== id),
        }
      }),
    [commit]
  )

  // Swap with the neighbour — array order IS the z-order within the element band.
  const moveElement = useCallback(
    (id: string, direction: 'up' | 'down') =>
      commit((doc) => {
        const elements = [...(doc.elements ?? [])]
        const index = elements.findIndex((element) => element.id === id)
        const target = direction === 'up' ? index + 1 : index - 1
        if (index < 0 || target < 0 || target >= elements.length) return doc
        const a = elements[index]!
        elements[index] = elements[target]!
        elements[target] = a
        return { ...doc, elements }
      }),
    [commit]
  )

  const undo = useCallback(() => {
    setHistory((h) => {
      const previous = h.past[h.past.length - 1]
      if (!previous || !h.present) return h
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((h) => {
      const next = h.future[0]
      if (!next || !h.present) return h
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) }
    })
  }, [])

  return {
    doc: history.present,
    initDoc,
    updateLayer,
    addLayer,
    removeLayer,
    updateElement,
    addElement,
    removeElement,
    setElementAsBackground,
    moveElement,
    setScrim,
    setBackgroundTransform,
    setBackground,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    dirty: history.present !== null && history.present !== savedDoc,
  }
}
