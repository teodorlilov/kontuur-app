'use client'

import { useCallback, useState } from 'react'
import type { CanvasDoc, CanvasScrim, CanvasTextLayer } from '@/types/canvas'

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
    setScrim,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    dirty: history.present !== null && history.present !== savedDoc,
  }
}
