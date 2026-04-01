'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  message: string
  type: ToastType
}

type ToastHandler = (message: string) => void

interface ToastAPI {
  success: ToastHandler
  error: ToastHandler
  info: ToastHandler
  warning: ToastHandler
}

// Global event bus
const listeners: Array<(toast: Toast) => void> = []

function emit(toast: Toast) {
  listeners.forEach((fn) => fn(toast))
}

export const toast: ToastAPI = {
  success: (message) => emit({ id: crypto.randomUUID(), message, type: 'success' }),
  error: (message) => emit({ id: crypto.randomUUID(), message, type: 'error' }),
  info: (message) => emit({ id: crypto.randomUUID(), message, type: 'info' }),
  warning: (message) => emit({ id: crypto.randomUUID(), message, type: 'warning' }),
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />,
  error: <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />,
  info: <Info className="h-5 w-5 text-blue-600 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />,
}

const styles: Record<ToastType, string> = {
  success: 'border-green-200 bg-green-50',
  error: 'border-red-200 bg-red-50',
  info: 'border-blue-200 bg-blue-50',
  warning: 'border-amber-200 bg-amber-50',
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg border shadow-md text-sm text-gray-800 w-80 max-w-full',
        styles[toast.type]
      )}
    >
      {icons[toast.type]}
      <p className="flex-1">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    function handleToast(t: Toast) {
      setToasts((prev) => [...prev, t])
    }
    listeners.push(handleToast)
    return () => {
      const idx = listeners.indexOf(handleToast)
      if (idx > -1) listeners.splice(idx, 1)
    }
  }, [])

  function remove(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={remove} />
      ))}
    </div>
  )
}
