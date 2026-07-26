import { useEffect, useRef } from 'react'
import { imageFileFromTransfer, imageUrlFromTransfer } from '../lib/clipboard-image'

interface PasteImageHandlers {
  onFile: (file: File) => void
  onUrl: (url: string) => void
}

/** Add an image to the editor when the user pastes one (image bytes or a URL) with Cmd/Ctrl+V. */
export function usePasteImage(handlers: PasteImageHandlers) {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      // Leave native paste alone while typing (inline-edit textarea, panel inputs).
      if (target && ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName)) return
      const data = event.clipboardData
      if (!data) return

      const file = imageFileFromTransfer(data)
      if (file) {
        event.preventDefault()
        ref.current.onFile(file)
        return
      }
      const url = imageUrlFromTransfer(data)
      if (url) {
        event.preventDefault()
        ref.current.onUrl(url)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])
}
