import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS, validateShareableComposition } from '@/lib/scene-graph'
import { Composition } from '../Composition'
import { REFERENCE_COMPOSITIONS, REFERENCE_MARKS } from '../reference-compositions'

const entries = Object.entries(REFERENCE_COMPOSITIONS)

describe('reference compositions', () => {
  it('covers the five roles', () => {
    expect(Object.keys(REFERENCE_COMPOSITIONS).sort()).toEqual(['cover', 'cta', 'list', 'quote', 'statement'])
  })

  it.each(entries)('%s is a valid shareable composition (no hex, no literal family)', (_role, composition) => {
    expect(validateShareableComposition(composition)).toEqual([])
  })

  it.each(entries)('%s renders without throwing — every token binding resolves', (_role, composition) => {
    expect(() =>
      renderToStaticMarkup(createElement(Composition, { composition, tokens: DEFAULT_TOKENS, marks: REFERENCE_MARKS }))
    ).not.toThrow()
  })
})
