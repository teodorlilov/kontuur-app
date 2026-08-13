'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * The three things all four auth views do identically: track per-field errors,
 * carry the server's answer, and point at whatever the visitor needs to fix.
 *
 * `initialError` seeds the form-level line — it is how a message from
 * /auth/callback reaches the dialog it redirected into.
 */
export function useAuthForm<Field extends string>(initialError?: string) {
  const formRef = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(initialError ?? null)
  const [submitting, setSubmitting] = useState(false)

  /**
   * Restarting a CSS animation takes removing the class, reading a layout
   * property to force the reflow, then adding it back. A React `key` would do
   * it too, but only by remounting the fields — which drops the caret out of
   * the one the visitor is in the middle of fixing.
   */
  const shake = useCallback(() => {
    const form = formRef.current
    if (!form) return
    form.classList.remove('shake')
    void form.offsetWidth
    form.classList.add('shake')
  }, [])

  /** Applies field errors. Returns true when there were none and submit may proceed. */
  const checkFields = useCallback(
    (next: Partial<Record<Field, string>>) => {
      const clean = Object.keys(next).length === 0
      setErrors(next)
      if (!clean) {
        setFormError(null)
        shake()
      }
      return clean
    },
    [shake]
  )

  /** Surfaces a server error on the form and draws the eye back to it. */
  const rejectWith = useCallback(
    (message: string) => {
      setFormError(message)
      setSubmitting(false)
      shake()
    },
    [shake]
  )

  return {
    formRef,
    errors,
    formError,
    submitting,
    setSubmitting,
    setFormError,
    checkFields,
    rejectWith,
  }
}
