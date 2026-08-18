import { describe, expect, it } from 'vitest'
import { GraphApiError, classifyGraphError, isRetryableFailure } from '../graph-errors'

const shape = (over: Partial<Parameters<typeof classifyGraphError>[0]>) => ({
  httpStatus: 400,
  code: null,
  subcode: null,
  type: null,
  message: 'x',
  fbtraceId: null,
  ...over,
})

describe('classifyGraphError', () => {
  it('maps the invalid-token family to token_invalid', () => {
    for (const code of [102, 190, 463, 467]) {
      expect(classifyGraphError(shape({ code }))).toBe('token_invalid')
    }
  })

  it('maps permission codes to permission', () => {
    for (const code of [3, 10, 200]) {
      expect(classifyGraphError(shape({ code }))).toBe('permission')
    }
  })

  it('maps throttling codes and HTTP 429 to rate_limited', () => {
    for (const code of [4, 17, 32, 613]) {
      expect(classifyGraphError(shape({ code }))).toBe('rate_limited')
    }
    expect(classifyGraphError(shape({ httpStatus: 429 }))).toBe('rate_limited')
  })

  it('maps 9004 and the 2207xxx media family to media_invalid', () => {
    expect(classifyGraphError(shape({ code: 9004 }))).toBe('media_invalid')
    expect(classifyGraphError(shape({ code: 2207026 }))).toBe('media_invalid')
    // Neighbouring ranges stay out of the family.
    expect(classifyGraphError(shape({ code: 2206999 }))).toBe('permanent')
    expect(classifyGraphError(shape({ code: 2208000 }))).toBe('permanent')
  })

  it('reads 5xx and codes 1/2 as transient, everything else as permanent', () => {
    expect(classifyGraphError(shape({ httpStatus: 500 }))).toBe('transient')
    expect(classifyGraphError(shape({ code: 1 }))).toBe('transient')
    expect(classifyGraphError(shape({ code: 2 }))).toBe('transient')
    expect(classifyGraphError(shape({ code: 100 }))).toBe('permanent')
    expect(classifyGraphError(shape({}))).toBe('permanent')
  })

  it('classifies by code before HTTP status — a 500 carrying 190 is a dead token', () => {
    expect(classifyGraphError(shape({ httpStatus: 500, code: 190 }))).toBe('token_invalid')
  })
})

describe('isRetryableFailure', () => {
  it('retries only transient and rate_limited', () => {
    expect(isRetryableFailure('transient')).toBe(true)
    expect(isRetryableFailure('rate_limited')).toBe(true)
    expect(isRetryableFailure('token_invalid')).toBe(false)
    expect(isRetryableFailure('permission')).toBe(false)
    expect(isRetryableFailure('media_invalid')).toBe(false)
    expect(isRetryableFailure('permanent')).toBe(false)
  })
})

describe('GraphApiError', () => {
  it('carries its classification and message', () => {
    const err = new GraphApiError(shape({ code: 190, message: 'Error validating access token' }))
    expect(err.failure).toBe('token_invalid')
    expect(err.message).toBe('Error validating access token')
    expect(err.name).toBe('GraphApiError')
  })
})
