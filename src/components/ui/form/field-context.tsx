'use client'

import { createContext, useContext } from 'react'

export interface FieldContextValue {
  /** Id the label points at; the control adopts it. */
  controlId: string
  /** Space-separated ids of the hint and/or error text, or undefined when there is neither. */
  describedBy: string | undefined
  invalid: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

export const FieldProvider = FieldContext.Provider

/**
 * Lets a control pick up the id and `aria-describedby` of the `Field` wrapping it.
 *
 * A context rather than `cloneElement`: the control may be nested inside an affix wrapper or any
 * other layout, and cloning only reaches a direct child. Returns null outside a `Field`, so the
 * primitives still work standalone.
 */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext)
}
