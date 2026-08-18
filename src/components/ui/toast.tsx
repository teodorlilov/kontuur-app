// Re-exports sonner's `toast` — 40+ call sites use toast.success / .error / .info / .warning
// through this one import path. The `Toaster as ToastProvider` alias that used to sit here
// had no importers: app/layout.tsx mounts `Toaster` from sonner directly.
export { toast } from 'sonner'
